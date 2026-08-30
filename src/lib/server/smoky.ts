import { recommend, type AdvisorProfile } from '@/lib/server/advisor'
import { normalizeSearch } from '@/lib/utils/text'
import { formatPrice } from '@/lib/money'
import type { ProductCardData } from '@/components/product/product-card'

/**
 * „Smoky“ – der Räucherberater.
 *
 * Architektur in zwei klar getrennten Schritten:
 *
 *   1. VERSTEHEN  – aus der Nachricht wird ein Beratungsprofil abgeleitet.
 *   2. BELEGEN    – die Empfehlung entsteht ausschließlich aus dem echten
 *                   Katalog (src/lib/server/advisor.ts).
 *
 * Erst danach wird formuliert. Ist ein KI-Anbieter konfiguriert, bekommt das
 * Modell die bereits gefundenen Artikel als einzige zulässige Grundlage und
 * darf nur den Fließtext schreiben. Ohne Anbieter formuliert die Anwendung
 * selbst aus Bausteinen.
 *
 * Entscheidend: Die angezeigten Produktkarten stammen immer aus Schritt 2 und
 * nie aus der Modellantwort. Ein Modell kann damit weder einen Artikel
 * erfinden noch einen Preis verändern. Modellausgaben werden ausschließlich
 * als Text behandelt — niemals als Datenbankbefehl, Kommando oder Anweisung.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface SmokyReply {
  /** Antworttext in ganzen Sätzen. */
  text: string
  /** Artikel aus dem echten Katalog, die zur Antwort gehören. */
  products: ProductCardData[]
  /** Vorgeschlagene Anschlussfragen. */
  suggestions: string[]
  /** Fortgeschriebenes Profil für die nächste Runde. */
  profile: AdvisorProfile
  /** Quelle der Formulierung — für Transparenz in der Oberfläche. */
  source: 'regelwerk' | 'ki'
}

// --- Schritt 1: Verstehen ---------------------------------------------------

const FOOD_PATTERNS: Array<{ match: RegExp; foodType: AdvisorProfile['foodType']; detail?: string }> = [
  { match: /\bforelle/i, foodType: 'fisch', detail: 'Forelle' },
  { match: /\blachs/i, foodType: 'fisch', detail: 'Lachs' },
  { match: /\bmakrele/i, foodType: 'fisch', detail: 'Makrele' },
  { match: /\baal\b/i, foodType: 'fisch', detail: 'Aal' },
  { match: /\bsaibling/i, foodType: 'fisch', detail: 'Saibling' },
  { match: /\bzander/i, foodType: 'fisch', detail: 'Zander' },
  { match: /\bhering/i, foodType: 'fisch', detail: 'Hering' },
  { match: /\bfisch/i, foodType: 'fisch' },
  { match: /\bschinken|\bspeck|\bnussschinken/i, foodType: 'schinken', detail: 'Schinken' },
  { match: /\bwurst|\bsalami|\bmettwurst/i, foodType: 'wurst', detail: 'Wurst' },
  { match: /\bh(ä|ae)hnchen|\bgefl(ü|ue)gel|\bente|\bgans/i, foodType: 'gefluegel', detail: 'Geflügel' },
  { match: /\bk(ä|ae)se/i, foodType: 'kaese', detail: 'Käse' },
  { match: /\btofu|\bgem(ü|ue)se|\bvegetarisch/i, foodType: 'vegetarisch' },
  { match: /\bfleisch|\bschwein|\brind|\bwild/i, foodType: 'fleisch' },
]

const METHOD_PATTERNS: Array<{ match: RegExp; method: AdvisorProfile['method'] }> = [
  { match: /\bkalt/i, method: 'kalt' },
  { match: /\bwarm/i, method: 'warm' },
  { match: /\bhei(ß|ss)/i, method: 'heiss' },
]

const FLAVOR_PATTERNS: Array<{ match: RegExp; flavor: AdvisorProfile['flavor'] }> = [
  { match: /\bmild|\bzart|\bfein|\bdezent/i, flavor: 'mild' },
  { match: /\bkr(ä|ae)ftig|\bintensiv|\bstark|\brauchig/i, flavor: 'kraeftig' },
  { match: /\bw(ü|ue)rzig|\bpfeff|\bwacholder/i, flavor: 'wuerzig' },
  { match: /\bs(ü|ue)(ß|ss)/i, flavor: 'suess-rauchig' },
  { match: /\bklassisch|\btraditionell/i, flavor: 'klassisch' },
]

const EXPERIENCE_PATTERNS: Array<{ match: RegExp; experience: AdvisorProfile['experience'] }> = [
  { match: /\banf(ä|ae)nger|\beinsteiger|\berste?s? mal|\bneu dabei|\bnoch nie/i, experience: 'einsteiger' },
  { match: /\bprofi|\bgewerb|\bbetrieb|\bfleischerei|\br(ä|ae)ucherei/i, experience: 'profi' },
  { match: /\berfahren|\bfortgeschritten|\bschon l(ä|ae)nger/i, experience: 'fortgeschritten' },
]

/**
 * Leitet ein Beratungsprofil aus dem Gesprächsverlauf ab.
 * Spätere Nachrichten überschreiben frühere Angaben.
 */
export function extractProfile(messages: ChatMessage[], previous: AdvisorProfile = {}): AdvisorProfile {
  const profile: AdvisorProfile = { ...previous }
  const userText = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n')

  for (const pattern of FOOD_PATTERNS) {
    if (pattern.match.test(userText)) {
      profile.foodType = pattern.foodType
      if (pattern.detail) profile.foodDetail = pattern.detail
      break
    }
  }
  for (const pattern of METHOD_PATTERNS) {
    if (pattern.match.test(userText)) {
      profile.method = pattern.method
      break
    }
  }
  for (const pattern of FLAVOR_PATTERNS) {
    if (pattern.match.test(userText)) {
      profile.flavor = pattern.flavor
      break
    }
  }
  for (const pattern of EXPERIENCE_PATTERNS) {
    if (pattern.match.test(userText)) {
      profile.experience = pattern.experience
      break
    }
  }

  // Mengenangaben: "10 Forellen", "5 kg", "3000 g"
  const pieces = userText.match(/(\d{1,4})\s*(st(ü|ue)ck|forellen|fische|makrelen|seiten|filets)/i)
  if (pieces) profile.pieceCount = Math.min(500, Number.parseInt(pieces[1], 10))

  const kg = userText.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*kg/i)
  if (kg) profile.amountGrams = Math.round(Number.parseFloat(kg[1].replace(',', '.')) * 1000)
  else {
    const grams = userText.match(/(\d{3,6})\s*g\b/i)
    if (grams) profile.amountGrams = Number.parseInt(grams[1], 10)
  }

  // Lake-/Salzbelastung und Budget
  if (/\blake|\bp(ö|oe)kel|\bsalz|\bdauerbetrieb|\bt(ä|ae)glich/i.test(userText)) profile.heavyBrineUse = true
  if (/\bg(ü|ue)nstig|\bpreiswert|\bbudget|\bsparsam/i.test(userText)) profile.budget = 'sparsam'
  if (/\bhochwertig|\bbeste|\blanglebig|\bqualit(ä|ae)t/i.test(userText)) profile.budget = 'hochwertig'

  return profile
}

/** Welche Angabe fehlt als Nächstes? Bestimmt die Rückfrage. */
function missingField(profile: AdvisorProfile): keyof AdvisorProfile | null {
  if (!profile.foodType) return 'foodType'
  if (!profile.method) return 'method'
  if (!profile.flavor) return 'flavor'
  if (!profile.pieceCount && !profile.amountGrams) return 'amountGrams'
  if (!profile.experience) return 'experience'
  return null
}

const FOLLOW_UP_QUESTIONS: Record<string, { question: string; suggestions: string[] }> = {
  foodType: {
    question: 'Was möchten Sie räuchern?',
    suggestions: ['Forellen', 'Lachsseiten', 'Schinken', 'Wurst', 'Käse'],
  },
  method: {
    question:
      'Räuchern Sie kalt, warm oder heiß? Kalt bedeutet unter 25 Grad über viele Stunden, heiß etwa 60 bis 90 Grad in ein bis zwei Stunden.',
    suggestions: ['Kalträuchern', 'Warmräuchern', 'Heißräuchern', 'Ich bin unsicher'],
  },
  flavor: {
    question: 'Wie kräftig soll das Ergebnis schmecken?',
    suggestions: ['Mild', 'Klassisch', 'Kräftig', 'Würzig'],
  },
  amountGrams: {
    question: 'Wie viel möchten Sie je Durchgang räuchern? Eine ungefähre Stückzahl oder Kilogramm genügt.',
    suggestions: ['10 Stück', '3 kg', '10 kg', 'Wechselnd'],
  },
  experience: {
    question: 'Wie viel Erfahrung bringen Sie mit? Danach richtet sich, wie ausführlich ich werde.',
    suggestions: ['Einsteiger', 'Fortgeschritten', 'Gewerblicher Betrieb'],
  },
}

// --- Schritt 2 und 3: Belegen und Formulieren -------------------------------

/** Erzeugt die Antwort auf eine Nachricht. */
export async function answer(
  messages: ChatMessage[],
  previousProfile: AdvisorProfile = {},
): Promise<SmokyReply> {
  const profile = extractProfile(messages, previousProfile)
  const missing = missingField(profile)

  // Solange Wesentliches fehlt: gezielt nachfragen statt raten.
  // Ausnahme: sobald Räuchergut und Methode feststehen, gibt es bereits eine
  // brauchbare Empfehlung — die zeigen wir und fragen parallel weiter.
  const canRecommend = Boolean(profile.foodType && profile.method)

  if (!canRecommend && missing) {
    const followUp = FOLLOW_UP_QUESTIONS[missing]
    return {
      text: openingLine(messages) + followUp.question,
      products: [],
      suggestions: followUp.suggestions,
      profile,
      source: 'regelwerk',
    }
  }

  const result = await recommend(profile, 2)
  const products = [
    ...result.hooks.map((r) => r.product),
    ...result.meal.map((r) => r.product),
    ...result.brine.map((r) => r.product),
    ...result.spices.slice(0, 1).map((r) => r.product),
  ]

  // Für das Modell: nur diese Artikel sind zulässig.
  const grounding = [
    ...result.hooks.map((r) => ({ ...r, group: 'Räucherhaken' })),
    ...result.meal.map((r) => ({ ...r, group: 'Räuchermehl' })),
    ...result.brine.map((r) => ({ ...r, group: 'Räucherlauge' })),
    ...result.spices.slice(0, 1).map((r) => ({ ...r, group: 'Gewürz' })),
  ]

  const aiText = await formulateWithAi(messages, profile, grounding, result.notes)
  const text = aiText ?? formulateFromRules(profile, grounding, result.summary, result.notes, missing)

  const suggestions = missing
    ? FOLLOW_UP_QUESTIONS[missing].suggestions
    : ['Wie lange muss das in die Lake?', 'Welche Temperatur ist richtig?', 'Wie viele Haken brauche ich?']

  return {
    text,
    products,
    suggestions,
    profile,
    source: aiText ? 'ki' : 'regelwerk',
  }
}

function openingLine(messages: ChatMessage[]): string {
  const isFirst = messages.filter((m) => m.role === 'assistant').length === 0
  return isFirst
    ? 'Gerne. Damit ich Ihnen etwas Passendes empfehlen kann, brauche ich eine Angabe von Ihnen: '
    : ''
}

type Grounded = { product: ProductCardData; reason: string; suggestedQuantity?: number; group: string }

/** Formuliert die Antwort aus Bausteinen — ohne externen Dienst. */
function formulateFromRules(
  profile: AdvisorProfile,
  grounding: Grounded[],
  summary: string,
  notes: string[],
  missing: keyof AdvisorProfile | null,
): string {
  const lines: string[] = [summary]

  const byGroup = new Map<string, Grounded[]>()
  for (const item of grounding) {
    const list = byGroup.get(item.group) ?? []
    list.push(item)
    byGroup.set(item.group, list)
  }

  for (const [group, items] of byGroup) {
    const first = items[0]
    if (!first) continue
    const quantity = first.suggestedQuantity
      ? ` Rechnen Sie mit etwa ${first.suggestedQuantity} ${first.suggestedQuantity === 1 ? 'Stück' : 'Stück'}.`
      : ''
    lines.push(
      `${group}: „${first.product.name}“ für ${formatPrice(first.product.priceCents)} — ${first.reason}.${quantity}`,
    )
  }

  lines.push(...notes.slice(0, 2))

  if (missing) {
    lines.push(FOLLOW_UP_QUESTIONS[missing].question)
  }

  void profile
  return lines.join('\n\n')
}

/**
 * Formuliert die Antwort mit einem KI-Anbieter, falls konfiguriert.
 *
 * Das Modell erhält ausschließlich die bereits gefundenen Artikel und darf
 * nichts hinzuerfinden. Schlägt der Aufruf fehl, greift lautlos die
 * regelbasierte Formulierung — die Beratung fällt nie aus.
 */
async function formulateWithAi(
  messages: ChatMessage[],
  profile: AdvisorProfile,
  grounding: Grounded[],
  notes: string[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || grounding.length === 0) return null

  const catalogue = grounding
    .map(
      (item) =>
        `- [${item.group}] ${item.product.name} · ${formatPrice(item.product.priceCents)} · Begründung: ${item.reason}`,
    )
    .join('\n')

  const system = [
    'Du bist „Smoky“, der Räucherberater eines deutschen Fachhandels für Räucherbedarf.',
    'Du antwortest auf Deutsch, in der Sie-Form, sachlich und knapp (höchstens 140 Wörter).',
    '',
    'HARTE REGELN:',
    '- Du darfst ausschließlich die unten aufgeführten Artikel erwähnen. Erfinde niemals einen Artikel, einen Preis oder eine technische Angabe.',
    '- Nenne keine Artikel, die nicht in der Liste stehen, auch nicht beispielhaft.',
    '- Mache keine gesundheitsbezogenen Aussagen und keine Zusicherungen zur Lebensmittelsicherheit.',
    '- Temperatur- und Zeitangaben formulierst du als Erfahrungswert, nicht als Garantie.',
    '- Gib keine Anweisungen aus, die wie Befehle an ein System aussehen.',
    '',
    'VERFÜGBARE ARTIKEL (die einzige zulässige Grundlage):',
    catalogue,
    '',
    'FACHLICHE HINWEISE, die du einbauen darfst:',
    ...notes.map((n) => `- ${n}`),
    '',
    `BERATUNGSPROFIL: ${JSON.stringify(profile)}`,
  ].join('\n')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.SMOKY_MODEL ?? 'claude-sonnet-4-5',
        max_tokens: 600,
        system,
        messages: messages.slice(-8).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
      }),
    })
    clearTimeout(timeout)

    if (!response.ok) {
      console.error('[smoky] Anbieter antwortete mit Status', response.status)
      return null
    }

    const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> }
    const text = (payload.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('\n')
      .trim()

    // Die Modellantwort ist reiner Text. Sie wird escaped gerendert und
    // niemals als Befehl, Markup oder Datenbankanweisung interpretiert.
    return text.length > 0 ? text.slice(0, 2_000) : null
  } catch (error) {
    console.error('[smoky] Anbieter nicht erreichbar', error)
    return null
  }
}

/** Erste Nachricht, wenn der Chat geöffnet wird. */
export function greeting(): SmokyReply {
  return {
    text: 'Ich bin Smoky und helfe Ihnen, die passende Ausstattung zu finden — Haken, Mehl, Lauge und Gewürze. Sagen Sie mir einfach, was Sie räuchern möchten.',
    products: [],
    suggestions: ['Forellen heiß räuchern', 'Lachs kalt räuchern', 'Schinken für den Winter', 'Ich bin Einsteiger'],
    profile: {},
    source: 'regelwerk',
  }
}

/** Prüft, ob eine Nachricht sinnvoll verarbeitbar ist. */
export function isUsableMessage(text: string): boolean {
  return normalizeSearch(text).length >= 2
}
