import { z } from 'zod'
import { prisma } from '@/lib/db'
import { slugify, truncate } from '@/lib/utils/text'

/**
 * Leseschicht fuer den Wissensbereich.
 *
 * Die Artikel sind reiner Redaktionsinhalt ohne eigene Relationen und liegen
 * deshalb als JSON in der Setting-Tabelle unter dem Schluessel
 * `article:<slug>`. Genau daraus folgt die wichtigste Eigenschaft dieser Datei:
 * Der Inhalt ist unstrukturiert gespeichert und kann von aussen fehlerhaft
 * befuellt werden. Jeder Datensatz wird deshalb einzeln gegen ein Zod-Schema
 * geprueft. Ein fehlerhafter Datensatz wird uebersprungen und protokolliert —
 * er darf nie die Uebersicht oder die Sitemap zum Absturz bringen.
 */

const KEY_PREFIX = 'article:'

/** Grobe Lesegeschwindigkeit fuer deutsche Sachtexte. */
const WORDS_PER_MINUTE = 200

// --- Schema ----------------------------------------------------------------

const sectionSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  paragraphs: z.array(z.string().trim().min(1)).min(1),
  bullets: z.array(z.string().trim().min(1)).optional(),
})

const faqEntrySchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(2_000),
})

const storedArticleSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  teaser: z.string().trim().min(1).max(800),
  metaDescription: z.string().trim().min(1).max(400).optional(),
  readMinutes: z.number().int().min(1).max(120).optional(),
  sections: z.array(sectionSchema).min(1),
  faq: z.array(faqEntrySchema).optional(),
})

// --- Typen -----------------------------------------------------------------

export interface ArticleSection {
  /** Sprungmarke fuer das Inhaltsverzeichnis; innerhalb eines Artikels eindeutig. */
  id: string
  heading: string
  paragraphs: string[]
  bullets: string[]
}

export interface ArticleFaqEntry {
  question: string
  answer: string
}

export interface Article {
  slug: string
  title: string
  teaser: string
  metaDescription: string
  readMinutes: number
  sections: ArticleSection[]
  faq: ArticleFaqEntry[]
  /** Letzte Aenderung des Datensatzes — die Setting-Tabelle fuehrt kein Erstelldatum. */
  updatedAt: Date
}

// --- Aufbereitung ----------------------------------------------------------

/**
 * Eindeutige Sprungmarken.
 *
 * Zwei Abschnitte koennen dieselbe Ueberschrift tragen; doppelte id-Attribute
 * wuerden die Sprungmarken des Inhaltsverzeichnisses unbrauchbar machen.
 */
function buildSectionId(heading: string, used: Set<string>): string {
  const base = `abschnitt-${slugify(heading) || 'inhalt'}`
  let candidate = base
  let counter = 2
  while (used.has(candidate)) {
    candidate = `${base}-${counter}`
    counter += 1
  }
  used.add(candidate)
  return candidate
}

function estimateReadMinutes(sections: Array<{ paragraphs: string[]; bullets?: string[] }>): number {
  const words = sections.reduce((total, section) => {
    const text = [...section.paragraphs, ...(section.bullets ?? [])].join(' ')
    return total + text.split(/\s+/).filter(Boolean).length
  }, 0)
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

/**
 * Validiert einen gespeicherten Datensatz und bringt ihn in die Form, die die
 * Seiten erwarten. Liefert null, wenn der Datensatz unbrauchbar ist.
 */
function parseArticle(row: { key: string; value: string; updatedAt: Date }): Article | null {
  let raw: unknown
  try {
    raw = JSON.parse(row.value)
  } catch {
    console.error(`[articles] Ungültiges JSON im Datensatz ${row.key}`)
    return null
  }

  const parsed = storedArticleSchema.safeParse(raw)
  if (!parsed.success) {
    console.error(
      `[articles] Datensatz ${row.key} übersprungen:`,
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    )
    return null
  }

  const data = parsed.data
  const keySlug = row.key.slice(KEY_PREFIX.length)

  /*
   * Der Schluessel bestimmt die URL, der Inhalt traegt den Slug noch einmal.
   * Laufen beide auseinander, waere die Seite unter einer Adresse erreichbar,
   * auf die ihre eigenen Verweise nicht zeigen — deshalb gilt der Schluessel.
   */
  if (data.slug !== keySlug) {
    console.error(`[articles] Slug "${data.slug}" passt nicht zum Schlüssel ${row.key}`)
  }

  const used = new Set<string>()
  const sections: ArticleSection[] = data.sections.map((section) => ({
    id: buildSectionId(section.heading, used),
    heading: section.heading,
    paragraphs: section.paragraphs,
    bullets: section.bullets ?? [],
  }))

  return {
    slug: keySlug,
    title: data.title,
    teaser: data.teaser,
    metaDescription: data.metaDescription ?? truncate(data.teaser.replace(/\s+/g, ' '), 158),
    readMinutes: data.readMinutes ?? estimateReadMinutes(data.sections),
    sections,
    faq: data.faq ?? [],
    updatedAt: row.updatedAt,
  }
}

// --- Redaktionelle Ordnung -------------------------------------------------

export interface ArticleGroup {
  key: string
  title: string
  description: string
  /** Reihenfolge innerhalb der Gruppe. */
  slugs: readonly string[]
}

/**
 * Themengruppen des Wissensbereichs.
 *
 * Die Gruppierung ist eine redaktionelle Entscheidung und gehoert deshalb in
 * den Code, nicht in den Artikeltext. Artikel, die hier nicht genannt sind,
 * gehen nicht verloren — sie erscheinen am Ende unter "Weitere Beiträge".
 */
export const ARTICLE_GROUPS: readonly ArticleGroup[] = [
  {
    key: 'grundlagen',
    title: 'Grundlagen',
    description: 'Wie Salz, Trocknung und Rauch zusammenwirken – der Einstieg für die ersten Rauchgänge.',
    slugs: ['grundlagen-des-raeucherns', 'raeuchermethoden', 'poekeln-und-laken'],
  },
  {
    key: 'praxis',
    title: 'Praxis nach Räuchergut',
    description: 'Vorgehen, Zeiten und Temperaturen für Fisch, Fleisch, Schinken und Würzung.',
    slugs: ['fisch-raeuchern', 'fleisch-und-schinken-raeuchern', 'gewuerze-beim-raeuchern'],
  },
  {
    key: 'material',
    title: 'Material und Ausstattung',
    description: 'Welcher Haken, welcher Edelstahl, welches Räuchermehl – und wie der Ofen eingerichtet wird.',
    slugs: [
      'raeucherhaken-auswaehlen',
      'edelstahl-v2a-v4a',
      'raeuchermehl-und-holzarten',
      'raeucherofen-einrichten',
    ],
  },
] as const

const FALLBACK_GROUP_KEY = 'weitere'
const FALLBACK_GROUP_TITLE = 'Weitere Beiträge'

/** Gruppenschluessel je Slug — einmal aufgebaut, danach nur noch gelesen. */
const GROUP_BY_SLUG = new Map<string, string>(
  ARTICLE_GROUPS.flatMap((group) => group.slugs.map((slug) => [slug, group.key] as const)),
)

/** Redaktionelle Position; unbekannte Artikel landen hinter allen bekannten. */
const ORDER_BY_SLUG = new Map<string, number>(
  ARTICLE_GROUPS.flatMap((group, groupIndex) =>
    group.slugs.map((slug, slugIndex) => [slug, groupIndex * 100 + slugIndex] as const),
  ),
)

function editorialOrder(a: Article, b: Article): number {
  const rankA = ORDER_BY_SLUG.get(a.slug) ?? Number.MAX_SAFE_INTEGER
  const rankB = ORDER_BY_SLUG.get(b.slug) ?? Number.MAX_SAFE_INTEGER
  return rankA - rankB || a.title.localeCompare(b.title, 'de')
}

export function articleGroupKey(slug: string): string {
  return GROUP_BY_SLUG.get(slug) ?? FALLBACK_GROUP_KEY
}

export function articleGroupTitle(key: string): string {
  return ARTICLE_GROUPS.find((group) => group.key === key)?.title ?? FALLBACK_GROUP_TITLE
}

/** Auswahlmoeglichkeiten des Themenfilters — nur Gruppen, die auch Artikel haben. */
export function availableGroups(articles: Article[]): Array<{ key: string; title: string; count: number }> {
  const counts = new Map<string, number>()
  for (const article of articles) {
    const key = articleGroupKey(article.slug)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const groups = ARTICLE_GROUPS.filter((group) => counts.has(group.key)).map((group) => ({
    key: group.key,
    title: group.title,
    count: counts.get(group.key) ?? 0,
  }))

  if (counts.has(FALLBACK_GROUP_KEY)) {
    groups.push({
      key: FALLBACK_GROUP_KEY,
      title: FALLBACK_GROUP_TITLE,
      count: counts.get(FALLBACK_GROUP_KEY) ?? 0,
    })
  }
  return groups
}

export interface GroupedArticles {
  key: string
  title: string
  description: string
  articles: Article[]
}

/** Artikel in ihre Themengruppen einsortieren. Leere Gruppen entfallen. */
export function groupArticles(articles: Article[]): GroupedArticles[] {
  const groups: GroupedArticles[] = ARTICLE_GROUPS.map((group) => ({
    key: group.key,
    title: group.title,
    description: group.description,
    articles: [],
  }))

  const rest: Article[] = []
  for (const article of articles) {
    const target = groups.find((group) => group.key === articleGroupKey(article.slug))
    if (target) target.articles.push(article)
    else rest.push(article)
  }

  const result = groups.filter((group) => group.articles.length > 0)
  if (rest.length > 0) {
    result.push({
      key: FALLBACK_GROUP_KEY,
      title: FALLBACK_GROUP_TITLE,
      description: 'Beiträge, die zu keinem der Schwerpunkte gehören.',
      articles: rest,
    })
  }
  return result
}

// --- Verweise in den Katalog und die Rezepte -------------------------------

/**
 * Redaktionell gepflegte Querverweise.
 *
 * Die Zielslugs werden beim Aufloesen gegen die Datenbank geprueft: Was dort
 * nicht (mehr) sichtbar ist, erscheint auch nicht als Verweis. Damit kann ein
 * deaktivierter Artikel oder ein zurueckgezogenes Rezept keinen toten Link
 * hinterlassen.
 */
const ARTICLE_REFERENCES: Record<string, { categories: readonly string[]; recipes: readonly string[] }> = {
  'grundlagen-des-raeucherns': {
    categories: ['raeucherhaken', 'raeuchermehl'],
    recipes: ['heissgeraeucherte-forelle-aus-der-salzlake', 'kaltgeraeucherte-lachsseite-ueber-erlenmehl'],
  },
  raeuchermethoden: {
    categories: ['raeuchermehl', 'raeucherhaken'],
    recipes: [
      'kaltgeraeucherte-lachsseite-ueber-erlenmehl',
      'warmgeraeucherter-saibling-ueber-apfelholz',
      'heissgeraeucherte-makrele-mit-pfeffer-und-zitronenschale',
    ],
  },
  'poekeln-und-laken': {
    categories: ['raeucherlaugen', 'salze'],
    recipes: ['kaltgeraeucherter-rinderschinken-aus-der-oberschale', 'lachsschinken-vom-schweineruecken'],
  },
  'fisch-raeuchern': {
    categories: ['raeucherhaken', 'raeucherlaugen'],
    recipes: [
      'heissgeraeucherte-forelle-aus-der-salzlake',
      'raeucheraal-aus-dem-stehenden-ofen',
      'kaltgeraeuchertes-zanderfilet-mit-wacholder',
    ],
  },
  'fleisch-und-schinken-raeuchern': {
    categories: ['fleischerhaken', 'raeucherlaugen'],
    recipes: [
      'lachsschinken-vom-schweineruecken',
      'geraeucherter-bauchspeck-mit-wacholder',
      'nussschinken-aus-der-oberschale',
    ],
  },
  'gewuerze-beim-raeuchern': {
    categories: ['naturgewuerze', 'gewuerze-einzeln', 'gewuerzmischungen', 'kraeuter'],
    recipes: ['heissgeraeucherte-makrele-mit-pfeffer-und-zitronenschale', 'kaminwurzen-aus-dem-kaltrauch'],
  },
  'raeucherhaken-auswaehlen': {
    categories: ['raeucherhaken', 'fleischerhaken', 'sonderanfertigungen'],
    recipes: ['raeucheraal-aus-dem-stehenden-ofen', 'kaminwurzen-aus-dem-kaltrauch'],
  },
  'edelstahl-v2a-v4a': {
    categories: ['raeucherhaken', 'fleischerhaken'],
    recipes: [],
  },
  'raeuchermehl-und-holzarten': {
    categories: ['raeuchermehl'],
    recipes: [
      'kaltgeraeucherte-lachsseite-ueber-erlenmehl',
      'warmgeraeucherte-entenbrust-ueber-kirschholz',
      'kaltgeraeucherte-haehnchenbrust-mit-apfelholz',
    ],
  },
  'raeucherofen-einrichten': {
    categories: ['raeucherhaken', 'raeuchermehl'],
    recipes: ['grobe-knacker-warm-geraeuchert', 'kaltgeraeucherter-bergkaese-am-stueck'],
  },
}

export interface ArticleLink {
  label: string
  href: string
}

export interface ArticleReferences {
  categories: ArticleLink[]
  recipes: ArticleLink[]
}

const EMPTY_REFERENCES: ArticleReferences = { categories: [], recipes: [] }

/**
 * Loest die Querverweise mehrerer Artikel in einem Zug auf — zwei Abfragen
 * unabhaengig von der Anzahl der Artikel.
 */
export async function getArticleReferences(slugs: string[]): Promise<Map<string, ArticleReferences>> {
  const wanted = slugs.map((slug) => ARTICLE_REFERENCES[slug]).filter(Boolean)
  const categorySlugs = [...new Set(wanted.flatMap((entry) => entry.categories))]
  const recipeSlugs = [...new Set(wanted.flatMap((entry) => entry.recipes))]

  const [categories, recipes] = await Promise.all([
    categorySlugs.length > 0
      ? prisma.category.findMany({
          where: { slug: { in: categorySlugs }, active: true },
          select: { slug: true, name: true },
        })
      : Promise.resolve([]),
    recipeSlugs.length > 0
      ? prisma.recipe.findMany({
          where: { slug: { in: recipeSlugs }, published: true },
          select: { slug: true, title: true },
        })
      : Promise.resolve([]),
  ])

  const categoryBySlug = new Map(categories.map((row) => [row.slug, row.name]))
  const recipeBySlug = new Map(recipes.map((row) => [row.slug, row.title]))

  const result = new Map<string, ArticleReferences>()
  for (const slug of slugs) {
    const entry = ARTICLE_REFERENCES[slug]
    if (!entry) {
      result.set(slug, EMPTY_REFERENCES)
      continue
    }
    result.set(slug, {
      categories: entry.categories
        .filter((target) => categoryBySlug.has(target))
        .map((target) => ({ label: categoryBySlug.get(target) as string, href: `/kategorie/${target}` })),
      recipes: entry.recipes
        .filter((target) => recipeBySlug.has(target))
        .map((target) => ({ label: recipeBySlug.get(target) as string, href: `/rezepte/${target}` })),
    })
  }
  return result
}

// --- Zugriff ---------------------------------------------------------------

/**
 * Alle gueltigen Artikel in redaktioneller Reihenfolge.
 * Fehlerhafte Datensaetze fehlen in der Liste, brechen sie aber nicht ab.
 */
export async function listArticles(): Promise<Article[]> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
    select: { key: true, value: true, updatedAt: true },
  })

  return rows
    .map(parseArticle)
    .filter((article): article is Article => article !== null)
    .sort(editorialOrder)
}

/** Einzelner Artikel. Liefert null, wenn er fehlt oder unbrauchbar ist. */
export async function getArticle(slug: string): Promise<Article | null> {
  const row = await prisma.setting.findUnique({
    where: { key: `${KEY_PREFIX}${slug}` },
    select: { key: true, value: true, updatedAt: true },
  })
  return row ? parseArticle(row) : null
}

/**
 * Verwandte Artikel: zuerst aus derselben Themengruppe, danach aufgefuellt.
 * So steht am Ende jedes Beitrags ein Weiterweg, auch bei kleinen Gruppen.
 */
export function relatedArticles(all: Article[], current: Article, limit = 3): Article[] {
  const groupKey = articleGroupKey(current.slug)
  const candidates = all.filter((article) => article.slug !== current.slug)
  const sameGroup = candidates.filter((article) => articleGroupKey(article.slug) === groupKey)
  const others = candidates.filter((article) => articleGroupKey(article.slug) !== groupKey)
  return [...sameGroup, ...others].slice(0, limit)
}

/** Volltextsuche ueber Titel, Teaser, Ueberschriften und FAQ-Fragen. */
export function searchArticles(articles: Article[], query: string): Article[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return articles

  return articles.filter((article) => {
    const haystack = [
      article.title,
      article.teaser,
      ...article.sections.map((section) => section.heading),
      ...article.sections.flatMap((section) => section.paragraphs),
      ...article.faq.map((entry) => entry.question),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
}
