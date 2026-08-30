import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { AppError } from '@/lib/server/http'
import type { MovementReason } from '@/lib/domain/enums'

/**
 * Lagerlogik.
 *
 * Jede Bestandsaenderung laeuft ueber diese Datei und erzeugt genau einen
 * Journaleintrag (InventoryMovement). Damit ist jeder Bestand jederzeit
 * herleitbar.
 *
 * Overselling wird durch bedingte Updates verhindert: Der Abzug erfolgt mit
 * `WHERE stock >= menge`. Aendert die Anweisung null Zeilen, war die Ware in
 * der Zwischenzeit vergriffen und die umgebende Transaktion wird abgebrochen.
 * Das funktioniert unabhaengig vom Isolationslevel der Datenbank.
 */

export type TxClient = Prisma.TransactionClient

export interface StockChange {
  productId: string
  variantId?: string | null
  quantity: number
}

/** Verfuegbare Menge = Bestand abzueglich Reservierungen. */
export function availableStock(stock: number, reservedStock: number): number {
  return Math.max(0, stock - reservedStock)
}

/**
 * Zieht Bestand ab. Wirft, wenn die Menge nicht mehr verfuegbar ist.
 * Muss in einer Transaktion laufen.
 */
export async function decrementStock(
  tx: TxClient,
  change: StockChange,
  reason: MovementReason,
  reference: string,
  userId?: string | null,
): Promise<void> {
  if (change.quantity <= 0) throw new AppError('Ungültige Menge für die Lagerbuchung.', 400)

  if (change.variantId) {
    const updated = await tx.$executeRaw`
      UPDATE ProductVariant
      SET stock = stock - ${change.quantity}
      WHERE id = ${change.variantId} AND stock >= ${change.quantity}
    `
    if (updated === 0) {
      throw new AppError(
        'Eine Variante im Warenkorb ist nicht mehr in der gewünschten Menge verfügbar.',
        409,
        'out_of_stock',
      )
    }
    const variant = await tx.productVariant.findUniqueOrThrow({
      where: { id: change.variantId },
      select: { stock: true },
    })
    await tx.inventoryMovement.create({
      data: {
        productId: change.productId,
        variantId: change.variantId,
        delta: -change.quantity,
        stockAfter: variant.stock,
        reason,
        reference,
        userId: userId ?? null,
      },
    })
    return
  }

  // Produkte mit allowBackorder duerfen unter null gehen (z. B. Sonderanfertigungen).
  const updated = await tx.$executeRaw`
    UPDATE Product
    SET stock = stock - ${change.quantity}
    WHERE id = ${change.productId}
      AND (stock >= ${change.quantity} OR allowBackorder = 1)
  `
  if (updated === 0) {
    throw new AppError(
      'Ein Artikel im Warenkorb ist nicht mehr in der gewünschten Menge verfügbar.',
      409,
      'out_of_stock',
    )
  }
  const product = await tx.product.findUniqueOrThrow({
    where: { id: change.productId },
    select: { stock: true },
  })
  await tx.inventoryMovement.create({
    data: {
      productId: change.productId,
      delta: -change.quantity,
      stockAfter: product.stock,
      reason,
      reference,
      userId: userId ?? null,
    },
  })
}

/** Bucht Bestand zurueck (Storno, Retoure, Korrektur). */
export async function incrementStock(
  tx: TxClient,
  change: StockChange,
  reason: MovementReason,
  reference: string,
  userId?: string | null,
  note?: string,
): Promise<void> {
  if (change.quantity <= 0) throw new AppError('Ungültige Menge für die Lagerbuchung.', 400)

  if (change.variantId) {
    const variant = await tx.productVariant.update({
      where: { id: change.variantId },
      data: { stock: { increment: change.quantity } },
      select: { stock: true },
    })
    await tx.inventoryMovement.create({
      data: {
        productId: change.productId,
        variantId: change.variantId,
        delta: change.quantity,
        stockAfter: variant.stock,
        reason,
        reference,
        userId: userId ?? null,
        note: note ?? null,
      },
    })
    return
  }

  const product = await tx.product.update({
    where: { id: change.productId },
    data: { stock: { increment: change.quantity } },
    select: { stock: true },
  })
  await tx.inventoryMovement.create({
    data: {
      productId: change.productId,
      delta: change.quantity,
      stockAfter: product.stock,
      reason,
      reference,
      userId: userId ?? null,
      note: note ?? null,
    },
  })
}

/**
 * Setzt einen Bestand absolut (manuelle Korrektur im Admin) und
 * protokolliert die Differenz.
 */
export async function setStock(
  productId: string,
  newStock: number,
  userId: string,
  note?: string,
): Promise<{ stock: number; delta: number }> {
  if (!Number.isInteger(newStock) || newStock < 0) {
    throw new AppError('Der Bestand muss eine ganze Zahl ab 0 sein.', 400)
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } })
    if (!product) throw new AppError('Produkt nicht gefunden.', 404)

    const delta = newStock - product.stock
    if (delta === 0) return { stock: newStock, delta: 0 }

    await tx.product.update({ where: { id: productId }, data: { stock: newStock } })
    await tx.inventoryMovement.create({
      data: {
        productId,
        delta,
        stockAfter: newStock,
        reason: 'manual',
        userId,
        note: note ?? null,
      },
    })
    return { stock: newStock, delta }
  })
}

/** Prueft eine Liste von Positionen auf Verfuegbarkeit, ohne zu buchen. */
export interface AvailabilityIssue {
  productId: string
  variantId: string | null
  name: string
  requested: number
  available: number
  reason: 'out_of_stock' | 'inactive' | 'missing'
}

export async function checkAvailability(
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>,
): Promise<AvailabilityIssue[]> {
  if (items.length === 0) return []

  const productIds = [...new Set(items.map((i) => i.productId))]
  const variantIds = [...new Set(items.map((i) => i.variantId).filter((v): v is string => Boolean(v)))]

  const [products, variants] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, stock: true, reservedStock: true, active: true, visible: true, allowBackorder: true },
    }),
    variantIds.length > 0
      ? prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, name: true, stock: true, reservedStock: true, active: true },
        })
      : Promise.resolve([]),
  ])

  const productMap = new Map(products.map((p) => [p.id, p]))
  const variantMap = new Map(variants.map((v) => [v.id, v]))
  const issues: AvailabilityIssue[] = []

  for (const item of items) {
    const product = productMap.get(item.productId)
    if (!product) {
      issues.push({
        productId: item.productId,
        variantId: item.variantId ?? null,
        name: 'Unbekannter Artikel',
        requested: item.quantity,
        available: 0,
        reason: 'missing',
      })
      continue
    }
    if (!product.active || !product.visible) {
      issues.push({
        productId: item.productId,
        variantId: item.variantId ?? null,
        name: product.name,
        requested: item.quantity,
        available: 0,
        reason: 'inactive',
      })
      continue
    }

    if (item.variantId) {
      const variant = variantMap.get(item.variantId)
      if (!variant || !variant.active) {
        issues.push({
          productId: item.productId,
          variantId: item.variantId,
          name: `${product.name}${variant ? ` – ${variant.name}` : ''}`,
          requested: item.quantity,
          available: 0,
          reason: variant ? 'inactive' : 'missing',
        })
        continue
      }
      const available = availableStock(variant.stock, variant.reservedStock)
      if (available < item.quantity) {
        issues.push({
          productId: item.productId,
          variantId: item.variantId,
          name: `${product.name} – ${variant.name}`,
          requested: item.quantity,
          available,
          reason: 'out_of_stock',
        })
      }
      continue
    }

    if (product.allowBackorder) continue
    const available = availableStock(product.stock, product.reservedStock)
    if (available < item.quantity) {
      issues.push({
        productId: item.productId,
        variantId: null,
        name: product.name,
        requested: item.quantity,
        available,
        reason: 'out_of_stock',
      })
    }
  }

  return issues
}

/** Formuliert Verfuegbarkeitsprobleme als verstaendliche deutsche Meldung. */
export function describeAvailabilityIssue(issue: AvailabilityIssue): string {
  switch (issue.reason) {
    case 'missing':
      return `„${issue.name}“ ist nicht mehr im Sortiment und wurde aus dem Warenkorb entfernt.`
    case 'inactive':
      return `„${issue.name}“ ist derzeit nicht bestellbar.`
    case 'out_of_stock':
      return issue.available === 0
        ? `„${issue.name}“ ist aktuell ausverkauft.`
        : `Von „${issue.name}“ sind nur noch ${issue.available} Stück verfügbar.`
  }
}
