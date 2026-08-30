import { prisma } from '@/lib/db'
import { CARD_SELECT, toCardData } from '@/lib/server/catalog'
import { normalizeSearch } from '@/lib/utils/text'
import type { ProductCardData } from '@/components/product/product-card'

/**
 * Empfehlungslogik für Kaufberater und Räucherberater „Smoky“.
 *
 * Grundsatz: Empfohlen wird ausschließlich, was im Katalog tatsächlich
 * existiert, aktiv und sichtbar ist. Diese Datei stellt die Verbindung zwischen
 * einer Beratungssituation und echten Artikeln her — es gibt keinen Weg, über
 * den ein erfundener Artikel in eine Empfehlung gelangen könnte.
 *
 * Die Regeln sind bewusst nachvollziehbar gehalten: Jede Empfehlung trägt eine
 * Begründung, die dem Kunden angezeigt wird.
 */

export interface AdvisorProfile {
  /** Was soll geräuchert werden? */
  foodType?: 'fisch' | 'fleisch' | 'schinken' | 'gefluegel' | 'wurst' | 'kaese' | 'vegetarisch'
  /** Konkrete Art, z. B. "Forelle" — verfeinert die Auswahl. */
  foodDetail?: string
  method?: 'kalt' | 'warm' | 'heiss'
  flavor?: 'mild' | 'kraeftig' | 'wuerzig' | 'suess-rauchig' | 'klassisch'
  /** Menge je Durchgang in Gramm */
  amountGrams?: number
  /** Anzahl der Stücke je Durchgang — bestimmt die Hakenmenge. */
  pieceCount?: number
  experience?: 'einsteiger' | 'fortgeschritten' | 'profi'
  /** Dauerhafter Kontakt mit Lake oder Salz? Entscheidet über V2A oder V4A. */
  heavyBrineUse?: boolean
  budget?: 'sparsam' | 'mittel' | 'hochwertig'
}

export interface Recommendation {
  product: ProductCardData
  /** Warum dieser Artikel? Wird dem Kunden gezeigt. */
  reason: string
  /** Empfohlene Menge, falls sinnvoll ableitbar. */
  suggestedQuantity?: number
  /** Bewertung 0–100, nur für die Sortierung. */
  score: number
}

export interface AdvisorResult {
  hooks: Recommendation[]
  meal: Recommendation[]
  brine: Recommendation[]
  spices: Recommendation[]
  /** Zusammenfassende Einschätzung in ganzen Sätzen. */
  summary: string
  /** Konkrete Hinweise zur Umsetzung. */
  notes: string[]
}

/** Holzart-Empfehlung je Räuchergut und Geschmacksrichtung. */
const WOOD_BY_PROFILE: Record<string, string[]> = {
  'fisch:mild': ['erle', 'buche'],
  'fisch:kraeftig': ['buche', 'eiche'],
  'fisch:suess-rauchig': ['kirsche', 'erle'],
  'fisch:klassisch': ['erle', 'buche'],
  'fleisch:mild': ['buche', 'kirsche'],
  'fleisch:kraeftig': ['eiche', 'buche'],
  'fleisch:wuerzig': ['buche', 'wacholder'],
  'schinken:kraeftig': ['eiche', 'buche'],
  'schinken:wuerzig': ['wacholder', 'buche'],
  'schinken:klassisch': ['buche', 'eiche'],
  'wurst:kraeftig': ['buche', 'eiche'],
  'kaese:mild': ['erle', 'kirsche'],
  'gefluegel:mild': ['kirsche', 'buche'],
  'vegetarisch:mild': ['erle', 'kirsche'],
}

function woodPreference(profile: AdvisorProfile): string[] {
  const key = `${profile.foodType ?? 'fisch'}:${profile.flavor ?? 'klassisch'}`
  return WOOD_BY_PROFILE[key] ?? WOOD_BY_PROFILE[`${profile.foodType ?? 'fisch'}:klassisch`] ?? ['buche']
}

/**
 * Hakengröße nach Räuchergut.
 * Die Werte sind Erfahrungswerte für die Auswahl, keine Zusicherung.
 */
function hookProfile(profile: AdvisorProfile): {
  minLengthMm: number
  maxLengthMm: number
  minLoadGrams: number
  keywords: string[]
} {
  switch (profile.foodType) {
    case 'fisch':
      if (/aal/i.test(profile.foodDetail ?? '')) {
        return { minLengthMm: 200, maxLengthMm: 450, minLoadGrams: 1_500, keywords: ['spieß', 'stech', 'aal'] }
      }
      if (/lachs|seite|filet/i.test(profile.foodDetail ?? '')) {
        return { minLengthMm: 150, maxLengthMm: 350, minLoadGrams: 3_000, keywords: ['doppel', 'zwei'] }
      }
      return { minLengthMm: 100, maxLengthMm: 300, minLoadGrams: 800, keywords: ['s-haken', 'fisch', 'forelle'] }
    case 'schinken':
      return { minLengthMm: 150, maxLengthMm: 450, minLoadGrams: 6_000, keywords: ['schinken', 'schwer'] }
    case 'fleisch':
      return { minLengthMm: 150, maxLengthMm: 400, minLoadGrams: 4_000, keywords: ['fleisch', 'schwer'] }
    case 'wurst':
      return { minLengthMm: 100, maxLengthMm: 250, minLoadGrams: 1_000, keywords: ['vier', 'zinker', 'wurst'] }
    case 'gefluegel':
      return { minLengthMm: 150, maxLengthMm: 350, minLoadGrams: 3_000, keywords: ['doppel', 'gefluegel'] }
    case 'kaese':
    case 'vegetarisch':
      return { minLengthMm: 80, maxLengthMm: 250, minLoadGrams: 500, keywords: ['leiste', 'schiene', 'rost'] }
    default:
      return { minLengthMm: 100, maxLengthMm: 350, minLoadGrams: 1_000, keywords: [] }
  }
}

/** Wieviel Räuchermehl wird je Durchgang ungefähr gebraucht? */
function mealQuantity(profile: AdvisorProfile): { grams: number; note: string } {
  const method = profile.method ?? 'heiss'
  if (method === 'kalt') {
    return {
      grams: 700,
      note: 'Beim Kalträuchern arbeitet ein Sparbrand über viele Stunden. Rechnen Sie mit rund 500 bis 900 g Mehl je Durchgang – je nach Größe des Brands.',
    }
  }
  if (method === 'warm') {
    return { grams: 300, note: 'Beim Warmräuchern reichen meist 200 bis 400 g je Durchgang.' }
  }
  return { grams: 200, note: 'Beim Heißräuchern genügen üblicherweise 150 bis 250 g je Durchgang.' }
}

/** Wieviel Lauge wird für die angegebene Menge Räuchergut gebraucht? */
function brineQuantity(amountGrams: number | undefined): { grams: number; note: string } {
  const food = amountGrams ?? 3_000
  // Faustregel: Lake etwa im Verhältnis 1:1 zum Räuchergut, Mischung nach
  // Herstellerangabe je Liter Wasser. Bewusst als Näherung formuliert.
  const liters = Math.max(2, Math.ceil(food / 1000))
  return {
    grams: liters * 100,
    note: `Für rund ${(food / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg Räuchergut brauchen Sie etwa ${liters} Liter Lake. Die Dosierung je Liter steht auf der jeweiligen Produktseite.`,
  }
}

interface ScoredRow {
  row: Parameters<typeof toCardData>[0]
  score: number
  reason: string
  suggestedQuantity?: number
}

/**
 * Erzeugt eine vollständige Empfehlung aus dem echten Katalog.
 * Liefert je Bereich höchstens `perCategory` Artikel.
 */
export async function recommend(
  profile: AdvisorProfile,
  perCategory = 3,
): Promise<AdvisorResult> {
  const hookSpec = hookProfile(profile)
  const woods = woodPreference(profile)
  const meal = mealQuantity(profile)
  const brine = brineQuantity(profile.amountGrams)

  // Material: V4A bei dauerhaftem Lake-/Salzkontakt oder ausgesprochenem
  // Qualitätsanspruch, sonst V2A.
  const preferV4A = profile.heavyBrineUse === true || profile.budget === 'hochwertig'

  const [hookRows, mealRows, brineRows, spiceRows] = await Promise.all([
    prisma.product.findMany({
      where: {
        active: true,
        visible: true,
        category: { slug: { in: ['raeucherhaken', 'fleischerhaken'] } },
      },
      select: { ...CARD_SELECT, lengthMm: true, loadCapacityGrams: true, usage: true, name: true },
    }),
    prisma.product.findMany({
      where: { active: true, visible: true, category: { slug: 'raeuchermehl' } },
      select: { ...CARD_SELECT, name: true, baseUnitAmount: true },
    }),
    prisma.product.findMany({
      where: { active: true, visible: true, category: { slug: 'raeucherlaugen' } },
      select: { ...CARD_SELECT, name: true, usage: true, baseUnitAmount: true },
    }),
    prisma.product.findMany({
      where: {
        active: true,
        visible: true,
        category: { OR: [{ slug: 'naturgewuerze' }, { parent: { slug: 'naturgewuerze' } }] },
      },
      select: { ...CARD_SELECT, name: true, usage: true },
      take: 200,
    }),
  ])

  const hooks = scoreHooks(hookRows, hookSpec, preferV4A, profile)
  const meals = scoreMeals(mealRows, woods, meal)
  const brines = scoreBrines(brineRows, profile, brine)
  const spices = scoreSpices(spiceRows, profile)

  const notes: string[] = [meal.note]
  if (profile.foodType && profile.foodType !== 'kaese' && profile.foodType !== 'vegetarisch') {
    notes.push(brine.note)
  }
  notes.push(
    preferV4A
      ? 'Wir empfehlen V4A (1.4404): Der Molybdänanteil macht den Werkstoff gegenüber chloridhaltiger Umgebung – also Pökellake und Salz – widerstandsfähiger als V2A.'
      : 'Für den beschriebenen Einsatz genügt V2A (1.4301). Bei dauerhaftem Kontakt mit Lake oder Salz wäre V4A die haltbarere Wahl.',
  )
  if (profile.experience === 'einsteiger') {
    notes.push(
      'Als Einstieg ist es sinnvoll, mit einer kleineren Menge und einem einzelnen Durchgang zu beginnen, bevor Sie den Ofen voll belegen.',
    )
  }

  return {
    hooks: toRecommendations(hooks, perCategory),
    meal: toRecommendations(meals, perCategory),
    brine: toRecommendations(brines, perCategory),
    spices: toRecommendations(spices, perCategory),
    summary: buildSummary(profile, preferV4A, woods),
    notes,
  }
}

function toRecommendations(scored: ScoredRow[], limit: number): Recommendation[] {
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      product: toCardData(entry.row),
      reason: entry.reason,
      suggestedQuantity: entry.suggestedQuantity,
      score: Math.round(entry.score),
    }))
}

type HookRow = Parameters<typeof toCardData>[0] & {
  lengthMm: number | null
  loadCapacityGrams: number | null
  usage: string | null
  name: string
}

function scoreHooks(
  rows: HookRow[],
  spec: ReturnType<typeof hookProfile>,
  preferV4A: boolean,
  profile: AdvisorProfile,
): ScoredRow[] {
  const out: ScoredRow[] = []

  for (const row of rows) {
    let score = 40
    const reasons: string[] = []
    const haystack = normalizeSearch(`${row.name} ${row.usage ?? ''}`)

    // Bauform passend zum Räuchergut
    const keywordHit = spec.keywords.some((k) => haystack.includes(normalizeSearch(k)))
    if (keywordHit) {
      score += 26
      reasons.push('Bauform passt zu Ihrem Räuchergut')
    }

    // Länge im sinnvollen Bereich
    if (row.lengthMm !== null) {
      if (row.lengthMm >= spec.minLengthMm && row.lengthMm <= spec.maxLengthMm) {
        score += 16
        reasons.push(`Länge von ${(row.lengthMm / 10).toLocaleString('de-DE')} cm passt zur Ofenhöhe`)
      } else {
        score -= 14
      }
    }

    // Belastbarkeit
    if (row.loadCapacityGrams !== null) {
      if (row.loadCapacityGrams >= spec.minLoadGrams) {
        score += 14
        reasons.push('trägt das Gewicht Ihres Räucherguts sicher')
      } else {
        score -= 26
      }
    }

    // Werkstoff
    if (preferV4A && row.material === 'V4A') {
      score += 20
      reasons.push('V4A für dauerhaften Kontakt mit Lake und Salz')
    } else if (!preferV4A && row.material === 'V2A') {
      score += 12
      reasons.push('V2A als solider Standard für diesen Einsatz')
    } else if (preferV4A && row.material === 'V2A') {
      score -= 10
    }

    // Verfügbarkeit und Preisrahmen
    if (row.stock <= 0) score -= 35
    if (profile.budget === 'sparsam' && row.priceCents > 2_500) score -= 12
    if (profile.budget === 'hochwertig' && row.priceCents > 2_000) score += 6
    if (row.bestseller) score += 5

    if (score <= 0) continue

    out.push({
      row,
      score,
      reason:
        reasons.length > 0
          ? capitalize(reasons.slice(0, 2).join(', '))
          : 'Solide Grundausstattung für den beschriebenen Einsatz',
      suggestedQuantity: profile.pieceCount ? Math.max(1, Math.ceil(profile.pieceCount * 1.15)) : undefined,
    })
  }

  return out
}

function scoreMeals(
  rows: Array<Parameters<typeof toCardData>[0] & { name: string; baseUnitAmount: number | null }>,
  woods: string[],
  meal: { grams: number },
): ScoredRow[] {
  const out: ScoredRow[] = []

  for (const row of rows) {
    let score = 30
    const haystack = normalizeSearch(row.name)
    const woodIndex = woods.findIndex((w) => haystack.includes(normalizeSearch(w)))

    if (woodIndex === 0) {
      score += 45
    } else if (woodIndex > 0) {
      score += 28
    } else {
      score -= 8
    }

    if (row.stock <= 0) score -= 35
    if (row.bestseller) score += 6

    const packSize = row.baseUnitAmount ?? 1000
    const suggested = Math.max(1, Math.ceil(meal.grams / packSize))

    out.push({
      row,
      score,
      reason:
        woodIndex === 0
          ? `${capitalize(woods[0])} passt am besten zu Ihrer Kombination aus Räuchergut und gewünschtem Geschmack`
          : woodIndex > 0
            ? `${capitalize(woods[woodIndex])} ist eine gute Alternative für dieses Rauchbild`
            : 'Universell einsetzbares Räuchermehl',
      suggestedQuantity: suggested,
    })
  }

  return out
}

function scoreBrines(
  rows: Array<Parameters<typeof toCardData>[0] & { name: string; usage: string | null; baseUnitAmount: number | null }>,
  profile: AdvisorProfile,
  brine: { grams: number },
): ScoredRow[] {
  const out: ScoredRow[] = []
  const detail = normalizeSearch(profile.foodDetail ?? '')
  const food = profile.foodType ?? ''

  for (const row of rows) {
    let score = 30
    const haystack = normalizeSearch(`${row.name} ${row.usage ?? ''}`)
    const reasons: string[] = []

    if (detail.length > 2 && haystack.includes(detail)) {
      score += 45
      reasons.push(`speziell auf ${profile.foodDetail} abgestimmt`)
    } else if (food && haystack.includes(normalizeSearch(food))) {
      score += 26
      reasons.push(`für ${food} ausgelegt`)
    }

    if (profile.flavor === 'mild' && /mild|klassisch|einsteiger/.test(haystack)) {
      score += 18
      reasons.push('milde Würzung')
    }
    if (profile.flavor === 'wuerzig' && /wuerz|kraeuter|pfeff|wacholder/.test(haystack)) {
      score += 18
      reasons.push('kräftige Würzung')
    }
    if (profile.experience === 'einsteiger' && /mild|klassisch|einsteiger/.test(haystack)) {
      score += 10
    }

    if (row.stock <= 0) score -= 35
    if (row.bestseller) score += 5

    const packSize = row.baseUnitAmount ?? 1000
    out.push({
      row,
      score,
      reason: reasons.length > 0 ? capitalize(reasons.slice(0, 2).join(', ')) : 'Vielseitig einsetzbare Lauge',
      suggestedQuantity: Math.max(1, Math.ceil(brine.grams / packSize)),
    })
  }

  return out
}

function scoreSpices(
  rows: Array<Parameters<typeof toCardData>[0] & { name: string; usage: string | null }>,
  profile: AdvisorProfile,
): ScoredRow[] {
  const out: ScoredRow[] = []
  const food = profile.foodType ?? ''
  const detail = normalizeSearch(profile.foodDetail ?? '')

  // Klassische Begleiter je Räuchergut — bewusst kurz gehalten.
  const staples: Record<string, string[]> = {
    fisch: ['dill', 'lorbeer', 'pfeffer', 'zitrone', 'wacholder'],
    fleisch: ['pfeffer', 'wacholder', 'knoblauch', 'majoran', 'koriander'],
    schinken: ['wacholder', 'pfeffer', 'koriander', 'lorbeer', 'knoblauch'],
    wurst: ['majoran', 'pfeffer', 'muskat', 'koriander', 'kuemmel'],
    gefluegel: ['paprika', 'thymian', 'rosmarin', 'knoblauch', 'pfeffer'],
    kaese: ['pfeffer', 'kuemmel', 'paprika'],
    vegetarisch: ['paprika', 'thymian', 'rosmarin', 'knoblauch'],
  }
  const wanted = staples[food] ?? ['pfeffer', 'lorbeer', 'wacholder']

  for (const row of rows) {
    const haystack = normalizeSearch(`${row.name} ${row.usage ?? ''}`)
    const index = wanted.findIndex((w) => haystack.includes(normalizeSearch(w)))
    if (index === -1 && !(detail.length > 2 && haystack.includes(detail))) continue

    let score = 45 - index * 5
    if (row.stock <= 0) score -= 35
    if (row.bestseller) score += 6
    if (profile.flavor === 'wuerzig') score += 5

    out.push({
      row,
      score,
      reason: `Klassischer Begleiter für ${foodLabel(food)}`,
    })
  }

  return out
}

function foodLabel(food: string): string {
  const labels: Record<string, string> = {
    fisch: 'Fisch',
    fleisch: 'Fleisch',
    schinken: 'Schinken',
    gefluegel: 'Geflügel',
    wurst: 'Wurst',
    kaese: 'Käse',
    vegetarisch: 'vegetarisches Räuchergut',
  }
  return labels[food] ?? 'Ihr Räuchergut'
}

function buildSummary(profile: AdvisorProfile, preferV4A: boolean, woods: string[]): string {
  const parts: string[] = []
  const food = profile.foodDetail ?? foodLabel(profile.foodType ?? '')
  const method =
    profile.method === 'kalt'
      ? 'Kalträuchern'
      : profile.method === 'warm'
        ? 'Warmräuchern'
        : 'Heißräuchern'

  parts.push(`Für ${food} im ${method}`)
  parts.push(`empfehlen wir ${preferV4A ? 'Haken aus V4A' : 'Haken aus V2A'}`)
  parts.push(`und ${capitalize(woods[0])} als Räuchermehl`)

  if (profile.pieceCount) {
    parts.push(`Bei ${profile.pieceCount} Stück je Durchgang planen Sie am besten etwas Reserve ein`)
  }

  return `${parts.join(', ')}.`
}

function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1)
}

/**
 * Sucht Artikel für die Chatberatung anhand freier Stichworte.
 * Wird von Smoky verwendet, damit die Antwort immer auf echten Artikeln fußt.
 */
export async function findProductsForAdvice(
  keywords: string[],
  limit = 6,
): Promise<ProductCardData[]> {
  const cleaned = keywords
    .map((k) => k.trim())
    .filter((k) => k.length >= 2)
    .slice(0, 8)
  if (cleaned.length === 0) return []

  const rows = await prisma.product.findMany({
    where: {
      active: true,
      visible: true,
      OR: cleaned.flatMap((keyword) => [
        { name: { contains: keyword } },
        { shortDescription: { contains: keyword } },
        { usage: { contains: keyword } },
        { material: { contains: keyword } },
      ]),
    },
    select: CARD_SELECT,
    orderBy: [{ bestseller: 'desc' }, { popularity: 'desc' }],
    take: limit,
  })

  return rows.map((row) => toCardData(row))
}
