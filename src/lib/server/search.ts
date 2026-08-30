import { prisma } from '@/lib/db'
import { normalizeSearch, tokenize } from '@/lib/utils/text'

/**
 * Produktsuche.
 *
 * Aufbau in drei Stufen, damit die Ergebnisse auch bei Tippfehlern brauchbar
 * bleiben und die Architektur spaeter gegen eine dedizierte Suchmaschine
 * (Meilisearch, Typesense, Postgres FTS) ausgetauscht werden kann, ohne die
 * Aufrufer zu aendern:
 *
 *   1. Begriffe normalisieren (Kleinschreibung, Umlaute, Satzzeichen).
 *   2. Synonyme aufloesen ("Fleischhaken" -> "raeucherhaken").
 *   3. Kandidaten per SQL vorfiltern, dann in der Anwendung mit einer
 *      gewichteten Ranking-Funktion inkl. Fuzzy-Abgleich sortieren.
 *
 * Die Vorfilterung haelt die in den Speicher geladene Menge klein; das Ranking
 * braucht Feldgewichte, die sich in SQL nur schlecht ausdruecken lassen.
 */

/** Basissynonyme. Ergaenzbar ueber die Tabelle SearchSynonym im Admin. */
export const BASE_SYNONYMS: Record<string, string[]> = {
  haken: ['raeucherhaken', 'fleischerhaken'],
  fleischhaken: ['raeucherhaken', 'fleischerhaken'],
  fleischerhaken: ['fleischerhaken', 'raeucherhaken'],
  edelstahlhaken: ['raeucherhaken'],
  smokehook: ['raeucherhaken'],
  raeucherspaene: ['raeuchermehl'],
  spaene: ['raeuchermehl'],
  holzmehl: ['raeuchermehl'],
  saegemehl: ['raeuchermehl'],
  smokewood: ['raeuchermehl'],
  smoke: ['raeuchermehl'],
  mehl: ['raeuchermehl'],
  lake: ['raeucherlauge', 'lauge'],
  poekellake: ['raeucherlauge', 'lauge'],
  salzlake: ['raeucherlauge', 'lauge'],
  beize: ['raeucherlauge', 'lauge'],
  marinade: ['raeucherlauge', 'lauge'],
  gewuerz: ['gewuerze', 'naturgewuerz'],
  kraeuter: ['gewuerze'],
  wuerzmittel: ['gewuerze'],
  lachs: ['fisch', 'lachs'],
  forelle: ['fisch', 'forelle'],
  makrele: ['fisch', 'makrele'],
  aal: ['fisch', 'aal'],
  schinken: ['schinken', 'fleisch'],
  speck: ['schinken', 'fleisch'],
  v2a: ['v2a', 'edelstahl'],
  v4a: ['v4a', 'edelstahl'],
  niro: ['edelstahl'],
  rostfrei: ['edelstahl'],
  sonderanfertigung: ['sonderanfertigung', 'prototyp'],
  massanfertigung: ['sonderanfertigung'],
}

let synonymCache: { map: Map<string, string[]>; loadedAt: number } | null = null
const SYNONYM_TTL_MS = 5 * 60 * 1000

/** Laedt Basissynonyme plus die im Admin gepflegten Eintraege. */
export async function loadSynonyms(): Promise<Map<string, string[]>> {
  if (synonymCache && Date.now() - synonymCache.loadedAt < SYNONYM_TTL_MS) {
    return synonymCache.map
  }
  const map = new Map<string, string[]>()
  for (const [term, targets] of Object.entries(BASE_SYNONYMS)) {
    map.set(term, [...targets])
  }
  try {
    const rows = await prisma.searchSynonym.findMany()
    for (const row of rows) {
      const existing = map.get(row.term) ?? []
      if (!existing.includes(row.canonical)) existing.push(row.canonical)
      map.set(row.term, existing)
    }
  } catch {
    // Suche darf niemals an fehlenden Synonymen scheitern.
  }
  synonymCache = { map, loadedAt: Date.now() }
  return map
}

export function invalidateSynonymCache(): void {
  synonymCache = null
}

/** Erweitert Tokens um ihre Synonyme. */
export function expandTokens(tokens: string[], synonyms: Map<string, string[]>): string[] {
  const out = new Set<string>()
  for (const token of tokens) {
    out.add(token)
    for (const target of synonyms.get(token) ?? []) out.add(target)
  }
  return [...out]
}

/**
 * Levenshtein-Distanz mit fruehem Abbruch.
 * Liefert `maxDistance + 1`, sobald klar ist, dass die Grenze ueberschritten wird.
 */
export function levenshtein(a: string, b: string, maxDistance = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  let current = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    let rowMin = current[0]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
      if (current[j] < rowMin) rowMin = current[j]
    }
    if (rowMin > maxDistance) return maxDistance + 1
    const swap = previous
    previous = current
    current = swap
  }
  return previous[b.length]
}

/** Erlaubte Fehlertoleranz abhaengig von der Wortlaenge. */
export function toleranceFor(token: string): number {
  if (token.length <= 3) return 0
  if (token.length <= 5) return 1
  if (token.length <= 8) return 2
  return 3
}

/** Bewertet, wie gut ein Token in einem Feld vorkommt. 0 = kein Treffer. */
export function scoreToken(token: string, haystack: string, weight: number): number {
  if (haystack.length === 0) return 0

  if (haystack === token) return weight * 3
  if (haystack.startsWith(`${token} `)) return weight * 2.4

  const index = haystack.indexOf(token)
  if (index === 0) return weight * 2
  if (index > 0) {
    // Wortanfang wiegt schwerer als ein Treffer mitten im Wort.
    return haystack[index - 1] === ' ' ? weight * 1.6 : weight * 0.9
  }

  // Fuzzy: nur gegen einzelne Woerter, nicht gegen den gesamten Text.
  const tolerance = toleranceFor(token)
  if (tolerance === 0) return 0
  let best = 0
  for (const word of haystack.split(' ')) {
    if (word.length === 0) continue
    if (Math.abs(word.length - token.length) > tolerance) continue
    const distance = levenshtein(token, word, tolerance)
    if (distance <= tolerance) {
      const quality = 1 - distance / (tolerance + 1)
      best = Math.max(best, weight * quality)
    }
  }
  return best
}

export interface SearchableProduct {
  id: string
  slug: string
  name: string
  sku: string
  articleNumber: string
  shortDescription: string | null
  description: string
  material: string | null
  usage: string | null
  categoryName: string
  categorySlug: string
  priceCents: number
  popularity: number
  bestseller: boolean
  stock: number
  imageUrl: string | null
}

export interface ScoredProduct extends SearchableProduct {
  score: number
}

/** Feldgewichte des Rankings. Name schlaegt Beschreibung deutlich. */
const FIELD_WEIGHTS = {
  name: 10,
  sku: 8,
  articleNumber: 8,
  category: 4,
  shortDescription: 3,
  material: 2.5,
  usage: 2.5,
  description: 1,
} as const

/** Bewertet ein Produkt gegen die (bereits erweiterten) Suchtokens. */
export function scoreProduct(product: SearchableProduct, tokens: string[]): number {
  if (tokens.length === 0) return 0

  const fields: Array<[string, number]> = [
    [normalizeSearch(product.name), FIELD_WEIGHTS.name],
    [normalizeSearch(product.sku), FIELD_WEIGHTS.sku],
    [normalizeSearch(product.articleNumber), FIELD_WEIGHTS.articleNumber],
    [normalizeSearch(product.categoryName), FIELD_WEIGHTS.category],
    [normalizeSearch(product.shortDescription ?? ''), FIELD_WEIGHTS.shortDescription],
    [normalizeSearch(product.material ?? ''), FIELD_WEIGHTS.material],
    [normalizeSearch(product.usage ?? ''), FIELD_WEIGHTS.usage],
    [normalizeSearch(product.description).slice(0, 600), FIELD_WEIGHTS.description],
  ]

  let total = 0
  let matchedTokens = 0

  for (const token of tokens) {
    let bestForToken = 0
    for (const [haystack, weight] of fields) {
      const score = scoreToken(token, haystack, weight)
      if (score > bestForToken) bestForToken = score
    }
    if (bestForToken > 0) {
      matchedTokens += 1
      total += bestForToken
    }
  }

  if (matchedTokens === 0) return 0

  // Vollstaendige Abdeckung aller Suchbegriffe wird deutlich belohnt.
  const coverage = matchedTokens / tokens.length
  total *= 0.4 + 0.6 * coverage

  // Leichte Bevorzugung beliebter, lieferbarer Artikel bei sonst gleichem Score.
  total += Math.min(product.popularity, 100) * 0.01
  if (product.bestseller) total += 0.35
  if (product.stock <= 0) total -= 0.6

  return total
}

/** Baut die SQL-Vorfilterung: ein OR je Token ueber die wichtigsten Felder. */
function buildPrefilter(tokens: string[]) {
  const clauses = tokens.flatMap((token) => [
    { name: { contains: token } },
    { sku: { contains: token } },
    { articleNumber: { contains: token } },
    { shortDescription: { contains: token } },
    { material: { contains: token } },
    { usage: { contains: token } },
    { description: { contains: token } },
  ])
  return clauses
}

export interface SearchOptions {
  limit?: number
  /** Wenn true, werden bei zu wenigen Treffern auch unscharfe Kandidaten geladen. */
  allowFuzzyFallback?: boolean
}

export interface SearchResult {
  items: ScoredProduct[]
  /** Aufbereitete Suchbegriffe (inkl. Synonyme) — nuetzlich fuer Debug und UI. */
  tokens: string[]
  total: number
  /** Vorschlaege, wenn nichts gefunden wurde. */
  suggestions: string[]
}

/** Fuehrt eine Volltextsuche ueber den aktiven Katalog aus. */
export async function searchProducts(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  const limit = options.limit ?? 24
  const rawTokens = tokenize(query)

  if (rawTokens.length === 0) {
    return { items: [], tokens: [], total: 0, suggestions: [] }
  }

  const synonyms = await loadSynonyms()
  const tokens = expandTokens(rawTokens, synonyms)

  const baseWhere = { active: true, visible: true } as const
  let candidates = await prisma.product.findMany({
    where: { ...baseWhere, OR: buildPrefilter(tokens) },
    select: PRODUCT_SEARCH_SELECT,
    take: 400,
  })

  // Bei Tippfehlern findet die SQL-Vorfilterung nichts. Dann laedt die Suche
  // eine begrenzte Menge und laesst das Fuzzy-Ranking entscheiden.
  const fuzzyFallback = options.allowFuzzyFallback ?? true
  if (candidates.length === 0 && fuzzyFallback) {
    candidates = await prisma.product.findMany({
      where: baseWhere,
      select: PRODUCT_SEARCH_SELECT,
      orderBy: [{ popularity: 'desc' }, { name: 'asc' }],
      take: 500,
    })
  }

  const mapped = candidates.map(mapSearchable)
  const scored: ScoredProduct[] = []
  for (const product of mapped) {
    const score = scoreProduct(product, tokens)
    if (score > 0) scored.push({ ...product, score })
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'de'))

  const suggestions = scored.length === 0 ? await buildSuggestions(rawTokens) : []

  return {
    items: scored.slice(0, limit),
    tokens,
    total: scored.length,
    suggestions,
  }
}

/** Kategorienamen als Vorschlag, wenn die Suche leer ausgeht. */
async function buildSuggestions(tokens: string[]): Promise<string[]> {
  const categories = await prisma.category.findMany({
    where: { active: true },
    select: { name: true },
    take: 40,
  })
  const scored = categories
    .map((c) => ({
      name: c.name,
      score: tokens.reduce((sum, t) => sum + scoreToken(t, normalizeSearch(c.name), 1), 0),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length > 0) return scored.slice(0, 4).map((c) => c.name)
  return ['Räucherhaken', 'Räuchermehl', 'Räucherlaugen', 'Naturgewürze']
}

export const PRODUCT_SEARCH_SELECT = {
  id: true,
  slug: true,
  name: true,
  sku: true,
  articleNumber: true,
  shortDescription: true,
  description: true,
  material: true,
  usage: true,
  priceCents: true,
  popularity: true,
  bestseller: true,
  stock: true,
  category: { select: { name: true, slug: true } },
  images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
} as const

type SearchRow = {
  id: string
  slug: string
  name: string
  sku: string
  articleNumber: string
  shortDescription: string | null
  description: string
  material: string | null
  usage: string | null
  priceCents: number
  popularity: number
  bestseller: boolean
  stock: number
  category: { name: string; slug: string }
  images: Array<{ url: string }>
}

function mapSearchable(row: SearchRow): SearchableProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sku: row.sku,
    articleNumber: row.articleNumber,
    shortDescription: row.shortDescription,
    description: row.description,
    material: row.material,
    usage: row.usage,
    categoryName: row.category.name,
    categorySlug: row.category.slug,
    priceCents: row.priceCents,
    popularity: row.popularity,
    bestseller: row.bestseller,
    stock: row.stock,
    imageUrl: row.images[0]?.url ?? null,
  }
}

/** Protokolliert eine Suchanfrage fuer die Auswertung im Admin. */
export async function logSearchQuery(query: string, hits: number): Promise<void> {
  const normalized = normalizeSearch(query)
  if (normalized.length < 2 || normalized.length > 120) return
  await prisma.searchQueryLog.create({ data: { query: normalized, hits } }).catch(() => undefined)
}
