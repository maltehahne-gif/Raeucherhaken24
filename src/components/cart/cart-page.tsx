'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Package, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from '@/components/cart/cart-provider'
import { QuantityStepper } from '@/components/cart/cart-drawer'
import { EmptyState } from '@/components/ui/states'
import { ButtonLink, IconButton } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/money'
import type { CartView } from '@/lib/server/cart'
import { cn } from '@/lib/utils/cn'

/**
 * Warenkorbseite.
 * Nutzt denselben Zustand wie das Panel, damit beide Ansichten nie
 * auseinanderlaufen koennen.
 */
export function CartPageContent({ initialCart }: { initialCart: CartView | null }) {
  const { cart, updateQuantity, removeItem, busy, refresh } = useCart()

  // Beim Betreten der Seite den Warenkorb frisch vom Server holen —
  // Bestaende und Aktionen koennen sich seit dem letzten Blick geaendert haben.
  useEffect(() => {
    void refresh()
  }, [refresh])

  const view = cart ?? initialCart
  if (!view || view.lines.length === 0) {
    return (
      <EmptyState
        className="mt-10"
        icon={<ShoppingBag className="size-5" aria-hidden="true" />}
        title="Ihr Warenkorb ist leer"
        description="Stöbern Sie im Sortiment oder lassen Sie sich in wenigen Schritten das Passende empfehlen."
        action={{ label: 'Zum Sortiment', href: '/kategorie' }}
        secondaryAction={{ label: 'Kaufberatung starten', href: '/beratung' }}
      />
    )
  }

  const { pricing } = view

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_0.6fr] lg:gap-14">
      <div>
        <ul className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {view.lines.map((line) => (
            <li key={line.id} className="flex gap-4 py-5">
              <Link
                href={`/produkt/${line.productSlug}`}
                className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-paper-sunken sm:size-28"
              >
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt={line.productName}
                    width={224}
                    height={224}
                    sizes="112px"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-ink-faint">
                    <Package className="size-6" aria-hidden="true" />
                  </span>
                )}
              </Link>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/produkt/${line.productSlug}`}
                      className="font-display text-base leading-snug font-semibold hover:text-[var(--accent)]"
                    >
                      {line.productName}
                    </Link>
                    {line.variantName && <p className="mt-0.5 text-sm text-ink-muted">{line.variantName}</p>}
                    {line.configSummary && (
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{line.configSummary}</p>
                    )}
                    <p className="tabular mt-1 text-xs text-ink-faint">Art.-Nr. {line.articleNumber}</p>
                  </div>
                  <IconButton
                    label={`${line.productName} entfernen`}
                    onClick={() => void removeItem(line.id)}
                    disabled={busy}
                    className="shrink-0 text-ink-faint hover:text-danger-500"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </IconButton>
                </div>

                {(line.appliedPromotionName || line.appliedTierMinQty) && (
                  <div className="flex flex-wrap gap-1.5">
                    {line.appliedPromotionName && <Badge tone="accent">{line.appliedPromotionName}</Badge>}
                    {line.appliedTierMinQty && (
                      <Badge tone="success">Mengenrabatt ab {line.appliedTierMinQty} Stück</Badge>
                    )}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
                  <QuantityStepper
                    value={line.quantity}
                    min={1}
                    max={line.maxQuantity}
                    disabled={busy}
                    label={`Menge für ${line.productName}`}
                    onChange={(next) => void updateQuantity(line.id, next)}
                  />
                  <div className="text-right">
                    <p className="tabular text-base font-semibold">{formatPrice(line.lineTotalCents)}</p>
                    <p className="tabular text-xs text-ink-faint">
                      {formatPrice(line.unitPriceCents)} je Stück
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Link
          href="/kategorie"
          className="mt-5 inline-block text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Weiter einkaufen
        </Link>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <h2 className="font-display text-lg font-semibold">Zusammenfassung</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Zwischensumme" value={formatPrice(pricing.subtotalCents)} />
            {pricing.savingsCents > 0 && (
              <Row label="Aktionen und Staffelpreise" value={`−${formatPrice(pricing.savingsCents)}`} tone="success" />
            )}
            {pricing.discountCents > 0 && (
              <Row
                label={`Gutschein ${pricing.couponCode ?? ''}`.trim()}
                value={`−${formatPrice(pricing.discountCents)}`}
                tone="success"
              />
            )}
            <Row
              label="Versand"
              value={pricing.shippingCents === 0 ? 'kostenfrei' : formatPrice(pricing.shippingCents)}
            />
            <div className="flex items-baseline justify-between gap-4 border-t border-[var(--border-subtle)] pt-3">
              <dt className="font-display text-base font-semibold">Gesamt</dt>
              <dd className="tabular font-display text-xl font-semibold">{formatPrice(pricing.totalCents)}</dd>
            </div>
            <p className="text-xs text-ink-faint">inkl. {formatPrice(pricing.taxCents)} MwSt.</p>
          </dl>

          <ButtonLink href="/kasse" size="lg" fullWidth className="mt-5">
            Zur Kasse
          </ButtonLink>
        </div>
      </aside>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn('tabular font-medium', tone === 'success' ? 'text-success-700' : 'text-ink')}>
        {value}
      </dd>
    </div>
  )
}
