import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { searchProducts } from '@/lib/server/search'
import { prisma } from '@/lib/db'
import { CARD_SELECT, toCardData } from '@/lib/server/catalog'
import { ProductCard } from '@/components/product/product-card'
import { EmptyState } from '@/components/ui/states'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { formatNumber } from '@/lib/money'

/**
 * Suchergebnisseite.
 *
 * Die Ergebnisliste kommt aus derselben Suchlogik wie die Sofortsuche im
 * Overlay — ein Nutzer sieht also nie zwei unterschiedliche Trefferlisten
 * fuer denselben Begriff.
 */

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams
  const query = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? ''
  return buildMetadata({
    title: query ? `Suche nach „${query}“` : 'Produktsuche',
    description:
      'Durchsuchen Sie das gesamte Sortiment an Räucherhaken, Räuchermehl, Räucherlaugen und Naturgewürzen.',
    path: '/suche',
    // Suchergebnisseiten gehoeren nicht in den Index.
    noIndex: true,
  })
}

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const query = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.slice(0, 120).trim() ?? ''

  if (query.length < 2) {
    return (
      <div className="container-page py-10">
        <Breadcrumbs items={[{ label: 'Start', href: '/' }, { label: 'Suche' }]} className="mb-6" />
        <h1 className="font-display text-3xl font-semibold">Produktsuche</h1>
        <EmptyState
          className="mt-8"
          icon={<SearchX className="size-5" aria-hidden="true" />}
          title="Bitte geben Sie einen Suchbegriff ein"
          description="Suchen Sie nach Artikelnummer, Produktname oder Anwendung – etwa „V4A Haken 20 cm“ oder „Buchenmehl“."
          action={{ label: 'Zum Sortiment', href: '/kategorie' }}
        />
      </div>
    )
  }

  const result = await searchProducts(query, { limit: 48 })

  // Fuer die Karten die vollstaendigen Darstellungsdaten nachladen
  // (die Suche selbst arbeitet auf einem schlanken Projektionsobjekt).
  const rows =
    result.items.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: result.items.map((i) => i.id) } },
          select: CARD_SELECT,
        })
      : []
  const byId = new Map(rows.map((row) => [row.id, row]))
  const products = result.items
    .map((item) => byId.get(item.id))
    .filter((row) => row !== undefined)
    .map((row) => toCardData(row))

  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Start', href: '/' }, { label: 'Suche' }]} className="mb-6" />

      <header>
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">
          Suche nach <span className="text-[var(--accent)]">„{query}“</span>
        </h1>
        <p className="mt-2 text-sm text-ink-muted" aria-live="polite">
          {result.total === 0
            ? 'Keine Treffer'
            : result.total === 1
              ? '1 Treffer'
              : `${formatNumber(result.total)} Treffer`}
        </p>
      </header>

      {products.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={<SearchX className="size-5" aria-hidden="true" />}
            title={`Zu „${query}“ haben wir nichts gefunden`}
            description="Prüfen Sie die Schreibweise oder suchen Sie mit einem allgemeineren Begriff. Diese Bereiche passen vielleicht:"
          />
          <ul className="mt-5 flex flex-wrap justify-center gap-2">
            {result.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <Link
                  href={`/suche?q=${encodeURIComponent(suggestion)}`}
                  className="inline-block rounded-full border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {suggestion}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <section className="mt-9">
          {/*
            Die Produktkarte traegt ihren Namen als h3. Ohne diese Zwischen-
            ueberschrift spraenge die Gliederung von h1 auf h3, und wer sich
            mit einer Vorlesesoftware durch die Ueberschriften bewegt, verlaesse
            den Seitenkopf direkt in der Trefferliste.
          */}
          <h2 className="sr-only">Suchergebnisse</h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product, index) => (
              <li key={product.slug}>
                <ProductCard product={product} priority={index < 4} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
