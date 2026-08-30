import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Info, Layers, Ruler, ShieldCheck, Truck } from 'lucide-react'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd } from '@/lib/seo/structured-data'
import { JsonLdScript } from '@/components/seo/json-ld'
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Price } from '@/components/ui/price'
import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { ProductConfigurator } from '@/components/product/configurator'
import { selectPromotion } from '@/lib/server/pricing'
import { formatPrice, formatBp, formatNumber } from '@/lib/money'
import { formatLength, formatWeight } from '@/lib/utils/text'
import { MATERIAL_LABELS } from '@/lib/domain/enums'
import { cn } from '@/lib/utils/cn'

/**
 * Einstieg in den Räucherhaken-Konfigurator.
 *
 * Die Modellauswahl steckt in der URL (?modell=<slug>) statt im Client-Zustand.
 * Dadurch ist jede Konfigurationsvorlage verlinkbar, die Seite funktioniert
 * ohne JavaScript bis zum Konfigurator selbst, und der Konfigurator startet
 * beim Modellwechsel sauber mit den Voreinstellungen des neuen Modells.
 */

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const CRUMBS: Crumb[] = [{ label: 'Start', href: '/' }, { label: 'Konfigurator' }]

export const metadata: Metadata = buildMetadata({
  title: 'Räucherhaken konfigurieren',
  description:
    'Modell, Länge, Werkstoff, Spitzenausführung und Oberfläche selbst zusammenstellen. Aufpreise und Mengenstaffel rechnen sich unmittelbar mit.',
  path: '/konfigurator',
})

async function loadConfigurableProducts() {
  return prisma.product.findMany({
    where: {
      active: true,
      visible: true,
      optionGroups: { some: { options: { some: { active: true } } } },
    },
    include: {
      category: { select: { name: true, slug: true } },
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      priceTiers: { orderBy: { minQty: 'asc' } },
      promotions: true,
      optionGroups: {
        orderBy: { sortOrder: 'asc' },
        include: { options: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { popularity: 'desc' }, { name: 'asc' }],
  })
}

export default async function ConfiguratorPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const requestedSlug = typeof sp.modell === 'string' ? sp.modell : undefined

  const products = await loadConfigurableProducts()
  const selected = products.find((p) => p.slug === requestedSlug) ?? products[0]

  return (
    <>
      <div className="container-page py-8 sm:py-12">
        <Breadcrumbs items={CRUMBS} className="mb-6" />

        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            <Ruler className="size-3.5" aria-hidden="true" />
            Konfigurator
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight font-semibold sm:text-4xl">
            Räucherhaken nach Ihren Vorgaben
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            Sie wählen Bauform, Länge, Werkstoff, Spitzenausführung und Oberfläche. Aufpreise und
            Mengenstaffel rechnen sich beim Auswählen unmittelbar mit. Jede Zusammenstellung liegt
            als eigene Position im Warenkorb.
          </p>
        </div>

        {!selected ? (
          <EmptyState
            className="mt-10"
            icon={<Ruler className="size-6" aria-hidden="true" />}
            title="Zurzeit ist kein Modell konfigurierbar"
            description="Derzeit ist kein Hakenmodell für den Konfigurator freigegeben. Beschreiben Sie uns Ihr Vorhaben über das Formular für Sonderanfertigungen — Maße, Werkstoff und Belastung nehmen wir dort genauso auf."
            action={{ label: 'Sonderanfertigung anfragen', href: '/sonderanfertigung' }}
            secondaryAction={{ label: 'Zum Hakenvergleich', href: '/vergleich' }}
          />
        ) : (
          <>
            {products.length > 1 && (
              <nav aria-label="Konfigurierbare Modelle" className="mt-10">
                <h2 className="text-sm font-semibold text-ink">
                  {formatNumber(products.length)} Modelle sind konfigurierbar
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Wählen Sie zuerst die Grundlage. Alle weiteren Merkmale stellen Sie darunter ein.
                </p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((product) => {
                    const promo = selectPromotion(product.promotions, product.priceCents, new Date())
                    const isActive = product.id === selected.id
                    return (
                      <li key={product.id}>
                        <Link
                          href={`/konfigurator?modell=${encodeURIComponent(product.slug)}`}
                          scroll={false}
                          aria-current={isActive ? 'true' : undefined}
                          className={cn(
                            'flex h-full min-h-[3.5rem] flex-col gap-1 rounded-lg border px-4 py-3.5 transition-all duration-200',
                            '[transition-timing-function:var(--ease-out-soft)]',
                            isActive
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-subtle)]'
                              : 'border-[var(--border-default)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-subtle)]',
                          )}
                        >
                          <span className="text-sm font-semibold text-ink">{product.name}</span>
                          {product.subtitle && (
                            <span className="text-xs leading-relaxed text-ink-muted">
                              {product.subtitle}
                            </span>
                          )}
                          <span className="tabular mt-auto pt-1.5 text-xs font-medium text-ink-soft">
                            ab {formatPrice(promo ? promo.priceCents : product.priceCents)} je Stück
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            )}

            <ConfiguratorPanel key={selected.id} product={selected} />

            <section aria-labelledby="werkstoffe" className="mt-16">
              <h2 id="werkstoffe" className="font-display text-2xl font-semibold sm:text-3xl">
                V2A oder V4A — was Sie wählen sollten
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
                Beide Werkstoffe sind rostfreier Edelstahl und beide sind für Lebensmittel geeignet.
                Der Unterschied zeigt sich erst dort, wo Chloride im Spiel sind — also bei Pökellake,
                Salz und feuchter Dauerbelastung.
              </p>
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <MaterialCard
                  name="VA"
                  subline="Edelstahl rostfrei"
                  description="Grundausführung für den gelegentlichen Einsatz in der trockenen Räucherkammer. Robust, günstig, ohne besondere Anforderungen an die Reinigung."
                  suited="Gelegentliches Räuchern, keine Lake"
                />
                <MaterialCard
                  name="V2A"
                  subline="Werkstoffnummer 1.4301"
                  description="Der übliche Standard. Chrom-Nickel-Stahl, unempfindlich gegen Rauch, Hitze und Reinigungsmittel. Ohne dauerhaften Salzkontakt hält er über Jahre."
                  suited="Regelmäßiger Betrieb ohne Dauersalzkontakt"
                />
                <MaterialCard
                  name="V4A"
                  subline="Werkstoffnummer 1.4404"
                  description="Zusätzlich mit Molybdän legiert. Das erhöht die Beständigkeit gegen Lochfraß durch Chloride deutlich — also gegen genau die Belastung, die in Pökellake und Salz entsteht."
                  suited="Fischräucherei, Lake, Dauerbetrieb"
                  highlight
                />
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                Im Zweifel gilt: Wo Ihre Haken regelmäßig mit Lake oder Salz in Berührung kommen,
                ist V4A die Wahl, die Sie später nicht bereuen. Der Aufpreis fällt einmal an, die
                Standzeit über Jahre.
              </p>
            </section>

            <section aria-labelledby="weiter" className="mt-16">
              <h2 id="weiter" className="font-display text-2xl font-semibold sm:text-3xl">
                Wenn der Konfigurator nicht reicht
              </h2>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <NextStepCard
                  icon={<Layers className="size-5" aria-hidden="true" />}
                  eyebrow="Vergleich"
                  title="Erst die Modelle nebeneinander sehen"
                  description="Länge, Drahtstärke, Werkstoff, Belastbarkeit und Spitzenausführung aller Hakenmodelle in einer Tabelle — inklusive der Modelle, die nicht konfigurierbar sind."
                  href="/vergleich"
                  cta="Zum Hakenvergleich"
                />
                <NextStepCard
                  icon={<Ruler className="size-5" aria-hidden="true" />}
                  eyebrow="Sonderanfertigung"
                  title="Maße, die hier nicht zur Auswahl stehen"
                  description="Zwischenlängen, abweichende Drahtstärken, Sonderformen, Kennzeichnungen oder ganze Serien nach Zeichnung: Beschreiben Sie Ihr Vorhaben, wir prüfen die Fertigbarkeit."
                  href="/sonderanfertigung"
                  cta="Projekt beschreiben"
                />
              </div>
            </section>
          </>
        )}
      </div>

      <JsonLdScript data={breadcrumbJsonLd(CRUMBS)} />
    </>
  )
}

type ConfigurableProduct = Awaited<ReturnType<typeof loadConfigurableProducts>>[number]

/**
 * Konfigurationsbereich eines Modells.
 *
 * Der Aufruf des Konfigurators entspricht exakt dem der Produktdetailseite —
 * Preisvorschau, Mengenstaffel und Aktionen werden dort mit denselben Daten
 * berechnet, und der Server bewertet die Auswahl beim Hinzufuegen erneut.
 */
function ConfiguratorPanel({ product }: { product: ConfigurableProduct }) {
  const promo = selectPromotion(product.promotions, product.priceCents, new Date())
  const effectivePriceCents = promo ? promo.priceCents : product.priceCents
  const availableStock = Math.max(0, product.stock - product.reservedStock)
  const soldOut = availableStock <= 0 && !product.allowBackorder
  const image = product.images[0]

  // Gruppen ohne aktive Option koennten nie erfuellt werden und wuerden den
  // Konfigurator dauerhaft blockieren.
  const groups = product.optionGroups.filter((group) => group.options.length > 0)

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
      <div className="lg:sticky lg:top-24 lg:self-start">
        {image && (
          <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-paper-sunken">
            <Image
              src={image.url}
              alt={image.alt}
              width={800}
              height={800}
              sizes="(max-width: 1024px) 92vw, 34vw"
              className="aspect-square w-full object-cover"
              priority
            />
          </div>
        )}

        <div className="mt-5">
          <p className="text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            {product.category.name}
          </p>
          <h2 className="mt-1.5 font-display text-2xl font-semibold">{product.name}</h2>
          {product.shortDescription && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{product.shortDescription}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {promo && <Badge tone="accent">{promo.promotion.name}</Badge>}
            {product.material && (
              <Badge tone="outline">{MATERIAL_LABELS[product.material] ?? product.material}</Badge>
            )}
            {product.loadCapacityGrams && (
              <Badge tone="outline">bis {formatWeight(product.loadCapacityGrams)} belastbar</Badge>
            )}
          </div>

          <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
            <p className="text-xs text-ink-faint">Grundpreis vor Optionen</p>
            <Price
              cents={effectivePriceCents}
              listCents={promo ? product.priceCents : null}
              size="lg"
              className="mt-1"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              inkl. {formatBp(product.taxRateBp)} MwSt.{' '}
              <Link href="/versand" className="underline underline-offset-2 hover:text-ink-muted">
                zzgl. Versandkosten
              </Link>
            </p>
          </div>

          <ul className="mt-4 space-y-2 text-sm text-ink-muted">
            <li className="flex items-start gap-2">
              <Truck className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <span>
                {product.allowBackorder
                  ? `Fertigung nach Auftrag · Lieferzeit ${product.deliveryDaysMin}–${product.deliveryDaysMax} Werktage`
                  : `Lieferzeit ${product.deliveryDaysMin}–${product.deliveryDaysMax} Werktage`}
              </span>
            </li>
            {product.lengthMm && (
              <li className="flex items-start gap-2">
                <Ruler className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                <span>Grundmodell {formatLength(product.lengthMm)} — die Länge stellen Sie rechts ein</span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <span>
                Konfigurierte Haken sind Anfertigungen nach Ihren Vorgaben. Bitte prüfen Sie vor der
                Bestellung die{' '}
                <Link href="/widerruf" className="underline underline-offset-2 hover:text-ink">
                  Hinweise zum Widerrufsrecht
                </Link>
                .
              </span>
            </li>
          </ul>

          <p className="tabular mt-4 text-xs text-ink-faint">
            Grundlage: Art.-Nr. {product.articleNumber} ·{' '}
            <Link
              href={`/produkt/${product.slug}`}
              className="underline underline-offset-2 hover:text-ink-muted"
            >
              Artikeldetails ansehen
            </Link>
          </p>
        </div>
      </div>

      <div className="min-w-0">
        {soldOut && (
          <p
            role="status"
            className="mb-5 rounded-lg border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-700"
          >
            Dieses Modell ist derzeit nicht verfügbar. Sie können die Konfiguration ansehen, aber
            noch nicht bestellen. Für eine Anfertigung außer der Reihe nutzen Sie bitte die{' '}
            <Link href="/sonderanfertigung" className="underline underline-offset-2">
              Sonderanfertigung
            </Link>
            .
          </p>
        )}

        <ProductConfigurator
          productId={product.id}
          productName={product.name}
          basePriceCents={product.priceCents}
          taxRateBp={product.taxRateBp}
          maxQuantity={product.allowBackorder ? 999 : Math.max(1, availableStock)}
          disabled={soldOut}
          groups={groups.map((group) => ({
            key: group.key,
            label: group.label,
            helpText: group.helpText,
            required: group.required,
            options: group.options.map((option) => ({
              key: option.key,
              label: option.label,
              description: option.description,
              priceDeltaCents: option.priceDeltaCents,
              priceDeltaBp: option.priceDeltaBp,
              isDefault: option.isDefault,
            })),
          }))}
          priceTiers={product.priceTiers.map((t) => ({ minQty: t.minQty, discountBp: t.discountBp }))}
          promotions={product.promotions.map((p) => ({
            id: p.id,
            name: p.name,
            salePriceCents: p.salePriceCents,
            discountBp: p.discountBp,
            startsAt: p.startsAt.toISOString(),
            endsAt: p.endsAt.toISOString(),
            active: p.active,
          }))}
        />

        {product.priceTiers.length > 0 && (
          <div className="mt-8 rounded-xl border border-[var(--border-subtle)] bg-paper-sunken/70 p-5">
            <h3 className="flex items-center gap-2 font-display text-base font-semibold">
              <Info className="size-4 text-[var(--accent)]" aria-hidden="true" />
              Mengenstaffel
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              Der Staffelrabatt gilt je Konfiguration und wird auf den Stückpreis nach Optionen
              angewendet. Er greift automatisch, sobald Sie die Menge oben erhöhen.
            </p>
            <div className="scroll-area mt-4 overflow-x-auto">
              <table className="w-full min-w-[20rem] text-sm">
                <caption className="sr-only">
                  Staffelrabatte für {product.name} nach Bestellmenge
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th scope="col" className="py-2 pr-4 text-left text-2xs font-semibold tracking-wider text-ink-muted uppercase">
                      Ab Menge
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right text-2xs font-semibold tracking-wider text-ink-muted uppercase">
                      Rabatt
                    </th>
                    <th scope="col" className="py-2 text-right text-2xs font-semibold tracking-wider text-ink-muted uppercase">
                      Stückpreis ohne Optionen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {product.priceTiers.map((tier) => (
                    <tr key={tier.id}>
                      <td className="tabular py-2 pr-4 text-ink-soft">
                        {formatNumber(tier.minQty)} Stück
                      </td>
                      <td className="tabular py-2 pr-4 text-right font-medium text-success-700">
                        −{formatBp(tier.discountBp)}
                      </td>
                      <td className="tabular py-2 text-right font-medium">
                        {formatPrice(
                          effectivePriceCents -
                            Math.round((effectivePriceCents * tier.discountBp) / 10_000),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-faint">
              Größere Stückzahlen als in der Staffel abgebildet klären wir als{' '}
              <Link href="/sonderanfertigung" className="underline underline-offset-2 hover:text-ink-muted">
                Projektanfrage
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function MaterialCard({
  name,
  subline,
  description,
  suited,
  highlight = false,
}: {
  name: string
  subline: string
  description: string
  suited: string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-5',
        highlight
          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-raised)]',
      )}
    >
      <h3 className="font-display text-xl font-semibold">{name}</h3>
      <p className="tabular mt-0.5 text-xs text-ink-faint">{subline}</p>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{description}</p>
      <p className="mt-4 border-t border-[var(--border-subtle)] pt-3 text-xs font-medium text-ink-muted">
        Passt zu: {suited}
      </p>
    </div>
  )
}

function NextStepCard({
  icon,
  eyebrow,
  title,
  description,
  href,
  cta,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  description: string
  href: string
  cta: string
}) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
      <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-hover)]">
        {icon}
      </span>
      <p className="mt-4 text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
        {eyebrow}
      </p>
      <h3 className="mt-1.5 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{description}</p>
      <ButtonLink href={href} variant="outline" size="sm" className="mt-5 self-start">
        {cta}
        <ArrowRight className="size-4" aria-hidden="true" />
      </ButtonLink>
    </div>
  )
}
