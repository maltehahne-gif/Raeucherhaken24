import Image from 'next/image'
import { Package } from 'lucide-react'
import { formatPrice } from '@/lib/money'
import { cn } from '@/lib/utils/cn'
import type { CartView } from '@/lib/server/cart'

/**
 * Bestelluebersicht im Checkout.
 * Zeigt ausschliesslich serverseitig berechnete Werte — dieselbe Grundlage,
 * auf der auch die Bestellung angelegt wird.
 */
export function OrderSummary({ cart }: { cart: CartView }) {
  const { pricing } = cart

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
      <h3 className="font-display text-lg font-semibold">
        Ihre Bestellung
        <span className="ml-2 text-sm font-normal text-ink-muted">
          ({cart.itemCount} {cart.itemCount === 1 ? 'Artikel' : 'Artikel'})
        </span>
      </h3>

      <ul className="mt-4 divide-y divide-[var(--border-subtle)]">
        {cart.lines.map((line) => (
          <li key={line.id} className="flex gap-3 py-3 first:pt-0">
            <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-paper-sunken">
              {line.imageUrl ? (
                <Image src={line.imageUrl} alt="" width={112} height={112} sizes="56px" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-ink-faint">
                  <Package className="size-4" aria-hidden="true" />
                </span>
              )}
              <span className="tabular absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-steel-800 text-2xs font-semibold text-steel-50">
                {line.quantity}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug font-medium">{line.productName}</span>
              {line.variantName && <span className="block text-xs text-ink-muted">{line.variantName}</span>}
              {line.configSummary && (
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{line.configSummary}</span>
              )}
            </span>
            <span className="tabular shrink-0 text-sm font-medium">{formatPrice(line.lineTotalCents)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-2 border-t border-[var(--border-subtle)] pt-4 text-sm">
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
          <dt className="font-display text-base font-semibold">Gesamtsumme</dt>
          <dd className="tabular font-display text-xl font-semibold">{formatPrice(pricing.totalCents)}</dd>
        </div>
        <p className="text-xs text-ink-faint">
          inkl. {formatPrice(pricing.taxCents)} MwSt. · Gesamtgewicht ca.{' '}
          {(pricing.totalWeightGrams / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg
        </p>
      </dl>
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
