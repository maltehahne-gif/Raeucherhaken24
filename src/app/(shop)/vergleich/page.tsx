import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Check, Minus } from 'lucide-react'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd } from '@/lib/seo/structured-data'
import { JsonLdScript } from '@/components/seo/json-ld'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { Price } from '@/components/ui/price'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { selectPromotion } from '@/lib/server/pricing'
import { MATERIAL_LABELS } from '@/lib/domain/enums'
import { cn } from '@/lib/utils/cn'

export const revalidate = 600

export const metadata: Metadata = buildMetadata({
  title: 'Räucherhaken im Vergleich',
  description:
    'Alle Räucherhaken-Modelle nebeneinander: Länge, Material, Drahtstärke, Belastbarkeit, Spitzenausführung, Einsatzgebiet und Preis auf einen Blick.',
  path: '/vergleich',
})

const CRUMBS = [
  { label: 'Start', href: '/' },
  { label: 'Räucherhaken', href: '/kategorie/raeucherhaken' },
  { label: 'Vergleich' },
]

/**
 * Merkmale, die verglichen werden.
 * Die Schlüssel entsprechen denen in ProductSpec — dadurch bleibt der Vergleich
 * auch dann korrekt, wenn ein Artikel ein Merkmal nicht führt.
 */
const COMPARE_KEYS: Array<{ key: string; label: string; group: string }> = [
  { key: 'laenge', label: 'Länge', group: 'Abmessungen' },
  { key: 'drahtstaerke', label: 'Drahtstärke', group: 'Abmessungen' },
  { key: 'material', label: 'Werkstoff', group: 'Werkstoff' },
  { key: 'belastbarkeit', label: 'Belastbarkeit', group: 'Werkstoff' },
  { key: 'spitze', label: 'Spitzenausführung', group: 'Ausführung' },
  { key: 'einsatzgebiet', label: 'Einsatzgebiet', group: 'Anwendung' },
  { key: 'verpackungseinheit', label: 'Verpackungseinheit', group: 'Anwendung' },
]

/**
 * Produktvergleich für Räucherhaken.
 *
 * Zeilen, in denen sich die Modelle unterscheiden, werden hervorgehoben —
 * das ist der eigentliche Zweck eines Vergleichs. Auf schmalen Bildschirmen
 * scrollt die Tabelle waagerecht, die Merkmalsspalte bleibt stehen.
 */
export default async function ComparePage() {
  const products = await prisma.product.findMany({
    where: {
      active: true,
      visible: true,
      category: { slug: 'raeucherhaken' },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      specs: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      promotions: true,
    },
    take: 8,
  })

  if (products.length < 2) {
    return (
      <div className="container-page py-10">
        <Breadcrumbs items={CRUMBS} className="mb-6" />
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Räucherhaken im Vergleich</h1>
        <EmptyState
          className="mt-8"
          title="Für einen Vergleich braucht es mindestens zwei Modelle"
          description="Sobald weitere Hakenmodelle im Sortiment sind, erscheinen sie hier nebeneinander."
          action={{ label: 'Zu den Räucherhaken', href: '/kategorie/raeucherhaken' }}
        />
      </div>
    )
  }

  const now = new Date()
  const rows = COMPARE_KEYS.map((definition) => {
    const values = products.map((product) => {
      if (definition.key === 'material') {
        return product.material ? (MATERIAL_LABELS[product.material] ?? product.material) : null
      }
      return product.specs.find((spec) => spec.key === definition.key)?.value ?? null
    })
    // Eine Zeile ist „unterscheidend“, wenn nicht alle Werte gleich sind.
    const distinct = new Set(values.map((v) => v ?? '—'))
    return { ...definition, values, differs: distinct.size > 1 }
  })

  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = groups.get(row.group) ?? []
    list.push(row)
    groups.set(row.group, list)
  }

  return (
    <>
      <div className="container-page py-8 sm:py-10">
        <Breadcrumbs items={CRUMBS} className="mb-6" />

        <header className="max-w-3xl">
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            Räucherhaken im Vergleich
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            Alle Modelle nebeneinander. Zeilen, in denen sich die Haken tatsächlich unterscheiden,
            sind hervorgehoben — dort lohnt der genaue Blick.
          </p>
        </header>

        <div className="mt-8 flex items-center gap-2 text-xs text-ink-muted">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-sm border border-[var(--accent-border)] bg-[var(--accent-soft)]"
          />
          Hervorgehoben = Modelle unterscheiden sich in diesem Merkmal
        </div>

        <div className="scroll-area mt-4 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <caption className="sr-only">
              Vergleich der Räucherhaken-Modelle nach Länge, Werkstoff, Drahtstärke, Belastbarkeit,
              Spitzenausführung, Einsatzgebiet, Verpackungseinheit, Verfügbarkeit und Preis
            </caption>

            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 w-40 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-4 text-left text-2xs font-semibold tracking-wider text-ink-muted uppercase"
                >
                  Merkmal
                </th>
                {products.map((product) => {
                  const promo = selectPromotion(product.promotions, product.priceCents, now)
                  return (
                    <th
                      key={product.id}
                      scope="col"
                      className="min-w-[13rem] border-b border-l border-[var(--border-subtle)] px-4 py-4 text-left align-top"
                    >
                      <Link href={`/produkt/${product.slug}`} className="group block">
                        <span className="block aspect-square w-24 overflow-hidden rounded-lg bg-paper-sunken">
                          {product.images[0] && (
                            <Image
                              src={product.images[0].url}
                              alt=""
                              width={192}
                              height={192}
                              sizes="96px"
                              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          )}
                        </span>
                        <span className="mt-3 block font-display text-sm leading-snug font-semibold group-hover:text-[var(--accent)]">
                          {product.name}
                        </span>
                      </Link>
                      <span className="mt-2 block">
                        <Price
                          cents={promo ? promo.priceCents : product.priceCents}
                          listCents={promo ? product.priceCents : null}
                          size="md"
                        />
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {[...groups.entries()].map(([group, groupRows]) => (
              <tbody key={group} className="divide-y divide-[var(--border-subtle)]">
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={products.length + 1}
                    className="sticky left-0 bg-paper-sunken/70 px-4 py-2 text-left text-2xs font-semibold tracking-wider text-ink-muted uppercase"
                  >
                    {group}
                  </th>
                </tr>
                {groupRows.map((row) => (
                  <tr key={row.key} className={cn(row.differs && 'bg-[var(--accent-soft)]/45')}>
                    <th
                      scope="row"
                      className={cn(
                        'sticky left-0 z-10 px-4 py-3 text-left font-normal',
                        row.differs
                          ? 'bg-[var(--accent-soft)] font-medium text-ink'
                          : 'bg-[var(--surface-raised)] text-ink-muted',
                      )}
                    >
                      {row.label}
                    </th>
                    {row.values.map((value, index) => (
                      <td
                        key={`${row.key}-${index}`}
                        className="border-l border-[var(--border-subtle)] px-4 py-3 align-top"
                      >
                        {value ?? (
                          <span className="inline-flex items-center gap-1 text-ink-faint">
                            <Minus className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">Keine Angabe</span>
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}

            <tbody className="divide-y divide-[var(--border-subtle)]">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={products.length + 1}
                  className="sticky left-0 bg-paper-sunken/70 px-4 py-2 text-left text-2xs font-semibold tracking-wider text-ink-muted uppercase"
                >
                  Verfügbarkeit
                </th>
              </tr>
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-[var(--surface-raised)] px-4 py-3 text-left font-normal text-ink-muted"
                >
                  Lieferbarkeit
                </th>
                {products.map((product) => (
                  <td key={product.id} className="border-l border-[var(--border-subtle)] px-4 py-3">
                    {product.stock > 0 ? (
                      <Badge tone="success">
                        <Check className="size-3" aria-hidden="true" />
                        Auf Lager
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Ausverkauft</Badge>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-[var(--surface-raised)] px-4 py-3 text-left font-normal text-ink-muted"
                >
                  Lieferzeit
                </th>
                {products.map((product) => (
                  <td key={product.id} className="border-l border-[var(--border-subtle)] px-4 py-3">
                    {product.deliveryDaysMin}–{product.deliveryDaysMax} Werktage
                  </td>
                ))}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-[var(--surface-raised)] px-4 py-3 text-left font-normal text-ink-muted"
                >
                  Zum Artikel
                </th>
                {products.map((product) => (
                  <td key={product.id} className="border-l border-[var(--border-subtle)] px-4 py-3">
                    <Link
                      href={`/produkt/${product.slug}`}
                      className="inline-flex h-10 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
                    >
                      Ansehen
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Angaben zur Belastbarkeit beziehen sich auf ruhende Last bei bestimmungsgemäßem Gebrauch.
          Maßgeblich sind die technischen Daten auf der jeweiligen Produktseite.
        </p>
      </div>

      <JsonLdScript data={breadcrumbJsonLd(CRUMBS)} />
    </>
  )
}
