import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { CARD_SELECT, toCardData } from '@/lib/server/catalog'
import { SORT_OPTIONS, type SortOption } from '@/lib/domain/enums'
import type { ProductCardData } from '@/components/product/product-card'

/**
 * Filter, Sortierung und Seitenaufteilung des Katalogs.
 *
 * Der komplette Zustand steckt in der URL. Damit sind Filter teilbar, per
 * Lesezeichen speicherbar und die Zurueck-Taste des Browsers stellt sie
 * verlustfrei wieder her — ohne eigenen Verlaufszustand im JavaScript.
 */

export const PAGE_SIZE = 24

export interface CatalogFilters {
  categorySlug?: string | null
  /** Mehrfachauswahl */
  materials: string[]
  usages: string[]
  minPriceCents: number | null
  maxPriceCents: number | null
  /** Nur lieferbare Artikel anzeigen */
  inStockOnly: boolean
  /** Nur Artikel mit laufender Aktion */
  onSaleOnly: boolean
  sort: SortOption
  page: number
  query: string | null
}

type SearchParamsInput = Record<string, string | string[] | undefined>

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 40)
    .slice(0, 12)
}

function asPriceCents(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  const parsed = Number.parseFloat(raw.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000) return null
  return Math.round(parsed * 100)
}

/**
 * Liest Filter aus den URL-Parametern.
 * Ungueltige Werte werden still verworfen statt eine Fehlerseite zu erzeugen —
 * eine manipulierte URL soll den Katalog nicht unbenutzbar machen.
 */
export function parseFilters(
  params: SearchParamsInput,
  defaults: Partial<CatalogFilters> = {},
): CatalogFilters {
  const sortRaw = Array.isArray(params.sort) ? params.sort[0] : params.sort
  const sort: SortOption =
    sortRaw && (SORT_OPTIONS as readonly string[]).includes(sortRaw)
      ? (sortRaw as SortOption)
      : (defaults.sort ?? 'beliebtheit')

  const pageRaw = Array.isArray(params.seite) ? params.seite[0] : params.seite
  const parsedPage = pageRaw ? Number.parseInt(pageRaw, 10) : 1
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.min(parsedPage, 500) : 1

  const queryRaw = Array.isArray(params.q) ? params.q[0] : params.q

  const min = asPriceCents(params.preis_min)
  const max = asPriceCents(params.preis_max)

  return {
    categorySlug: defaults.categorySlug ?? null,
    materials: asArray(params.material),
    usages: asArray(params.verwendung),
    // Vertauschte Grenzen tolerieren statt leere Ergebnisse liefern.
    minPriceCents: min !== null && max !== null ? Math.min(min, max) : min,
    maxPriceCents: min !== null && max !== null ? Math.max(min, max) : max,
    inStockOnly: params.lieferbar === '1',
    onSaleOnly: params.aktion === '1',
    sort,
    page,
    query: queryRaw?.slice(0, 120)?.trim() || null,
  }
}

/** Baut eine URL mit geaenderten Filtern; die Seite springt dabei zurueck auf 1. */
export function buildFilterHref(
  basePath: string,
  filters: CatalogFilters,
  changes: Partial<CatalogFilters> & { page?: number },
): string {
  const next = { ...filters, ...changes }
  const params = new URLSearchParams()

  if (next.query) params.set('q', next.query)
  if (next.materials.length > 0) params.set('material', next.materials.join(','))
  if (next.usages.length > 0) params.set('verwendung', next.usages.join(','))
  if (next.minPriceCents !== null) params.set('preis_min', (next.minPriceCents / 100).toFixed(2))
  if (next.maxPriceCents !== null) params.set('preis_max', (next.maxPriceCents / 100).toFixed(2))
  if (next.inStockOnly) params.set('lieferbar', '1')
  if (next.onSaleOnly) params.set('aktion', '1')
  if (next.sort !== 'beliebtheit') params.set('sort', next.sort)

  const page = changes.page ?? (hasFilterChange(filters, changes) ? 1 : next.page)
  if (page > 1) params.set('seite', String(page))

  const qs = params.toString()
  return qs.length > 0 ? `${basePath}?${qs}` : basePath
}

function hasFilterChange(filters: CatalogFilters, changes: Partial<CatalogFilters>): boolean {
  return Object.keys(changes).some((key) => key !== 'page' && key in filters)
}

/** Schaltet einen Mehrfachfilter um. */
export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function buildWhere(filters: CatalogFilters, now: Date): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { active: true, visible: true }

  if (filters.categorySlug) {
    // Unterkategorien werden mit einbezogen, damit eine Oberkategorie
    // nicht leer wirkt.
    where.category = {
      OR: [{ slug: filters.categorySlug }, { parent: { slug: filters.categorySlug } }],
    }
  }
  if (filters.materials.length > 0) where.material = { in: filters.materials }
  if (filters.usages.length > 0) where.usage = { in: filters.usages }
  if (filters.inStockOnly) where.stock = { gt: 0 }

  if (filters.minPriceCents !== null || filters.maxPriceCents !== null) {
    where.priceCents = {
      ...(filters.minPriceCents !== null ? { gte: filters.minPriceCents } : {}),
      ...(filters.maxPriceCents !== null ? { lte: filters.maxPriceCents } : {}),
    }
  }
  if (filters.onSaleOnly) {
    where.promotions = { some: { active: true, startsAt: { lte: now }, endsAt: { gt: now } } }
  }

  return where
}

function buildOrderBy(sort: SortOption): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'name-asc':
      return [{ name: 'asc' }]
    case 'name-desc':
      return [{ name: 'desc' }]
    case 'preis-asc':
      return [{ priceCents: 'asc' }, { name: 'asc' }]
    case 'preis-desc':
      return [{ priceCents: 'desc' }, { name: 'asc' }]
    case 'bestseller':
      return [{ bestseller: 'desc' }, { popularity: 'desc' }, { name: 'asc' }]
    case 'neu':
      return [{ createdAt: 'desc' }, { name: 'asc' }]
    case 'relevanz':
    case 'beliebtheit':
    default:
      return [{ popularity: 'desc' }, { bestseller: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }]
  }
}

export interface FacetOption {
  value: string
  label: string
  count: number
}

export interface CatalogResult {
  products: ProductCardData[]
  total: number
  page: number
  totalPages: number
  facets: {
    materials: FacetOption[]
    usages: FacetOption[]
  }
  priceRange: { minCents: number; maxCents: number }
}

/**
 * Laedt eine gefilterte Produktliste samt Facetten.
 *
 * Die Facettenzaehlung ignoriert bewusst den jeweils eigenen Filter: Waehlt
 * jemand "V4A", sollen die anderen Materialien mit ihren Trefferzahlen
 * sichtbar bleiben, statt zu verschwinden.
 */
export async function queryCatalog(filters: CatalogFilters, now: Date = new Date()): Promise<CatalogResult> {
  const where = buildWhere(filters, now)
  const skip = (filters.page - 1) * PAGE_SIZE

  const materialWhere = buildWhere({ ...filters, materials: [] }, now)
  const usageWhere = buildWhere({ ...filters, usages: [] }, now)

  const [rows, total, materialGroups, usageGroups, priceAgg] = await Promise.all([
    prisma.product.findMany({
      where,
      select: CARD_SELECT,
      orderBy: buildOrderBy(filters.sort),
      skip,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    prisma.product.groupBy({
      by: ['material'],
      where: { ...materialWhere, material: { not: null } },
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ['usage'],
      where: { ...usageWhere, usage: { not: null } },
      _count: { _all: true },
    }),
    prisma.product.aggregate({
      where: buildWhere({ ...filters, minPriceCents: null, maxPriceCents: null }, now),
      _min: { priceCents: true },
      _max: { priceCents: true },
    }),
  ])

  return {
    products: rows.map((row) => toCardData(row, now)),
    total,
    page: filters.page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    facets: {
      materials: materialGroups
        .filter((g) => g.material !== null)
        .map((g) => ({ value: g.material as string, label: g.material as string, count: g._count._all }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'de')),
      usages: usageGroups
        .filter((g) => g.usage !== null)
        .map((g) => ({ value: g.usage as string, label: g.usage as string, count: g._count._all }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'de')),
    },
    priceRange: {
      minCents: priceAgg._min.priceCents ?? 0,
      maxCents: priceAgg._max.priceCents ?? 0,
    },
  }
}

/** Anzahl aktiver Filter — fuer die Anzeige am mobilen Filter-Button. */
export function activeFilterCount(filters: CatalogFilters): number {
  return (
    filters.materials.length +
    filters.usages.length +
    (filters.minPriceCents !== null ? 1 : 0) +
    (filters.maxPriceCents !== null ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0) +
    (filters.onSaleOnly ? 1 : 0)
  )
}
