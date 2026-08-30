import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'
import { setStock } from '@/lib/server/inventory'
import { intFromInput, optionalString } from '@/lib/validation/common'
import type { MovementReason } from '@/lib/domain/enums'

export const dynamic = 'force-dynamic'

/**
 * Bestandspflege aus dem Lagerbereich.
 *
 * Zwei Faelle teilen sich diese Route: die Einzelzeile aus der Bestandsliste
 * und die Sammelaenderung ueber die Auswahl. Beide buchen ueber dieselbe
 * Journallogik — jede Mengenaenderung erzeugt genau einen Eintrag in
 * InventoryMovement, damit ein Bestand jederzeit herleitbar bleibt.
 *
 * Buchungen aus diesem Bereich tragen den Grund „manual“; Aenderungen, die
 * beilaeufig ueber die Produktpflege entstehen, tragen „correction“. So laesst
 * sich im Journal unterscheiden, wo eine Zahl herkommt.
 */

const MAX_STOCK = 1_000_000
const BULK_LIMIT = 200
const BULK_REASON: MovementReason = 'manual'

const noteField = optionalString(240, 'Die Notiz')

const singleSchema = z.object({
  productId: z.string().min(1, 'Der Artikel ist unbekannt.').max(64, 'Der Artikel ist unbekannt.'),
  stock: intFromInput(0, MAX_STOCK, 'Der Bestand'),
  lowStockThreshold: intFromInput(0, MAX_STOCK, 'Die Meldegrenze'),
  note: noteField,
})

const bulkSchema = z.object({
  mode: z.union([z.literal('set'), z.literal('increase'), z.literal('decrease')], {
    errorMap: () => ({ message: 'Bitte wählen Sie aus, wie der Bestand geändert werden soll.' }),
  }),
  value: intFromInput(0, MAX_STOCK, 'Der Wert'),
  productIds: z
    .array(z.string().min(1).max(64))
    .min(1, 'Bitte wählen Sie mindestens einen Artikel aus.')
    .max(BULK_LIMIT, `Es lassen sich höchstens ${BULK_LIMIT} Artikel auf einmal buchen.`),
  note: noteField,
})

type BulkMode = z.infer<typeof bulkSchema>['mode']

export async function PATCH(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('inventory:write')
    const body = await readJson(request)
    const action = (body as { action?: unknown } | null)?.action

    if (action === 'bulk') return await applyBulk(body, session.user.id)
    if (action === 'single') return await applySingle(body, session.user.id)

    return jsonError('Diese Anfrage konnte nicht zugeordnet werden. Bitte laden Sie die Seite neu.', 400)
  } catch (error) {
    return handleRouteError(error, 'admin:lager:patch')
  }
}

/** Einzelne Zeile: Bestand und Meldegrenze eines Artikels. */
async function applySingle(body: unknown, userId: string) {
  const data = singleSchema.parse(body)

  const existing = await prisma.product.findUnique({
    where: { id: data.productId },
    select: { id: true, name: true, sku: true, stock: true, lowStockThreshold: true },
  })
  if (!existing) {
    return jsonError('Dieser Artikel wurde nicht gefunden. Bitte laden Sie die Seite neu.', 404)
  }

  const stockChanged = data.stock !== existing.stock
  const thresholdChanged = data.lowStockThreshold !== existing.lowStockThreshold

  if (!stockChanged && !thresholdChanged) {
    return jsonOk({
      productId: existing.id,
      stock: existing.stock,
      lowStockThreshold: existing.lowStockThreshold,
      delta: 0,
      message: `Bei „${existing.name}“ gab es nichts zu speichern.`,
    })
  }

  const ip = await getClientIp()
  let delta = 0

  // setStock schreibt Bestand und Journaleintrag in einer Transaktion.
  if (stockChanged) {
    const result = await setStock(existing.id, data.stock, userId, data.note ?? undefined)
    delta = result.delta
    await writeAuditLog({
      userId,
      action: 'inventory.stock_set',
      entity: 'Product',
      entityId: existing.id,
      detail: { sku: existing.sku, from: existing.stock, to: data.stock, delta, note: data.note ?? null },
      ip,
    })
  }

  // Die Meldegrenze ist keine Menge und gehoert deshalb nicht ins Bestandsjournal.
  if (thresholdChanged) {
    await prisma.product.update({
      where: { id: existing.id },
      data: { lowStockThreshold: data.lowStockThreshold },
    })
    await writeAuditLog({
      userId,
      action: 'inventory.threshold_set',
      entity: 'Product',
      entityId: existing.id,
      detail: { sku: existing.sku, from: existing.lowStockThreshold, to: data.lowStockThreshold },
      ip,
    })
  }

  const parts: string[] = []
  if (stockChanged) parts.push(`Bestand ${existing.stock} → ${data.stock} (${signed(delta)})`)
  if (thresholdChanged) {
    parts.push(`Meldegrenze ${existing.lowStockThreshold} → ${data.lowStockThreshold}`)
  }

  return jsonOk({
    productId: existing.id,
    stock: data.stock,
    lowStockThreshold: data.lowStockThreshold,
    delta,
    message: `„${existing.name}“ gespeichert: ${parts.join(', ')}.`,
  })
}

/**
 * Sammelaenderung.
 *
 * Alle Buchungen laufen in einer Transaktion: Bricht eine ab, bleibt der
 * gesamte Vorgang aus. Ein halb gebuchter Zugang waere im Lager schlimmer als
 * gar keiner, weil niemand wuesste, welche Haelfte gilt.
 */
async function applyBulk(body: unknown, userId: string) {
  const data = bulkSchema.parse(body)

  if (data.mode !== 'set' && data.value < 1) {
    return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, {
      fieldErrors: { value: 'Bitte geben Sie einen Betrag ab 1 an.' },
    })
  }

  const ids = [...new Set(data.productIds)]
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, sku: true, stock: true },
  })

  if (products.length !== ids.length) {
    return jsonError(
      'Mindestens einer der ausgewählten Artikel existiert nicht mehr. Bitte laden Sie die Seite neu und wählen Sie erneut aus.',
      409,
      { code: 'product_missing' },
    )
  }

  const targets = products.map((product) => {
    const raw = nextStock(data.mode, product.stock, data.value)
    return { ...product, target: Math.max(0, raw), clamped: raw < 0 }
  })

  const overflow = targets.find((t) => t.target > MAX_STOCK)
  if (overflow) {
    return jsonError(
      `Für „${overflow.name}“ ergäbe die Buchung einen Bestand über ${MAX_STOCK.toLocaleString('de-DE')} Stück. Bitte wählen Sie einen kleineren Betrag.`,
      422,
      { fieldErrors: { value: 'Der Betrag ist für mindestens einen Artikel zu groß.' } },
    )
  }

  const changes = targets.filter((t) => t.target !== t.stock)

  if (changes.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const change of changes) {
          await tx.product.update({ where: { id: change.id }, data: { stock: change.target } })
          await tx.inventoryMovement.create({
            data: {
              productId: change.id,
              delta: change.target - change.stock,
              stockAfter: change.target,
              reason: BULK_REASON,
              note: data.note ?? null,
              userId,
            },
          })
        }
      },
      { timeout: 20_000 },
    )
  }

  const clamped = targets.filter((t) => t.clamped).length
  const unchanged = targets.length - changes.length

  await writeAuditLog({
    userId,
    action: 'inventory.bulk_adjusted',
    entity: 'Product',
    detail: {
      mode: data.mode,
      value: data.value,
      selected: targets.length,
      changed: changes.length,
      clamped,
      note: data.note ?? null,
      skus: changes.slice(0, 25).map((c) => c.sku),
    },
    ip: await getClientIp(),
  })

  const parts = [
    changes.length === 1
      ? 'Ein Artikel wurde gebucht.'
      : `${changes.length} Artikel wurden gebucht.`,
  ]
  if (unchanged > 0) {
    parts.push(
      unchanged === 1
        ? 'Ein Artikel stand bereits auf dem Zielwert.'
        : `${unchanged} Artikel standen bereits auf dem Zielwert.`,
    )
  }
  if (clamped > 0) {
    parts.push(
      clamped === 1
        ? 'Bei einem Artikel reichte der Bestand nicht aus; er steht jetzt auf 0.'
        : `Bei ${clamped} Artikeln reichte der Bestand nicht aus; sie stehen jetzt auf 0.`,
    )
  }

  return jsonOk({
    changed: changes.length,
    unchanged,
    clamped,
    message: parts.join(' '),
  })
}

function nextStock(mode: BulkMode, current: number, value: number): number {
  if (mode === 'set') return value
  return mode === 'increase' ? current + value : current - value
}

function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta)
}
