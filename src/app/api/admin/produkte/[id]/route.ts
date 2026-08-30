import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { AppError, getClientIp, handleRouteError, jsonCreated, jsonError, jsonOk, readJson } from '@/lib/server/http'
import { slugify, truncate } from '@/lib/utils/text'
import {
  productRecordFromInput,
  productSchema,
  productVisibilitySchema,
  type ProductInput,
} from '@/lib/validation/product'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Aenderungen an einem Produkt.
 *
 * Zwei Faelle teilen sich diese Route: der Schnellschalter aus der Liste
 * (nur `active`) und das vollstaendige Formular. Der Schnellschalter wird
 * zuerst geprueft, weil er das engere Schema hat.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('products:write')
    const { id } = await context.params

    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, sku: true, stock: true, active: true },
    })
    if (!existing) return jsonError('Dieses Produkt wurde nicht gefunden.', 404)

    const body = await readJson(request)
    const ip = await getClientIp()

    const visibility = productVisibilitySchema.safeParse(body)
    if (visibility.success) {
      if (visibility.data.active !== existing.active) {
        await prisma.product.update({ where: { id }, data: { active: visibility.data.active } })
        await writeAuditLog({
          userId: session.user.id,
          action: visibility.data.active ? 'product.activated' : 'product.deactivated',
          entity: 'Product',
          entityId: id,
          detail: { name: existing.name, sku: existing.sku },
          ip,
        })
      }
      return jsonOk({
        id,
        active: visibility.data.active,
        message: visibility.data.active
          ? `„${existing.name}“ ist wieder aktiv.`
          : `„${existing.name}“ ist deaktiviert und im Shop nicht mehr bestellbar.`,
      })
    }

    const data = productSchema.parse(body)

    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    })
    if (!category) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, {
        fieldErrors: { categoryId: 'Diese Kategorie existiert nicht mehr. Bitte wählen Sie eine andere.' },
      })
    }

    const conflicts = await findIdentifierConflicts(data, id)
    if (Object.keys(conflicts).length > 0) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, { fieldErrors: conflicts })
    }

    const { stock, ...record } = productRecordFromInput(data)
    const stockDelta = stock - existing.stock

    const promotionId = await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { ...record, stock } })

      // Bestandskorrekturen aus dem Formular gehoeren genauso ins Journal wie
      // Buchungen aus dem Lagerbereich — sonst fehlt die Herleitung.
      if (stockDelta !== 0) {
        await tx.inventoryMovement.create({
          data: {
            productId: id,
            delta: stockDelta,
            stockAfter: stock,
            reason: 'correction',
            note: 'Korrektur über die Produktpflege',
            userId: session.user.id,
          },
        })
      }

      return savePromotion(tx, id, data)
    })

    await writeAuditLog({
      userId: session.user.id,
      action: 'product.updated',
      entity: 'Product',
      entityId: id,
      detail: {
        name: data.name,
        sku: data.sku,
        priceCents: data.priceCents,
        stockDelta,
        active: data.active,
      },
      ip,
    })

    return jsonOk({
      id,
      promotionId,
      redirectTo: `/admin/produkte/${id}`,
      message: 'Die Änderungen wurden gespeichert.',
    })
  } catch (error) {
    return handleRouteError(error, 'admin:produkte:patch')
  }
}

/**
 * Loeschen eines Produktes.
 *
 * Produkte mit Bestellpositionen bleiben erhalten: Bestellungen sind Belege und
 * muessen auch Jahre spaeter noch auf den Artikel verweisen koennen.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('products:delete')
    const { id } = await context.params

    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, sku: true, active: true },
    })
    if (!existing) return jsonError('Dieses Produkt wurde nicht gefunden.', 404)

    const orderItemCount = await prisma.orderItem.count({ where: { productId: id } })
    if (orderItemCount > 0) {
      return jsonError(
        `„${existing.name}“ ist in ${orderItemCount} ${orderItemCount === 1 ? 'Bestellposition' : 'Bestellpositionen'} enthalten und kann deshalb nicht gelöscht werden. ` +
          'Deaktivieren Sie das Produkt stattdessen — es verschwindet dann aus dem Shop, und die Bestellungen bleiben nachvollziehbar.',
        409,
        { code: 'has_order_items' },
      )
    }

    await prisma.product.delete({ where: { id } })

    await writeAuditLog({
      userId: session.user.id,
      action: 'product.deleted',
      entity: 'Product',
      entityId: id,
      detail: { name: existing.name, sku: existing.sku },
      ip: await getClientIp(),
    })

    return jsonOk({
      redirectTo: '/admin/produkte',
      message: `„${existing.name}“ wurde gelöscht.`,
    })
  } catch (error) {
    return handleRouteError(error, 'admin:produkte:delete')
  }
}

/**
 * Duplizieren.
 *
 * Die Kopie startet inaktiv und ohne Bestand — sie soll erst nach der Pflege
 * verkauft werden. Bilder und technische Daten werden uebernommen, weil sie
 * den Grossteil der Pflegearbeit ausmachen.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('products:write')
    const { id } = await context.params

    const source = await prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        specs: { orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!source) return jsonError('Dieses Produkt wurde nicht gefunden.', 404)

    const [sku, articleNumber, slug] = await Promise.all([
      freeIdentifier(
        (n) => `${source.sku.slice(0, 42)}-K${n}`,
        async (value) => (await prisma.product.count({ where: { sku: value } })) > 0,
        'SKU',
      ),
      freeIdentifier(
        (n) => `${source.articleNumber.slice(0, 42)}-K${n}`,
        async (value) => (await prisma.product.count({ where: { articleNumber: value } })) > 0,
        'Artikelnummer',
      ),
      freeIdentifier(
        (n) => `${slugify(source.slug).slice(0, 80).replace(/-+$/, '')}-kopie-${n}`,
        async (value) => (await prisma.product.count({ where: { slug: value } })) > 0,
        'URL-Pfad',
      ),
    ])

    const copy = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          slug,
          sku,
          articleNumber,
          name: copyName(source.name),
          subtitle: source.subtitle,
          shortDescription: source.shortDescription,
          description: source.description,
          type: source.type,
          categoryId: source.categoryId,
          priceCents: source.priceCents,
          taxRateBp: source.taxRateBp,
          baseUnit: source.baseUnit,
          baseUnitAmount: source.baseUnitAmount,
          baseUnitReference: source.baseUnitReference,
          weightGrams: source.weightGrams,
          shippingWeightGrams: source.shippingWeightGrams,
          packagingUnit: source.packagingUnit,
          lengthMm: source.lengthMm,
          widthMm: source.widthMm,
          heightMm: source.heightMm,
          wireDiameterMm: source.wireDiameterMm,
          loadCapacityGrams: source.loadCapacityGrams,
          material: source.material,
          usage: source.usage,
          tipFinish: source.tipFinish,
          deliveryDaysMin: source.deliveryDaysMin,
          deliveryDaysMax: source.deliveryDaysMax,
          // Kopien starten leer und stumm: kein Bestand, nicht aktiv, nicht
          // im Shop und ohne die Verkaufshistorie des Originals.
          stock: 0,
          reservedStock: 0,
          lowStockThreshold: source.lowStockThreshold,
          allowBackorder: source.allowBackorder,
          active: false,
          visible: false,
          bestseller: false,
          popularity: 0,
          sortOrder: source.sortOrder,
          metaTitle: source.metaTitle,
          metaDescription: source.metaDescription,
        },
        select: { id: true, name: true, sku: true },
      })

      if (source.images.length > 0) {
        await tx.productImage.createMany({
          data: source.images.map((image) => ({
            productId: created.id,
            url: image.url,
            alt: image.alt,
            width: image.width,
            height: image.height,
            sortOrder: image.sortOrder,
          })),
        })
      }

      if (source.specs.length > 0) {
        await tx.productSpec.createMany({
          data: source.specs.map((spec) => ({
            productId: created.id,
            key: spec.key,
            label: spec.label,
            value: spec.value,
            group: spec.group,
            sortOrder: spec.sortOrder,
          })),
        })
      }

      return created
    })

    await writeAuditLog({
      userId: session.user.id,
      action: 'product.duplicated',
      entity: 'Product',
      entityId: copy.id,
      detail: { sourceId: id, sourceSku: source.sku, sku: copy.sku },
      ip: await getClientIp(),
    })

    return jsonCreated({
      id: copy.id,
      redirectTo: `/admin/produkte/${copy.id}`,
      message: `„${copy.name}“ wurde angelegt — inaktiv und ohne Bestand.`,
    })
  } catch (error) {
    return handleRouteError(error, 'admin:produkte:duplicate')
  }
}

/** Haengt den Zusatz an, ohne die Laengengrenze der Spalte zu sprengen. */
function copyName(name: string): string {
  const suffixed = `${name} (Kopie)`
  return suffixed.length <= 160 ? suffixed : `${truncate(name, 151)} (Kopie)`
}

/**
 * Pflegt genau die Aktion, die im Formular sichtbar war, und liefert deren Id
 * zurueck. Weitere Aktionen des Produktes bleiben unangetastet — das Formular
 * soll nichts loeschen, was es nicht angezeigt hat.
 */
async function savePromotion(
  tx: Prisma.TransactionClient,
  productId: string,
  data: ProductInput,
): Promise<string | null> {
  const requestedId = data.promotionId ?? null
  const current = requestedId
    ? await tx.promotion.findFirst({ where: { id: requestedId, productId }, select: { id: true } })
    : null

  if (data.salePriceCents === null || !data.saleStartsAt || !data.saleEndsAt) {
    if (current) await tx.promotion.delete({ where: { id: current.id } })
    return null
  }

  const values = {
    name: 'Angebotspreis',
    salePriceCents: data.salePriceCents,
    discountBp: null,
    startsAt: data.saleStartsAt,
    endsAt: data.saleEndsAt,
    active: true,
  }

  if (current) {
    await tx.promotion.update({ where: { id: current.id }, data: values })
    return current.id
  }
  const created = await tx.promotion.create({ data: { productId, ...values }, select: { id: true } })
  return created.id
}

/** Sucht die erste freie Kennung nach dem Muster `build(1)`, `build(2)`, … */
async function freeIdentifier(
  build: (attempt: number) => string,
  taken: (value: string) => Promise<boolean>,
  label: string,
): Promise<string> {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = build(attempt)
    if (!(await taken(candidate))) return candidate
  }
  throw new AppError(
    `Für die Kopie konnte keine freie ${label} gebildet werden. Bitte benennen Sie vorhandene Kopien um.`,
    409,
  )
}

/** Wie in der Anlage-Route: belegte Kennungen werden feldbezogen gemeldet. */
async function findIdentifierConflicts(
  data: Pick<ProductInput, 'slug' | 'sku' | 'articleNumber'>,
  excludeId: string | null,
): Promise<Record<string, string>> {
  const rows = await prisma.product.findMany({
    where: {
      OR: [{ slug: data.slug }, { sku: data.sku }, { articleNumber: data.articleNumber }],
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { slug: true, sku: true, articleNumber: true },
  })

  const fieldErrors: Record<string, string> = {}
  for (const row of rows) {
    if (row.slug === data.slug) fieldErrors.slug = 'Dieser URL-Pfad ist bereits vergeben.'
    if (row.sku === data.sku) fieldErrors.sku = 'Diese SKU ist bereits vergeben.'
    if (row.articleNumber === data.articleNumber) {
      fieldErrors.articleNumber = 'Diese Artikelnummer ist bereits vergeben.'
    }
  }
  return fieldErrors
}
