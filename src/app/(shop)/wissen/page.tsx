import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, Clock, Search, X } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/seo/structured-data'
import { JsonLdScript } from '@/components/seo/json-ld'
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { formatNumber } from '@/lib/money'
import {
  articleGroupKey,
  articleGroupTitle,
  availableGroups,
  getArticleReferences,
  groupArticles,
  listArticles,
  searchArticles,
  type Article,
  type ArticleReferences,
} from '@/lib/server/articles'

/**
 * Uebersicht des Wissensbereichs.
 *
 * Zwei Ansichten in einer Seite, gesteuert ueber die URL:
 *
 *  - Ohne Suche, Themenfilter und abweichende Sortierung erscheint die
 *    redaktionelle Gliederung nach Schwerpunkten. Das ist der Weg, auf dem
 *    jemand den Bereich zum ersten Mal betritt.
 *  - Sobald gesucht, gefiltert oder anders sortiert wird, ist die Gruppierung
 *    hinderlich: Dann zaehlt eine flache, sortierte Trefferliste mit Anzahl
 *    und Seitennavigation.
 *
 * Alle Bedienelemente sind Links oder ein GET-Formular. Die Seite ist damit
 * ohne Client-JavaScript benutzbar, teilbar und crawlbar.
 */

const BASE_PATH = '/wissen'
const PAGE_SIZE = 9

const SORTS = ['empfohlen', 'titel', 'dauer'] as const
type Sort = (typeof SORTS)[number]

const SORT_LABELS: Record<Sort, string> = {
  empfohlen: 'Empfohlene Reihenfolge',
  titel: 'Titel A–Z',
  dauer: 'Kürzeste Lesedauer',
}

interface Filters {
  query: string | null
  group: string | null
  sort: Sort
  page: number
}

type SearchParamsInput = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Ungueltige Parameter werden still verworfen — eine manipulierte URL soll die Seite nicht sprengen. */
function parseFilters(params: SearchParamsInput, groupKeys: string[]): Filters {
  const sortRaw = first(params.sortierung)
  const sort: Sort = sortRaw && (SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as Sort) : 'empfohlen'

  const pageRaw = first(params.seite)
  const parsedPage = pageRaw ? Number.parseInt(pageRaw, 10) : 1
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.min(parsedPage, 100) : 1

  const groupRaw = first(params.thema)?.trim()

  return {
    query: first(params.q)?.slice(0, 120).trim() || null,
    group: groupRaw && groupKeys.includes(groupRaw) ? groupRaw : null,
    sort,
    page,
  }
}

function isFiltered(filters: Filters): boolean {
  return filters.query !== null || filters.group !== null || filters.sort !== 'empfohlen'
}

function buildHref(filters: Filters, overrides: Partial<Filters> = {}): string {
  const merged = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (merged.query) params.set('q', merged.query)
  if (merged.group) params.set('thema', merged.group)
  if (merged.sort !== 'empfohlen') params.set('sortierung', merged.sort)
  if (merged.page > 1) params.set('seite', String(merged.page))
  const query = params.toString()
  return query ? `${BASE_PATH}?${query}` : BASE_PATH
}

function applySort(articles: Article[], sort: Sort): Article[] {
  const sorted = [...articles]
  if (sort === 'titel') return sorted.sort((a, b) => a.title.localeCompare(b.title, 'de'))
  if (sort === 'dauer') {
    return sorted.sort(
      (a, b) => a.readMinutes - b.readMinutes || a.title.localeCompare(b.title, 'de'),
    )
  }
  // 'empfohlen' entspricht der Reihenfolge aus listArticles().
  return sorted
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>
}): Promise<Metadata> {
  const articles = await listArticles()
  const filters = parseFilters(await searchParams, availableGroups(articles).map((group) => group.key))

  // Gefilterte Ansichten werden nicht indexiert, sonst entstehen beliebig viele
  // nahezu identische URLs. Die Canonical zeigt immer auf die Uebersicht.
  return buildMetadata({
    title: 'Wissen rund ums Räuchern',
    description:
      'Grundlagen, Räuchermethoden, Pökeln, Holzarten und Werkstoffkunde: verständlich erklärte Beiträge aus der Praxis – mit Verweisen auf passende Rezepte und Ausstattung.',
    path: BASE_PATH,
    noIndex: isFiltered(filters),
  })
}

export default async function KnowledgeIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>
}) {
  const all = await listArticles()
  const groupOptions = availableGroups(all)
  const filters = parseFilters(await searchParams, groupOptions.map((group) => group.key))
  const filtered = isFiltered(filters)

  const matching = applySort(
    searchArticles(all, filters.query ?? '').filter(
      (article) => filters.group === null || articleGroupKey(article.slug) === filters.group,
    ),
    filters.sort,
  )

  const totalPages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE))
  const page = Math.min(filters.page, totalPages)
  const pageItems = filtered ? matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : all

  const references = await getArticleReferences(pageItems.map((article) => article.slug))
  const groups = groupArticles(all)

  const crumbs: Crumb[] = [{ label: 'Start', href: '/' }, { label: 'Wissen' }]

  return (
    <>
      <div className="container-page py-6 sm:py-8">
        <Breadcrumbs items={crumbs} className="mb-6" />

        <header className="max-w-3xl">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Wissen rund ums Räuchern</h1>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            Was beim Räuchern tatsächlich passiert, welche Methode zu welchem Räuchergut passt und woran
            man gutes Material erkennt. Die Beiträge sind für die Werkbank geschrieben: mit Zahlen,
            Temperaturbereichen und Hinweisen, die sich in der Praxis überprüfen lassen.
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            Sie wollen direkt loslegen?{' '}
            <Link href="/rezepte" className="font-medium underline underline-offset-2 hover:text-ink">
              Zu den Rezepten
            </Link>{' '}
            ·{' '}
            <Link href="/beratung" className="font-medium underline underline-offset-2 hover:text-ink">
              Zur Kaufberatung
            </Link>
          </p>
        </header>

        <div className="mt-8 space-y-5">
          <form action={BASE_PATH} method="get" role="search" className="flex flex-wrap gap-2">
            {/* Der Themenfilter bleibt beim Suchen erhalten. */}
            {filters.group && <input type="hidden" name="thema" value={filters.group} />}
            {filters.sort !== 'empfohlen' && (
              <input type="hidden" name="sortierung" value={filters.sort} />
            )}
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <label htmlFor="wissen-suche" className="sr-only">
                Beiträge durchsuchen
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint"
                aria-hidden="true"
              />
              <input
                id="wissen-suche"
                type="search"
                name="q"
                defaultValue={filters.query ?? ''}
                maxLength={120}
                placeholder="Zum Beispiel Pökeln, Kaltrauch oder V4A"
                className="h-11 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] pr-3.5 pl-10 text-sm text-ink outline-none placeholder:text-ink-faint hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-md bg-[var(--accent)] px-5 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              Suchen
            </button>
            {filters.query && (
              <Link
                href={buildHref(filters, { query: null, page: 1 })}
                className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
              >
                <X className="size-4" aria-hidden="true" />
                Suche zurücksetzen
              </Link>
            )}
          </form>

          <nav aria-label="Themen" className="flex flex-wrap gap-2">
            <FilterChip href={buildHref(filters, { group: null, page: 1 })} active={filters.group === null}>
              Alle Beiträge
              <span className="tabular ml-1.5 text-ink-faint">{all.length}</span>
            </FilterChip>
            {groupOptions.map((group) => (
              <FilterChip
                key={group.key}
                href={buildHref(filters, { group: group.key, page: 1 })}
                active={filters.group === group.key}
              >
                {group.title}
                <span className="tabular ml-1.5 text-ink-faint">{group.count}</span>
              </FilterChip>
            ))}
          </nav>
        </div>

        {filtered ? (
          <section className="mt-8" aria-labelledby="trefferliste">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <h2 id="trefferliste" className="text-sm text-ink-muted" aria-live="polite">
                {matching.length === 0
                  ? 'Keine Beiträge gefunden'
                  : matching.length === 1
                    ? '1 Beitrag'
                    : `${formatNumber(matching.length)} Beiträge`}
                {filters.query && <span className="text-ink-faint"> zu „{filters.query}“</span>}
              </h2>

              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs text-ink-faint">Sortierung</span>
                {SORTS.map((sort) => (
                  <Link
                    key={sort}
                    href={buildHref(filters, { sort, page: 1 })}
                    aria-current={filters.sort === sort ? 'true' : undefined}
                    className={cn(
                      'inline-flex h-10 items-center rounded-md px-3 text-sm transition-colors',
                      filters.sort === sort
                        ? 'bg-paper-sunken font-medium text-ink'
                        : 'text-ink-muted hover:bg-paper-sunken hover:text-ink',
                    )}
                  >
                    {SORT_LABELS[sort]}
                  </Link>
                ))}
              </div>
            </div>

            {pageItems.length === 0 ? (
              <EmptyState
                className="mt-8"
                icon={<BookOpen className="size-5" aria-hidden="true" />}
                title="Zu dieser Auswahl haben wir keinen Beitrag"
                description="Versuchen Sie einen anderen Begriff oder sehen Sie sich alle Beiträge an. Wenn Ihre Frage offen bleibt, beantworten wir sie gern persönlich."
                action={{ label: 'Alle Beiträge anzeigen', href: BASE_PATH }}
                secondaryAction={{ label: 'Frage an den Support stellen', href: '/kontakt' }}
              />
            ) : (
              <>
                <ul className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {pageItems.map((article) => (
                    <li key={article.slug}>
                      <ArticleCard article={article} references={references.get(article.slug)} />
                    </li>
                  ))}
                </ul>

                <Pagination
                  className="mt-10"
                  page={page}
                  totalPages={totalPages}
                  buildHref={(target) => buildHref(filters, { page: target })}
                />
              </>
            )}
          </section>
        ) : (
          <div className="mt-10 space-y-14">
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`gruppe-${group.key}`}>
                <div className="max-w-2xl">
                  <h2 id={`gruppe-${group.key}`} className="font-display text-2xl font-semibold">
                    {group.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{group.description}</p>
                </div>
                <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {group.articles.map((article) => (
                    <li key={article.slug}>
                      <ArticleCard article={article} references={references.get(article.slug)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <section
          aria-labelledby="weiterfuehrend"
          className="mt-16 rounded-xl border border-[var(--border-subtle)] bg-paper-sunken/60 px-5 py-6 sm:px-7 sm:py-8"
        >
          <h2 id="weiterfuehrend" className="font-display text-xl font-semibold">
            Vom Lesen zur Umsetzung
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Die Beiträge nennen jeweils die Ausstattung, um die es geht. Wenn Sie schon wissen, was Sie
            brauchen, führen diese Wege am schnellsten weiter.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/kategorie" size="sm" variant="outline">
              Alle Kategorien
            </ButtonLink>
            <ButtonLink href="/rezepte" size="sm" variant="outline">
              Rezepte
            </ButtonLink>
            <ButtonLink href="/beratung" size="sm" variant="outline">
              Kaufberatung
            </ButtonLink>
            <ButtonLink href="/kontakt" size="sm" variant="outline">
              Frage stellen
            </ButtonLink>
          </div>
        </section>
      </div>

      <JsonLdScript
        data={[
          breadcrumbJsonLd(crumbs),
          itemListJsonLd(
            pageItems.map((article) => ({ name: article.title, url: `${BASE_PATH}/${article.slug}` })),
          ),
        ]}
      />
    </>
  )
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex h-10 items-center rounded-full border px-4 text-sm transition-colors',
        active
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent-hover)]'
          : 'border-[var(--border-default)] text-ink-soft hover:border-[var(--border-strong)] hover:bg-paper-sunken',
      )}
    >
      {children}
    </Link>
  )
}

function ArticleCard({
  article,
  references,
}: {
  article: Article
  references: ArticleReferences | undefined
}) {
  const categories = references?.categories.slice(0, 2) ?? []
  const recipes = references?.recipes.slice(0, 2) ?? []

  return (
    <article className="flex h-full flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-subtle)] transition-shadow duration-300 [transition-timing-function:var(--ease-out-soft)] hover:shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline">{articleGroupTitle(articleGroupKey(article.slug))}</Badge>
        <span className="tabular inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
          {article.readMinutes} Min. Lesezeit
        </span>
      </div>

      <h3 className="mt-3 font-display text-lg leading-snug font-semibold">
        <Link
          href={`${BASE_PATH}/${article.slug}`}
          className="transition-colors hover:text-[var(--accent)]"
        >
          {article.title}
        </Link>
      </h3>

      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{article.teaser}</p>

      {(categories.length > 0 || recipes.length > 0) && (
        <div className="mt-4 space-y-1.5 border-t border-[var(--border-subtle)] pt-3 text-xs text-ink-muted">
          {categories.length > 0 && (
            <p>
              <span className="text-ink-faint">Passend im Sortiment: </span>
              <CrossLinks links={categories} />
            </p>
          )}
          {recipes.length > 0 && (
            <p>
              <span className="text-ink-faint">Rezepte dazu: </span>
              <CrossLinks links={recipes} />
            </p>
          )}
        </div>
      )}

      <p className="mt-4 pt-1">
        <Link
          href={`${BASE_PATH}/${article.slug}`}
          className="text-sm font-medium text-[var(--accent)] underline underline-offset-4 hover:text-[var(--accent-hover)]"
        >
          Beitrag lesen
          <span className="sr-only">: {article.title}</span>
        </Link>
      </p>
    </article>
  )
}

function CrossLinks({ links }: { links: Array<{ label: string; href: string }> }) {
  return (
    <>
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 && <span className="text-ink-faint"> · </span>}
          <Link href={link.href} className="font-medium underline underline-offset-2 hover:text-ink">
            {link.label}
          </Link>
        </span>
      ))}
    </>
  )
}
