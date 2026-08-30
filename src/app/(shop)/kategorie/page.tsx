import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/seo/structured-data'
import { JsonLdScript } from '@/components/seo/json-ld'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { ProductCard } from '@/components/product/product-card'
import { FilterPanel } from '@/components/catalog/filter-panel'
import { SortSelect } from '@/components/catalog/sort-select'
import { MobileFilters } from '@/components/catalog/mobile-filters'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { activeFilterCount, buildFilterHref, parseFilters, queryCatalog } from '@/lib/server/product-query'
import { formatNumber } from '@/lib/money'

export const metadata: Metadata = buildMetadata({
  title: 'Gesamtes Sortiment',
  description:
    'Alle Artikel von Räucherhaken24: Räucherhaken und Fleischerhaken aus Edelstahl, Räuchermehl, Räucherlaugen und über einhundert Naturgewürze.',
  path: '/kategorie',
})

const CRUMBS = [{ label: 'Start', href: '/' }, { label: 'Sortiment' }]

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Gesamtübersicht über alle Kategorien plus vollständige Produktliste. */
export default async function CatalogPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const filters = parseFilters(sp)
  const [result, categories] = await Promise.all([
    queryCatalog(filters),
    prisma.category.findMany({
      where: { active: true, parentId: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true,
        name: true,
        teaser: true,
        _count: { select: { products: true } },
        children: { where: { active: true }, select: { _count: { select: { products: true } } } },
      },
    }),
  ])

  const basePath = '/kategorie'
  const filterPanel = (
    <FilterPanel basePath={basePath} filters={filters} facets={result.facets} priceRange={result.priceRange} />
  )

  return (
    <>
      <div className="container-page py-6 sm:py-8">
        <Breadcrumbs items={CRUMBS} className="mb-6" />

        <header className="max-w-3xl">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Gesamtes Sortiment</h1>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            Vom feinen Fischhaken bis zum Kilogramm Buchenmehl. Alle Artikel mit technischen Daten,
            Lieferzeit und aktuellem Bestand.
          </p>
        </header>

        <nav aria-label="Kategorien" className="mt-8">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const total =
                category._count.products + category.children.reduce((s, c) => s + c._count.products, 0)
              return (
                <li key={category.slug}>
                  <Link
                    href={`/kategorie/${category.slug}`}
                    className="group flex h-full items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-all duration-200 hover:border-[var(--border-default)] hover:shadow-[var(--shadow-subtle)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base font-semibold">{category.name}</span>
                      {category.teaser && (
                        <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                          {category.teaser}
                        </span>
                      )}
                      <span className="tabular mt-2 block text-xs font-medium text-[var(--accent)]">
                        {formatNumber(total)} Artikel
                      </span>
                    </span>
                    <ArrowRight
                      className="mt-0.5 size-4 shrink-0 text-ink-faint transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="mt-12 flex flex-col gap-8 lg:flex-row lg:gap-10">
          <aside className="hidden w-60 shrink-0 lg:block xl:w-64">
            <h2 className="sr-only">Filter</h2>
            {filterPanel}
          </aside>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <h2 className="font-display text-xl font-semibold">
                Alle Artikel
                <span className="tabular ml-2 text-base font-normal text-ink-faint">
                  {formatNumber(result.total)}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <MobileFilters activeCount={activeFilterCount(filters)} resultCount={result.total}>
                  {filterPanel}
                </MobileFilters>
                <SortSelect
                  basePath={basePath}
                  filters={filters}
                  available={['beliebtheit', 'bestseller', 'preis-asc', 'preis-desc', 'name-asc', 'name-desc', 'neu']}
                />
              </div>
            </div>

            {result.products.length === 0 ? (
              <EmptyState
                className="mt-8"
                title="Zu dieser Auswahl haben wir nichts gefunden"
                description="Lockern Sie die Filter oder sehen Sie sich das vollständige Sortiment an."
                action={{ label: 'Filter zurücksetzen', href: basePath }}
              />
            ) : (
              <>
                <ul className="mt-7 grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
                  {result.products.map((product, index) => (
                    <li key={product.slug}>
                      <ProductCard product={product} priority={index < 4} />
                    </li>
                  ))}
                </ul>
                <Pagination
                  className="mt-12"
                  page={result.page}
                  totalPages={result.totalPages}
                  buildHref={(page) => buildFilterHref(basePath, filters, { page })}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <JsonLdScript
        data={[
          breadcrumbJsonLd(CRUMBS),
          itemListJsonLd(
            categories.map((c) => ({ name: c.name, url: `/kategorie/${c.slug}` })),
          ),
        ]}
      />
    </>
  )
}
