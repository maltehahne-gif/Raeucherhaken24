import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, ChevronDown, CookingPot, Search, X } from 'lucide-react'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/seo/structured-data'
import { JsonLdScript } from '@/components/seo/json-ld'
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { RecipeCard, type RecipeCardData } from '@/components/recipe/recipe-card'
import { formatNumber } from '@/lib/money'
import { cn } from '@/lib/utils/cn'
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  FLAVOR_LABELS,
  FLAVORS,
  FOOD_TYPE_LABELS,
  FOOD_TYPES,
  SMOKE_METHOD_LABELS,
  SMOKE_METHODS,
  WOOD_TYPE_LABELS,
  WOOD_TYPES,
} from '@/lib/domain/enums'

/**
 * Rezeptuebersicht.
 *
 * Filter, Suche, Sortierung und Seite stecken vollstaendig in der URL. Alle
 * Bedienelemente sind echte Links bzw. ein GET-Formular — die Seite ist damit
 * ohne Client-JavaScript benutzbar, teilbar und von Suchmaschinen lesbar.
 */

const PAGE_SIZE = 12

/**
 * Obergrenze fuer die Sortierung im Speicher. Zwei der drei Sortierungen
 * beruhen auf berechneten Werten (Durchschnitt, Gesamtdauer), die Prisma nicht
 * in `orderBy` abbilden kann. Der Rezeptbestand ist redaktionell gepflegt und
 * bleibt ueberschaubar; die Grenze schuetzt trotzdem vor Ausreissern.
 */
const MAX_SORTABLE_ROWS = 600

const RECIPE_SORTS = ['neu', 'bewertung', 'dauer'] as const
type RecipeSort = (typeof RECIPE_SORTS)[number]

const RECIPE_SORT_LABELS: Record<RecipeSort, string> = {
  neu: 'Neueste',
  bewertung: 'Beste Bewertung',
  dauer: 'Kürzeste Zubereitung',
}

/** Ein Filter je Dimension: URL-Parameter, Ueberschrift und erlaubte Werte. */
const FILTER_DIMENSIONS = [
  { key: 'methods', param: 'methode', title: 'Räuchermethode', values: SMOKE_METHODS, labels: SMOKE_METHOD_LABELS },
  { key: 'foodTypes', param: 'lebensmittel', title: 'Lebensmittel', values: FOOD_TYPES, labels: FOOD_TYPE_LABELS },
  { key: 'flavors', param: 'geschmack', title: 'Geschmack', values: FLAVORS, labels: FLAVOR_LABELS },
  { key: 'woodTypes', param: 'holz', title: 'Holzart', values: WOOD_TYPES, labels: WOOD_TYPE_LABELS },
  { key: 'difficulties', param: 'schwierigkeit', title: 'Schwierigkeit', values: DIFFICULTIES, labels: DIFFICULTY_LABELS },
] as const

type DimensionKey = (typeof FILTER_DIMENSIONS)[number]['key']

interface RecipeFilters {
  methods: string[]
  foodTypes: string[]
  flavors: string[]
  woodTypes: string[]
  difficulties: string[]
  query: string | null
  sort: RecipeSort
  page: number
}

type SearchParamsInput = Record<string, string | string[] | undefined>

const BASE_PATH = '/rezepte'

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Liest eine Mehrfachauswahl und verwirft alles, was kein gueltiger Wert ist. */
function parseMulti(value: string | string[] | undefined, allowed: readonly string[]): string[] {
  if (value === undefined) return []
  const raw = Array.isArray(value) ? value : [value]
  const seen = new Set<string>()
  for (const entry of raw.flatMap((v) => v.split(','))) {
    const trimmed = entry.trim()
    if (allowed.includes(trimmed)) seen.add(trimmed)
  }
  return [...seen]
}

/**
 * Filter aus der URL lesen. Ungueltige Werte werden still verworfen statt eine
 * Fehlerseite zu erzeugen — eine manipulierte URL soll die Uebersicht nicht
 * unbenutzbar machen.
 */
function parseRecipeFilters(params: SearchParamsInput): RecipeFilters {
  const sortRaw = first(params.sort)
  const sort: RecipeSort =
    sortRaw && (RECIPE_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as RecipeSort) : 'neu'

  const pageRaw = first(params.seite)
  const parsedPage = pageRaw ? Number.parseInt(pageRaw, 10) : 1
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.min(parsedPage, 500) : 1

  return {
    methods: parseMulti(params.methode, SMOKE_METHODS),
    foodTypes: parseMulti(params.lebensmittel, FOOD_TYPES),
    flavors: parseMulti(params.geschmack, FLAVORS),
    woodTypes: parseMulti(params.holz, WOOD_TYPES),
    difficulties: parseMulti(params.schwierigkeit, DIFFICULTIES),
    query: first(params.q)?.slice(0, 120).trim() || null,
    sort,
    page,
  }
}

/** Baut eine URL mit geaenderten Filtern; bei Filterwechsel geht es auf Seite 1 zurueck. */
function buildRecipeHref(filters: RecipeFilters, changes: Partial<RecipeFilters>): string {
  const next: RecipeFilters = { ...filters, ...changes }
  const params = new URLSearchParams()

  if (next.query) params.set('q', next.query)
  for (const dimension of FILTER_DIMENSIONS) {
    const values = next[dimension.key]
    if (values.length > 0) params.set(dimension.param, values.join(','))
  }
  if (next.sort !== 'neu') params.set('sort', next.sort)

  const filterChanged = Object.keys(changes).some((key) => key !== 'page')
  const page = changes.page ?? (filterChanged ? 1 : next.page)
  if (page > 1) params.set('seite', String(page))

  const qs = params.toString()
  return qs.length > 0 ? `${BASE_PATH}?${qs}` : BASE_PATH
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function activeFilterCount(filters: RecipeFilters): number {
  return FILTER_DIMENSIONS.reduce((sum, dimension) => sum + filters[dimension.key].length, 0)
}

function hasActiveFilters(filters: RecipeFilters): boolean {
  return activeFilterCount(filters) > 0 || filters.query !== null
}

/** Where-Klausel; `skip` laesst eine Dimension aus, damit ihre Facetten sichtbar bleiben. */
function buildWhere(filters: RecipeFilters, skip?: DimensionKey): Prisma.RecipeWhereInput {
  const where: Prisma.RecipeWhereInput = { published: true }

  if (skip !== 'methods' && filters.methods.length > 0) where.method = { in: filters.methods }
  if (skip !== 'foodTypes' && filters.foodTypes.length > 0) where.foodType = { in: filters.foodTypes }
  if (skip !== 'flavors' && filters.flavors.length > 0) where.flavor = { in: filters.flavors }
  if (skip !== 'woodTypes' && filters.woodTypes.length > 0) where.woodType = { in: filters.woodTypes }
  if (skip !== 'difficulties' && filters.difficulties.length > 0) {
    where.difficulty = { in: filters.difficulties }
  }
  if (filters.query) {
    where.OR = [{ title: { contains: filters.query } }, { teaser: { contains: filters.query } }]
  }

  return where
}

const LIST_SELECT = {
  slug: true,
  title: true,
  teaser: true,
  imageUrl: true,
  imageAlt: true,
  method: true,
  foodType: true,
  difficulty: true,
  prepMinutes: true,
  brineHours: true,
  smokeMinutes: true,
  servings: true,
  ratingSum: true,
  ratingCount: true,
  createdAt: true,
} as const

type ListRow = Prisma.RecipeGetPayload<{ select: typeof LIST_SELECT }>

function toCardData(row: ListRow): RecipeCardData {
  return {
    slug: row.slug,
    title: row.title,
    teaser: row.teaser,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt,
    method: row.method,
    foodType: row.foodType,
    difficulty: row.difficulty,
    prepMinutes: row.prepMinutes,
    brineHours: row.brineHours,
    smokeMinutes: row.smokeMinutes,
    servings: row.servings,
    ratingAverage: row.ratingCount > 0 ? row.ratingSum / row.ratingCount : null,
    ratingCount: row.ratingCount,
  }
}

function sortRows(rows: ListRow[], sort: RecipeSort): ListRow[] {
  const sorted = [...rows]

  if (sort === 'dauer') {
    return sorted.sort(
      (a, b) =>
        a.prepMinutes + a.brineHours * 60 + a.smokeMinutes -
          (b.prepMinutes + b.brineHours * 60 + b.smokeMinutes) ||
        a.title.localeCompare(b.title, 'de'),
    )
  }

  if (sort === 'bewertung') {
    /*
     * Sortiert wird nach dem angezeigten Wert — also nach dem auf eine
     * Nachkommastelle gerundeten Durchschnitt. Damit stimmt die Reihenfolge
     * mit den sichtbaren Zahlen ueberein. Bei gleichem Wert entscheidet die
     * Anzahl der Bewertungen; unbewertete Rezepte stehen am Ende.
     */
    const score = (row: ListRow) =>
      row.ratingCount > 0 ? Math.round((row.ratingSum / row.ratingCount) * 10) / 10 : -1
    return sorted.sort(
      (a, b) => score(b) - score(a) || b.ratingCount - a.ratingCount || a.title.localeCompare(b.title, 'de'),
    )
  }

  return sorted.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.title.localeCompare(b.title, 'de'),
  )
}

interface FacetCounts {
  methods: Record<string, number>
  foodTypes: Record<string, number>
  flavors: Record<string, number>
  woodTypes: Record<string, number>
  difficulties: Record<string, number>
}

function toCountMap(groups: Array<{ _count: { _all: number } } & Record<string, unknown>>, field: string) {
  const map: Record<string, number> = {}
  for (const group of groups) {
    const value = group[field]
    if (typeof value === 'string') map[value] = group._count._all
  }
  return map
}

async function queryRecipes(filters: RecipeFilters) {
  const where = buildWhere(filters)

  const [rows, methodGroups, foodGroups, flavorGroups, woodGroups, difficultyGroups] = await Promise.all([
    prisma.recipe.findMany({ where, select: LIST_SELECT, take: MAX_SORTABLE_ROWS }),
    prisma.recipe.groupBy({ by: ['method'], where: buildWhere(filters, 'methods'), _count: { _all: true } }),
    prisma.recipe.groupBy({ by: ['foodType'], where: buildWhere(filters, 'foodTypes'), _count: { _all: true } }),
    prisma.recipe.groupBy({ by: ['flavor'], where: buildWhere(filters, 'flavors'), _count: { _all: true } }),
    prisma.recipe.groupBy({ by: ['woodType'], where: buildWhere(filters, 'woodTypes'), _count: { _all: true } }),
    prisma.recipe.groupBy({
      by: ['difficulty'],
      where: buildWhere(filters, 'difficulties'),
      _count: { _all: true },
    }),
  ])

  const sorted = sortRows(rows, filters.sort)
  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(filters.page, totalPages)
  const start = (page - 1) * PAGE_SIZE

  const facets: FacetCounts = {
    methods: toCountMap(methodGroups, 'method'),
    foodTypes: toCountMap(foodGroups, 'foodType'),
    flavors: toCountMap(flavorGroups, 'flavor'),
    woodTypes: toCountMap(woodGroups, 'woodType'),
    difficulties: toCountMap(difficultyGroups, 'difficulty'),
  }

  return {
    recipes: sorted.slice(start, start + PAGE_SIZE).map(toCardData),
    total,
    page,
    totalPages,
    facets,
  }
}

type PageProps = { searchParams: Promise<SearchParamsInput> }

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const filters = parseRecipeFilters(await searchParams)

  // Gefilterte Ansichten werden nicht indexiert, sonst entstehen beliebig
  // viele nahezu identische URLs. Die Canonical zeigt auf die Uebersicht.
  return buildMetadata({
    title: 'Räucherrezepte',
    description:
      'Erprobte Räucherrezepte für Fisch, Fleisch, Schinken, Wurst und Käse – mit Zutaten, Arbeitsschritten, Räucherdauer und passender Ausstattung.',
    path: BASE_PATH,
    noIndex: hasActiveFilters(filters),
  })
}

export default async function RecipeIndexPage({ searchParams }: PageProps) {
  const filters = parseRecipeFilters(await searchParams)
  const result = await queryRecipes(filters)

  const crumbs: Crumb[] = [{ label: 'Start', href: '/' }, { label: 'Rezepte' }]
  const filterPanel = <RecipeFilterPanel filters={filters} facets={result.facets} />

  return (
    <>
      <div className="container-page py-6 sm:py-8">
        <Breadcrumbs items={crumbs} className="mb-6" />

        <header className="max-w-3xl">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Räucherrezepte</h1>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            Anleitungen aus der eigenen Räucherei: mit Mengen, Zeiten und Arbeitsschritten, die sich in der
            Praxis bewährt haben. Jedes Rezept nennt die passende Holzart, die Räuchermethode und die
            Ausstattung, mit der es gelingt.
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Eigene Rezepte notieren?{' '}
            <Link href="/rezepte/eigene" className="font-medium underline underline-offset-2 hover:text-ink">
              Zum persönlichen Rezeptbuch
            </Link>
          </p>
        </header>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:gap-10">
          <aside className="hidden w-60 shrink-0 lg:block xl:w-64">
            <h2 className="sr-only">Filter</h2>
            {filterPanel}
          </aside>

          <div className="min-w-0 flex-1">
            <RecipeSearchForm filters={filters} />

            {/*
              Filter auf schmalen Bildschirmen: ein natives <details>. Es
              klappt auch ohne JavaScript auf — anders als ein Dialogfenster,
              das ohne Skript verschlossen bliebe.
            */}
            <details
              open={activeFilterCount(filters) > 0}
              className="group mt-4 rounded-xl border border-[var(--border-default)] lg:hidden"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink-soft [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  Filter
                  {activeFilterCount(filters) > 0 && (
                    <span className="tabular flex size-5 items-center justify-center rounded-full bg-[var(--accent)] text-2xs font-semibold text-[var(--accent-contrast)]">
                      {activeFilterCount(filters)}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className="size-4.5 shrink-0 text-ink-muted transition-transform duration-300 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="border-t border-[var(--border-subtle)] px-4 py-5">{filterPanel}</div>
            </details>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <p className="text-sm text-ink-muted" aria-live="polite">
                {result.total === 0
                  ? 'Keine Rezepte gefunden'
                  : result.total === 1
                    ? '1 Rezept'
                    : `${formatNumber(result.total)} Rezepte`}
              </p>
              <RecipeSortLinks filters={filters} />
            </div>

            {result.recipes.length === 0 ? (
              <EmptyState
                className="mt-8"
                icon={<CookingPot className="size-5" aria-hidden="true" />}
                title="Zu dieser Auswahl haben wir kein Rezept"
                description="Lockern Sie die Filter oder suchen Sie mit einem anderen Begriff. Alle Rezepte sehen Sie ohne Einschränkung in der vollständigen Übersicht."
                action={{ label: 'Filter zurücksetzen', href: BASE_PATH }}
                secondaryAction={{ label: 'Eigenes Rezept anlegen', href: '/rezepte/eigene' }}
              />
            ) : (
              <>
                <ul className="mt-7 grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
                  {result.recipes.map((recipe, index) => (
                    <li key={recipe.slug}>
                      <RecipeCard recipe={recipe} priority={index < 3} />
                    </li>
                  ))}
                </ul>

                <Pagination
                  className="mt-12"
                  page={result.page}
                  totalPages={result.totalPages}
                  buildHref={(page) => buildRecipeHref(filters, { page })}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <JsonLdScript
        data={[
          breadcrumbJsonLd(crumbs),
          itemListJsonLd(result.recipes.map((r) => ({ name: r.title, url: `/rezepte/${r.slug}` }))),
        ]}
      />
    </>
  )
}

/** Volltextsuche als GET-Formular — funktioniert ohne JavaScript. */
function RecipeSearchForm({ filters }: { filters: RecipeFilters }) {
  return (
    <form action={BASE_PATH} method="get" role="search" className="flex flex-wrap items-center gap-2">
      <label htmlFor="rezept-suche" className="sr-only">
        Rezepte durchsuchen
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <input
          id="rezept-suche"
          type="search"
          name="q"
          defaultValue={filters.query ?? ''}
          maxLength={120}
          placeholder="Nach Titel oder Beschreibung suchen"
          className="h-11 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] pr-3.5 pl-9 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        />
      </div>

      {/* Bestehende Filter und Sortierung beim Absenden erhalten */}
      {FILTER_DIMENSIONS.map((dimension) =>
        filters[dimension.key].length > 0 ? (
          <input
            key={dimension.param}
            type="hidden"
            name={dimension.param}
            value={filters[dimension.key].join(',')}
          />
        ) : null,
      )}
      {filters.sort !== 'neu' && <input type="hidden" name="sort" value={filters.sort} />}

      <button
        type="submit"
        className="h-11 shrink-0 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
      >
        Suchen
      </button>
      {filters.query && (
        <Link
          href={buildRecipeHref(filters, { query: null })}
          className="inline-flex h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Suche zurücksetzen
        </Link>
      )}
    </form>
  )
}

/** Sortierung als Links, damit sie ohne JavaScript und per Lesezeichen funktioniert. */
function RecipeSortLinks({ filters }: { filters: RecipeFilters }) {
  return (
    <nav aria-label="Sortierung" className="flex items-center gap-1">
      <span className="mr-1 hidden text-sm text-ink-muted sm:inline">Sortieren</span>
      <ul className="flex items-center gap-1 rounded-md border border-[var(--border-default)] p-0.5">
        {RECIPE_SORTS.map((sort) => {
          const active = filters.sort === sort
          return (
            <li key={sort}>
              <Link
                href={buildRecipeHref(filters, { sort, page: 1 })}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex h-10 items-center rounded-[5px] px-2.5 text-xs font-medium transition-colors sm:text-sm',
                  active ? 'bg-steel-800 text-steel-50' : 'text-ink-soft hover:bg-paper-sunken',
                )}
              >
                {RECIPE_SORT_LABELS[sort]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Filter als Liste echter Links — dieselbe Bauart wie im Katalog.
 * Jeder Filter ist eine URL: Zurueck-Taste, Mittelklick und Teilen
 * funktionieren dadurch ohne Zusatzaufwand.
 */
function RecipeFilterPanel({ filters, facets }: { filters: RecipeFilters; facets: FacetCounts }) {
  const active = activeFilterCount(filters) > 0

  return (
    <div className="space-y-7">
      {active && (
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-ink uppercase">Aktive Filter</h3>
            <Link
              href={buildRecipeHref(filters, {
                methods: [],
                foodTypes: [],
                flavors: [],
                woodTypes: [],
                difficulties: [],
              })}
              className="text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-[var(--accent)]"
            >
              Alle zurücksetzen
            </Link>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {FILTER_DIMENSIONS.flatMap((dimension) =>
              filters[dimension.key].map((value) => (
                <li key={`${dimension.param}-${value}`}>
                  <Link
                    href={buildRecipeHref(filters, {
                      [dimension.key]: toggleValue(filters[dimension.key], value),
                    } as Partial<RecipeFilters>)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] py-1 pr-2 pl-2.5 text-xs font-medium text-[var(--accent-hover)] ring-1 ring-inset ring-[var(--accent-border)] transition-colors hover:bg-[var(--accent-border)]"
                  >
                    {(dimension.labels as Record<string, string>)[value] ?? value}
                    <X className="size-3" aria-hidden="true" />
                    <span className="sr-only">Filter entfernen</span>
                  </Link>
                </li>
              )),
            )}
          </ul>
        </div>
      )}

      {FILTER_DIMENSIONS.map((dimension) => {
        const counts = facets[dimension.key]
        const selected = filters[dimension.key]

        return (
          <fieldset key={dimension.param}>
            <legend className="mb-2 text-xs font-semibold tracking-wide text-ink uppercase">
              {dimension.title}
            </legend>
            <ul className="space-y-0.5">
              {dimension.values.map((value) => {
                const count = counts[value] ?? 0
                const checked = selected.includes(value)
                // Werte ohne Treffer bleiben sichtbar, solange sie gewaehlt sind —
                // sonst verschwindet der eigene Filter aus der Liste.
                if (count === 0 && !checked) return null

                return (
                  <li key={value}>
                    <Link
                      href={buildRecipeHref(filters, {
                        [dimension.key]: toggleValue(selected, value),
                      } as Partial<RecipeFilters>)}
                      aria-pressed={checked}
                      className={cn(
                        'flex min-h-10 items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
                        checked ? 'text-ink' : 'text-ink-soft hover:bg-paper-sunken',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-4.5 shrink-0 items-center justify-center rounded-xs border transition-colors',
                          checked
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'border-[var(--border-strong)]',
                        )}
                      >
                        {checked && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {(dimension.labels as Record<string, string>)[value] ?? value}
                      </span>
                      <span className="tabular shrink-0 text-xs text-ink-faint">{count}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        )
      })}
    </div>
  )
}
