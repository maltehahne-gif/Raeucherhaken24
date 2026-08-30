import { prisma } from '@/lib/db'
import { selectPromotion } from '@/lib/server/pricing'
import type { ProductCardData } from '@/components/product/product-card'

/**
 * Leseschicht fuer den Katalog.
 *
 * Sie liefert genau die Felder, die die Karten und Listen anzeigen, und wendet
 * dabei bereits die gueltigen Aktionspreise an — damit im Katalog nie ein
 * anderer Preis steht als auf der Produktseite oder im Warenkorb.
 */

export const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  subtitle: true,
  priceCents: true,
  baseUnit: true,
  baseUnitAmount: true,
  baseUnitReference: true,
  stock: true,
  allowBackorder: true,
  bestseller: true,
  material: true,
  lowStockThreshold: true,
  category: { select: { name: true, slug: true } },
  images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
  promotions: {
    select: { name: true, salePriceCents: true, discountBp: true, startsAt: true, endsAt: true, active: true, id: true },
  },
} as const

type CardRow = {
  id: string
  slug: string
  name: string
  subtitle: string | null
  priceCents: number
  baseUnit: string | null
  baseUnitAmount: number | null
  baseUnitReference: number | null
  stock: number
  allowBackorder: boolean
  bestseller: boolean
  material: string | null
  lowStockThreshold: number
  category: { name: string; slug: string }
  images: Array<{ url: string; alt: string }>
  promotions: Array<{
    id: string
    name: string
    salePriceCents: number | null
    discountBp: number | null
    startsAt: Date
    endsAt: Date
    active: boolean
  }>
}

/** Wandelt einen Datenbanksatz in die Darstellungsdaten der Produktkarte. */
export function toCardData(row: CardRow, now: Date = new Date()): ProductCardData {
  const promo = selectPromotion(row.promotions, row.priceCents, now)

  return {
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle,
    categoryName: row.category.name,
    imageUrl: row.images[0]?.url ?? null,
    imageAlt: row.images[0]?.alt ?? null,
    priceCents: promo ? promo.priceCents : row.priceCents,
    listPriceCents: promo ? row.priceCents : null,
    baseUnit: row.baseUnit,
    baseUnitAmount: row.baseUnitAmount,
    baseUnitReference: row.baseUnitReference,
    stock: row.stock,
    allowBackorder: row.allowBackorder,
    bestseller: row.bestseller,
    material: row.material,
    promotionName: promo ? promo.promotion.name : null,
    lowStockThreshold: row.lowStockThreshold,
  }
}

/** Bestseller fuer die Startseite. */
export async function getBestsellers(limit = 8): Promise<ProductCardData[]> {
  const rows = await prisma.product.findMany({
    where: { active: true, visible: true, stock: { gt: 0 } },
    select: CARD_SELECT,
    orderBy: [{ bestseller: 'desc' }, { popularity: 'desc' }, { name: 'asc' }],
    take: limit,
  })
  return rows.map((row) => toCardData(row))
}

/** Artikel mit laufender Aktion. */
export async function getPromotedProducts(limit = 4): Promise<ProductCardData[]> {
  const now = new Date()
  const rows = await prisma.product.findMany({
    where: {
      active: true,
      visible: true,
      promotions: { some: { active: true, startsAt: { lte: now }, endsAt: { gt: now } } },
    },
    select: CARD_SELECT,
    orderBy: [{ popularity: 'desc' }],
    take: limit,
  })
  return rows.map((row) => toCardData(row, now))
}

/** Verwandte Produkte und Cross-Selling zu einem Artikel. */
export async function getRelatedProducts(productId: string, limit = 4): Promise<ProductCardData[]> {
  const relations = await prisma.productRelation.findMany({
    where: { sourceId: productId },
    orderBy: { sortOrder: 'asc' },
    take: limit,
    select: { target: { select: CARD_SELECT }, targetId: true },
  })

  const related = relations
    .map((r) => r.target)
    .filter((p) => p !== null)
    .map((row) => toCardData(row))

  if (related.length >= limit) return related

  // Auffuellen mit Artikeln derselben Kategorie, damit die Leiste nie halbleer bleibt.
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { categoryId: true },
  })
  if (!product) return related

  const fill = await prisma.product.findMany({
    where: {
      active: true,
      visible: true,
      categoryId: product.categoryId,
      id: { not: productId, notIn: relations.map((r) => r.targetId) },
    },
    select: CARD_SELECT,
    orderBy: [{ bestseller: 'desc' }, { popularity: 'desc' }],
    take: limit - related.length,
  })

  return [...related, ...fill.map((row) => toCardData(row))]
}

/** Produkte anhand ihrer Slugs — fuer "zuletzt angesehen" und Rezeptverweise. */
export async function getProductsBySlugs(slugs: string[]): Promise<ProductCardData[]> {
  if (slugs.length === 0) return []
  const rows = await prisma.product.findMany({
    where: { slug: { in: slugs.slice(0, 12) }, active: true, visible: true },
    select: CARD_SELECT,
  })
  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  const ordered: ProductCardData[] = []
  for (const slug of slugs) {
    const row = bySlug.get(slug)
    if (row) ordered.push(toCardData(row))
  }
  return ordered
}
