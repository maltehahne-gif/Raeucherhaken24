import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PackageSearch } from 'lucide-react'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/seo/structured-data'
import { JsonLdScript } from '@/components/seo/json-ld'
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs'
import { ProductCard } from '@/components/product/product-card'
import { FilterPanel } from '@/components/catalog/filter-panel'
import { SortSelect } from '@/components/catalog/sort-select'
import { MobileFilters } from '@/components/catalog/mobile-filters'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { activeFilterCount, buildFilterHref, parseFilters, queryCatalog } from '@/lib/server/product-query'
import { formatNumber } from '@/lib/money'

/**
 * Kategorieseite mit Filtern, Sortierung und Seitenaufteilung.
 * Der gesamte Zustand steckt in der URL — die Seite ist damit vollstaendig
 * serverseitig gerendert und ohne Client-JavaScript bedienbar.
 */

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

async function loadCategory(slug: string) {
  return prisma.category.findFirst({
    where: { slug, active: true },
    include: {
      parent: { select: { slug: true, name: true } },
      children: {
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, name: true, teaser: true, _count: { select: { products: true } } },
      },
    },
  })
}

export async function generateStaticParams() {
  const categories = await prisma.category.findMany({ where: { active: true }, select: { slug: true } })
  return categories.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const category = await loadCategory(slug)
  if (!category) return buildMetadata({ title: 'Kategorie nicht gefunden', description: '', path: `/kategorie/${slug}`, noIndex: true })

  const sp = await searchParams
  // Gefilterte Ansichten werden nicht indexiert — sonst entstehen beliebig
  // viele nahezu identische URLs. Die Canonical zeigt auf die Kategorie selbst.
  const filtered = Object.keys(sp).some((k) => k !== 'seite')

  return buildMetadata({
    title: category.metaTitle ?? category.name,
    description:
      category.metaDescription ??
      category.description ??
      `${category.name} im Sortiment von Räucherhaken24 – Auswahl, technische Daten und Lieferzeiten auf einen Blick.`,
    path: `/kategorie/${slug}`,
    noIndex: filtered,
  })
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams
  const category = await loadCategory(slug)
  if (!category) notFound()

  const filters = parseFilters(sp, { categorySlug: slug })
  const result = await queryCatalog(filters)
  const basePath = `/kategorie/${slug}`

  const crumbs: Crumb[] = [
    { label: 'Start', href: '/' },
    { label: 'Sortiment', href: '/kategorie' },
    ...(category.parent ? [{ label: category.parent.name, href: `/kategorie/${category.parent.slug}` }] : []),
    { label: category.name },
  ]

  const filterPanel = (
    <FilterPanel
      basePath={basePath}
      filters={filters}
      facets={result.facets}
      priceRange={result.priceRange}
    />
  )

  return (
    <>
      <div className="container-page py-6 sm:py-8">
        <Breadcrumbs items={crumbs} className="mb-6" />

        <header className="max-w-3xl">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{category.name}</h1>
          {category.description && (
            <p className="mt-3 text-base leading-relaxed text-ink-muted">{category.description}</p>
          )}
        </header>

        {category.children.length > 0 && (
          <nav aria-label="Unterkategorien" className="mt-7">
            <ul className="flex flex-wrap gap-2">
              {category.children.map((child) => (
                <li key={child.slug}>
                  <a
                    href={`/kategorie/${child.slug}`}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {child.name}
                    <span className="tabular text-xs text-ink-faint">{child._count.products}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:gap-10">
          <aside className="hidden w-60 shrink-0 lg:block xl:w-64">
            <h2 className="sr-only">Filter</h2>
            {filterPanel}
          </aside>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <p className="text-sm text-ink-muted" aria-live="polite">
                {result.total === 0
                  ? 'Keine Artikel gefunden'
                  : result.total === 1
                    ? '1 Artikel'
                    : `${formatNumber(result.total)} Artikel`}
              </p>
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
                icon={<PackageSearch className="size-5" aria-hidden="true" />}
                title="Zu dieser Auswahl haben wir nichts gefunden"
                description="Lockern Sie die Filter oder sehen Sie sich das vollständige Sortiment dieser Kategorie an."
                action={{ label: 'Filter zurücksetzen', href: basePath }}
                secondaryAction={{ label: 'Zum gesamten Sortiment', href: '/kategorie' }}
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
          breadcrumbJsonLd(crumbs),
          itemListJsonLd(result.products.map((p) => ({ name: p.name, url: `/produkt/${p.slug}` }))),
        ]}
      />
    </>
  )
}
