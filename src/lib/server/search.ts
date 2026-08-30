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

  /*
   * Ein Treffer, der ein ganzes Wort ausfuellt, wiegt schwerer als einer, der
   * nur dessen Anfang trifft — und zwar unabhaengig davon, wo im Text er steht.
   *
   * Ohne diese Reihenfolge gewinnt die Position ueber die Genauigkeit: Zu
   * „Pfeffer“ stuende „Pfefferminze gerebelt“ vor „Schwarzer Pfeffer ganz“,
   * weil der Treffer dort zufaellig am Anfang liegt.
   */
  let literal = 0
  for (let index = haystack.indexOf(token); index !== -1; index = haystack.indexOf(token, index + 1)) {
    const atStart = index === 0
    const startsWord = atStart || haystack[index - 1] === ' '
    const end = index + token.length
    const endsWord = end === haystack.length || haystack[end] === ' '

    let factor: number
    if (startsWord && endsWord) factor = atStart ? 2.4 : 2 // ganzes Wort
    else if (startsWord) factor = atStart ? 1.6 : 1.3 // nur der Wortanfang
    else factor = 0.9 // mitten im Wort

    if (factor > literal) literal = factor
    if (literal === 2.4) break // besser wird es nicht mehr
  }
  if (literal > 0) return weight * literal

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


/**
 * Sieht die Eingabe nach einer Artikelnummer oder SKU aus?
 *
 * Wer "RH-HAK-0042" eintippt, sucht genau diesen Artikel — nicht 171 Treffer,
 * bei denen irgendwo ein "RH" im Text steht. Solche Eingaben bekommen deshalb
 * einen eigenen, exakten Weg.
 */
export function looksLikeIdentifier(query: string): boolean {
  const trimmed = query.trim()
  if (trimmed.length < 4 || trimmed.length > 40) return false
  if (/\s/.test(trimmed)) return false
  if (!/^[A-Za-z0-9]+([-_.][A-Za-z0-9]+)+$/.test(trimmed)) return false

  /*
   * Entscheidend ist ein rein numerischer Abschnitt: Artikelnummern und SKUs
   * enden auf eine laufende Nummer ("RH-HAK-0042"). Ohne diese Bedingung
   * wuerde "V4A-Draht" als Artikelnummer gelten und die normale Suche
   * uebersprungen — obwohl es eine ganz gewoehnliche Suchanfrage ist.
   */
  return trimmed.split(/[-_.]/).some((segment) => /^\d{2,}$/.test(segment))
}

/**
 * Sucht die Eingabe woertlich in Name, Beschreibung und Werkstoff.
 *
 * Gebraucht fuer Angaben wie "1.4404": Die Zeichenkette steht in den
 * Produkttexten, wird von der Tokenisierung aber in "1" und "4404" zerlegt
 * und dadurch unbrauchbar.
 */
async function findLiteral(query: string): Promise<ScoredProduct[]> {
  const value = query.trim()
  const rows = await prisma.product.findMany({
    where: {
      active: true,
      visible: true,
      OR: [
        { name: { contains: value } },
        { shortDescription: { contains: value } },
        { description: { contains: value } },
        { material: { contains: value } },
      ],
    },
    select: PRODUCT_SEARCH_SELECT,
    orderBy: [{ popularity: 'desc' }],
    take: 25,
  })
  return rows.map((row) => ({ ...mapSearchable(row), score: 100 }))
}

/** Exakte oder beginnende Übereinstimmung auf SKU und Artikelnummer. */
async function findByIdentifier(query: string): Promise<ScoredProduct[]> {
  const value = query.trim().toUpperCase()
  const rows = await prisma.product.findMany({
    where: {
      active: true,
      visible: true,
      OR: [
        { sku: { startsWith: value } },
        { articleNumber: { startsWith: value } },
      ],
    },
    select: PRODUCT_SEARCH_SELECT,
    take: 25,
  })
  return rows.map((row) => {
    const mapped = mapSearchable(row)
    // Exakte Treffer stehen vor Präfixtreffern.
    const exact = mapped.sku.toUpperCase() === value || mapped.articleNumber.toUpperCase() === value
    return { ...mapped, score: exact ? 1000 : 500 }
  })
}

/** Fuehrt eine Volltextsuche ueber den aktiven Katalog aus. */
export async function searchProducts(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  const limit = options.limit ?? 24
  const rawTokens = tokenize(query)

  if (rawTokens.length === 0) {
    return { items: [], tokens: [], total: 0, suggestions: [] }
  }

  // Artikelnummern und SKUs bekommen einen eigenen, exakten Weg.
  if (looksLikeIdentifier(query)) {
    const byIdentifier = await findByIdentifier(query)
    if (byIdentifier.length > 0) {
      byIdentifier.sort((a, b) => b.score - a.score || a.sku.localeCompare(b.sku))
      return {
        items: byIdentifier.slice(0, limit),
        tokens: [query.trim().toUpperCase()],
        total: byIdentifier.length,
        suggestions: [],
      }
    }
    /*
     * Keine Artikelnummer getroffen. Bevor wir aufgeben, wird die Eingabe
     * woertlich in den Produkttexten gesucht — Werkstoffangaben wie "1.4404"
     * stehen dort, werden von der Tokenisierung aber zerlegt.
     */
    const literal = await findLiteral(query)
    if (literal.length > 0) {
      return {
        items: literal.slice(0, limit),
        tokens: [query.trim()],
        total: literal.length,
        suggestions: [],
      }
    }

    /*
     * Auch woertlich nichts gefunden: Diesen Artikel gibt es nicht. Eine
     * Volltextsuche wuerde hier hunderte Treffer liefern, weil Bruchstuecke
     * wie "RH" ueberall vorkommen — das ist kein Ergebnis, sondern Rauschen.
     */
    return {
      items: [],
      tokens: [query.trim().toUpperCase()],
      total: 0,
      suggestions: await buildSuggestions(rawTokens),
    }
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
