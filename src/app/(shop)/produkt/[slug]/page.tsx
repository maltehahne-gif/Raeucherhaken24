import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Clock, Info, Package, Truck } from 'lucide-react'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, productJsonLd } from '@/lib/seo/structured-data'
import { JsonLdScript } from '@/components/seo/json-ld'
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs'
import { Badge } from '@/components/ui/badge'
import { Price, BasePriceLabel } from '@/components/ui/price'
import { ProductGallery } from '@/components/product/gallery'
import { SpecTable } from '@/components/product/spec-table'
import { AddToCart } from '@/components/product/add-to-cart'
import { ProductConfigurator } from '@/components/product/configurator'
import { RecentlyViewedTracker } from '@/components/product/recently-viewed'
import { ProductRow } from '@/components/product/product-row'
import { Disclosure } from '@/components/ui/disclosure'
import { ShareButtons } from '@/components/ui/share'
import { getRelatedProducts } from '@/lib/server/catalog'
import { calculateBasePrice, selectPromotion } from '@/lib/server/pricing'
import { formatPrice, formatBp } from '@/lib/money'
import { formatLength, formatWeight, truncate } from '@/lib/utils/text'
import { MATERIAL_LABELS } from '@/lib/domain/enums'
import { absoluteUrl } from '@/lib/seo/site'

/**
 * Produktdetailseite.
 *
 * Alle Preisangaben stammen aus der Pricing Engine — Aktionspreise und
 * Mengenstaffeln werden hier mit derselben Funktion berechnet wie im
 * Warenkorb und bei der Bestellanlage.
 */

type PageProps = { params: Promise<{ slug: string }> }

async function loadProduct(slug: string) {
  return prisma.product.findFirst({
    where: { slug, active: true, visible: true },
    include: {
      category: { select: { name: true, slug: true, parent: { select: { name: true, slug: true } } } },
      images: { orderBy: { sortOrder: 'asc' } },
      specs: { orderBy: { sortOrder: 'asc' } },
      variants: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      priceTiers: { orderBy: { minQty: 'asc' } },
      promotions: true,
      optionGroups: {
        orderBy: { sortOrder: 'asc' },
        include: { options: { where: { active: true }, orderBy: { sortOrder: 'asc' } } },
      },
    },
  })
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await loadProduct(slug)
  if (!product) {
    return buildMetadata({ title: 'Artikel nicht gefunden', description: '', path: `/produkt/${slug}`, noIndex: true })
  }

  return buildMetadata({
    title: product.metaTitle ?? product.name,
    description:
      product.metaDescription ??
      product.shortDescription ??
      truncate(product.description.replace(/\s+/g, ' '), 155),
    path: `/produkt/${slug}`,
    image: product.images[0]?.url ?? null,
    imageAlt: product.images[0]?.alt ?? product.name,
  })
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params
  const product = await loadProduct(slug)
  if (!product) notFound()

  const now = new Date()
  const promo = selectPromotion(product.promotions, product.priceCents, now)
  const effectivePriceCents = promo ? promo.priceCents : product.priceCents
  const basePrice = calculateBasePrice(
    effectivePriceCents,
    product.baseUnit,
    product.baseUnitAmount,
    product.baseUnitReference,
    formatPrice,
  )

  const availableStock = Math.max(0, product.stock - product.reservedStock)
  const soldOut = availableStock <= 0 && !product.allowBackorder
  const lowStock = !soldOut && availableStock > 0 && availableStock <= product.lowStockThreshold
  const isConfigurable = product.optionGroups.length > 0

  const related = await getRelatedProducts(product.id, 4)

  const crumbs: Crumb[] = [
    { label: 'Start', href: '/' },
    { label: 'Sortiment', href: '/kategorie' },
    ...(product.category.parent
      ? [{ label: product.category.parent.name, href: `/kategorie/${product.category.parent.slug}` }]
      : []),
    { label: product.category.name, href: `/kategorie/${product.category.slug}` },
    { label: product.name },
  ]

  const images = product.images.map((image) => ({ url: image.url, alt: image.alt }))

  return (
    <>
      <div className="container-page py-6 sm:py-8">
        <Breadcrumbs items={crumbs} className="mb-6" />

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <ProductGallery images={images} productName={product.name} />
          </div>

          <div className="min-w-0">
            <p className="text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
              {product.category.name}
            </p>
            <h1 className="mt-2 font-display text-3xl leading-tight font-semibold sm:text-4xl">
              {product.name}
            </h1>
            {product.subtitle && (
              <p className="mt-3 text-lg leading-relaxed text-ink-muted">{product.subtitle}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {promo && <Badge tone="accent">{promo.promotion.name}</Badge>}
              {product.bestseller && <Badge tone="steel">Bestseller</Badge>}
              {product.material && <Badge tone="outline">{MATERIAL_LABELS[product.material] ?? product.material}</Badge>}
            </div>

            {/* Preisblock */}
            <div className="mt-6 border-y border-[var(--border-subtle)] py-5">
              <Price cents={effectivePriceCents} listCents={promo ? product.priceCents : null} size="xl" />
              {basePrice && <BasePriceLabel label={basePrice.label} className="mt-1" />}
              <p className="mt-1.5 text-xs text-ink-faint">
                inkl. {formatBp(product.taxRateBp)} MwSt.{' '}
                <Link href="/versand" className="underline underline-offset-2 hover:text-ink-muted">
                  zzgl. Versandkosten
                </Link>
              </p>
              {promo && (
                <p className="mt-2 text-xs font-medium text-[var(--accent-hover)]">
                  Aktionspreis gültig bis {promo.promotion.endsAt.toLocaleDateString('de-DE')}
                </p>
              )}
            </div>

            {/* Verfuegbarkeit */}
            <div className="mt-5 space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={
                    soldOut
                      ? 'size-2 rounded-full bg-steel-400'
                      : lowStock
                        ? 'size-2 rounded-full bg-warning-500'
                        : 'size-2 rounded-full bg-success-500'
                  }
                />
                <span className={soldOut ? 'text-ink-muted' : lowStock ? 'text-warning-700' : 'text-success-700'}>
                  {soldOut
                    ? 'Derzeit ausverkauft'
                    : product.allowBackorder
                      ? 'Fertigung nach Auftrag'
                      : lowStock
                        ? `Nur noch ${availableStock} auf Lager`
                        : 'Auf Lager und sofort versandfertig'}
                </span>
              </p>
              <p className="flex items-center gap-2 text-ink-muted">
                <Truck className="size-4 shrink-0" aria-hidden="true" />
                Lieferzeit {product.deliveryDaysMin}–{product.deliveryDaysMax} Werktage
              </p>
              {product.packagingUnit > 1 && (
                <p className="flex items-center gap-2 text-ink-muted">
                  <Package className="size-4 shrink-0" aria-hidden="true" />
                  Verpackungseinheit: {product.packagingUnit} Stück
                </p>
              )}
            </div>

            {/* Mengenstaffel */}
            {product.priceTiers.length > 0 && (
              <div className="mt-5 rounded-lg border border-[var(--border-subtle)] bg-paper-sunken/70 p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Info className="size-4 text-[var(--accent)]" aria-hidden="true" />
                  Mengenstaffel
                </h2>
                <table className="mt-3 w-full text-sm">
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Ab Menge</th>
                      <th scope="col">Stückpreis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {product.priceTiers.map((tier) => {
                      const tierPrice = effectivePriceCents - Math.round((effectivePriceCents * tier.discountBp) / 10_000)
                      return (
                        <tr key={tier.id}>
                          <td className="py-1.5 text-ink-muted">ab {tier.minQty} Stück</td>
                          <td className="tabular py-1.5 text-right font-medium">
                            {formatPrice(tierPrice)}
                            <span className="ml-2 text-xs font-normal text-success-700">
                              −{formatBp(tier.discountBp)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Kauf bzw. Konfigurator */}
            <div className="mt-6">
              {isConfigurable ? (
                <ProductConfigurator
                  productId={product.id}
                  productName={product.name}
                  basePriceCents={product.priceCents}
                  taxRateBp={product.taxRateBp}
                  maxQuantity={product.allowBackorder ? 999 : Math.max(1, availableStock)}
                  disabled={soldOut}
                  groups={product.optionGroups.map((group) => ({
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
              ) : (
                <AddToCart
                  productId={product.id}
                  productName={product.name}
                  maxQuantity={product.allowBackorder ? 999 : Math.max(1, availableStock)}
                  disabled={soldOut}
                  disabledReason="Dieser Artikel ist derzeit ausverkauft."
                  packagingUnit={product.packagingUnit}
                />
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-faint">
              <span className="tabular">
                Art.-Nr. {product.articleNumber} · SKU {product.sku}
              </span>
              <ShareButtons
                url={absoluteUrl(`/produkt/${product.slug}`)}
                title={product.name}
                text={product.shortDescription ?? product.name}
              />
            </div>

            {/* Beschreibung und technische Daten */}
            <div className="mt-8 border-t border-[var(--border-subtle)]">
              <Disclosure title="Produktbeschreibung" defaultOpen>
                <div className="space-y-3 whitespace-pre-line">{product.description}</div>
              </Disclosure>

              {product.specs.length > 0 && (
                <Disclosure title="Technische Daten" defaultOpen>
                  <SpecTable
                    specs={product.specs.map((s) => ({
                      key: s.key,
                      label: s.label,
                      value: s.value,
                      group: s.group,
                    }))}
                  />
                </Disclosure>
              )}

              <Disclosure title="Maße und Gewicht">
                <SpecTable
                  specs={[
                    ...(product.lengthMm ? [{ key: 'l', label: 'Länge', value: formatLength(product.lengthMm), group: 'Abmessungen' }] : []),
                    ...(product.widthMm ? [{ key: 'b', label: 'Breite', value: formatLength(product.widthMm), group: 'Abmessungen' }] : []),
                    ...(product.weightGrams ? [{ key: 'g', label: 'Gewicht', value: formatWeight(product.weightGrams), group: 'Abmessungen' }] : []),
                    ...(product.shippingWeightGrams
                      ? [{ key: 'vg', label: 'Versandgewicht', value: formatWeight(product.shippingWeightGrams), group: 'Abmessungen' }]
                      : []),
                    {
                      key: 'vpe',
                      label: 'Verpackungseinheit',
                      value: product.packagingUnit > 1 ? `${product.packagingUnit} Stück` : '1 Stück',
                      group: 'Abmessungen',
                    },
                  ]}
                />
              </Disclosure>

              <Disclosure title="Versand und Lieferung">
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <Clock className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                    <span>
                      Lieferzeit {product.deliveryDaysMin}–{product.deliveryDaysMax} Werktage innerhalb Deutschlands.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                    <span>Ab 79 € Warenwert versenden wir innerhalb Deutschlands versandkostenfrei.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Info className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                    <span>
                      Einzelheiten zu Versandkosten und Lieferländern finden Sie auf der{' '}
                      <Link href="/versand" className="underline underline-offset-2">
                        Versandseite
                      </Link>
                      .
                    </span>
                  </li>
                </ul>
              </Disclosure>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <ProductRow
            className="mt-20"
            eyebrow="Passt dazu"
            title="Kunden kombinieren diesen Artikel mit"
            products={related}
          />
        )}

        <RecentlyViewedTracker slug={product.slug} />
      </div>

      <JsonLdScript
        data={[
          breadcrumbJsonLd(crumbs),
          productJsonLd({
            name: product.name,
            description: product.shortDescription ?? truncate(product.description, 300),
            sku: product.sku,
            articleNumber: product.articleNumber,
            slug: product.slug,
            imageUrls: images.map((i) => i.url),
            priceCents: effectivePriceCents,
            inStock: !soldOut,
            material: product.material,
            categoryName: product.category.name,
            weightGrams: product.weightGrams,
            priceValidUntil: promo ? promo.promotion.endsAt : null,
          }),
        ]}
      />
    </>
  )
}
