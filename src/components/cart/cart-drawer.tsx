'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Minus, Plus, ShoppingBag, Tag, Trash2, Truck, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button, ButtonLink, IconButton, Spinner } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/components/cart/cart-provider'
import { formatPrice } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

/**
 * Warenkorb als seitliches Panel.
 *
 * Alle Betraege kommen fertig gerechnet vom Server. Die Komponente formatiert
 * nur — sie rechnet nichts.
 */
export function CartDrawer() {
  const { cart, open, closeCart, busy, updateQuantity, removeItem } = useCart()

  const pricing = cart?.pricing
  const lines = cart?.lines ?? []
  const isEmpty = lines.length === 0

  return (
    <Dialog
      open={open}
      onClose={closeCart}
      placement="right"
      title="Ihr Warenkorb"
      description={isEmpty ? undefined : `${cart?.itemCount} Artikel`}
      className="max-w-[27rem]"
      footer={
        isEmpty ? undefined : (
          <div className="w-full space-y-3">
            <PricingSummary />
            <ButtonLink href="/kasse" size="lg" fullWidth onClick={closeCart}>
              Zur Kasse
            </ButtonLink>
            <button
              type="button"
              onClick={closeCart}
              className="w-full text-center text-xs font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              Weiter einkaufen
            </button>
          </div>
        )
      }
    >
      {isEmpty ? (
        <EmptyState
          compact
          icon={<ShoppingBag className="size-5" aria-hidden="true" />}
          title="Ihr Warenkorb ist leer"
          description="Stöbern Sie im Sortiment oder lassen Sie sich in wenigen Schritten das Passende empfehlen."
          action={{ label: 'Zum Sortiment', href: '/kategorie' }}
          secondaryAction={{ label: 'Kaufberatung starten', href: '/beratung' }}
        />
      ) : (
        <div className="space-y-4">
          <FreeShippingProgress />
          <ul className="divide-y divide-[var(--border-subtle)]">
            {lines.map((line) => (
              <li key={line.id} className="flex gap-3 py-4 first:pt-0">
                <Link
                  href={`/produkt/${line.productSlug}`}
                  onClick={closeCart}
                  className="relative size-20 shrink-0 overflow-hidden rounded-md bg-paper-sunken"
                >
                  {line.imageUrl ? (
                    <Image
                      src={line.imageUrl}
                      alt={line.productName}
                      width={160}
                      height={160}
                      className="size-full object-cover"
                      sizes="80px"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-ink-faint">
                      <ShoppingBag className="size-5" aria-hidden="true" />
                    </span>
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/produkt/${line.productSlug}`}
                        onClick={closeCart}
                        className="line-clamp-2 text-sm leading-snug font-medium text-ink hover:text-[var(--accent)]"
                      >
                        {line.productName}
                      </Link>
                      {line.variantName && (
                        <p className="mt-0.5 text-xs text-ink-muted">{line.variantName}</p>
                      )}
                      {line.configSummary && (
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{line.configSummary}</p>
                      )}
                    </div>
                    <IconButton
                      label={`${line.productName} entfernen`}
                      size="xs"
                      onClick={() => void removeItem(line.id)}
                      disabled={busy}
                      className="-mt-1 -mr-1 shrink-0 text-ink-faint hover:text-danger-500"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </IconButton>
                  </div>

                  {(line.appliedPromotionName || line.appliedTierMinQty) && (
                    <div className="flex flex-wrap gap-1.5">
                      {line.appliedPromotionName && (
                        <Badge tone="accent">{line.appliedPromotionName}</Badge>
                      )}
                      {line.appliedTierMinQty && (
                        <Badge tone="success">
                          Mengenrabatt ab {line.appliedTierMinQty} Stück
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                    <QuantityStepper
                      value={line.quantity}
                      max={line.maxQuantity}
                      disabled={busy}
                      label={`Menge für ${line.productName}`}
                      onChange={(next) => void updateQuantity(line.id, next)}
                    />
                    <div className="text-right">
                      <p className="tabular text-sm font-semibold">{formatPrice(line.lineTotalCents)}</p>
                      {line.savingsCents > 0 && (
                        <p className="tabular text-2xs text-success-700">
                          −{formatPrice(line.savingsCents)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {busy && (
        <p className="sr-only" role="status">
          Warenkorb wird aktualisiert
        </p>
      )}
      {pricing === undefined && null}
    </Dialog>
  )
}

/** Fortschritt bis zum kostenfreien Versand. */
function FreeShippingProgress() {
  const { cart } = useCart()
  if (!cart) return null
  const { freeShippingRemainingCents, freeShippingThresholdCents, subtotalCents } = cart.pricing
  const reached = freeShippingRemainingCents === 0
  const percent = Math.min(100, Math.round((subtotalCents / freeShippingThresholdCents) * 100))

  return (
    <div
      className={cn(
        'rounded-lg border px-3.5 py-3',
        reached ? 'border-success-100 bg-success-50' : 'border-[var(--border-subtle)] bg-paper-sunken/70',
      )}
    >
      <p className="flex items-center gap-2 text-xs font-medium">
        <Truck
          className={cn('size-4 shrink-0', reached ? 'text-success-500' : 'text-ink-muted')}
          aria-hidden="true"
        />
        {reached ? (
          <span className="text-success-700">Versandkostenfrei — geschafft.</span>
        ) : (
          <span className="text-ink-soft">
            Noch <strong className="tabular font-semibold">{formatPrice(freeShippingRemainingCents)}</strong>{' '}
            bis zum versandkostenfreien Paket
          </span>
        )}
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Fortschritt bis zum kostenfreien Versand"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 [transition-timing-function:var(--ease-out-soft)]',
            reached ? 'bg-success-500' : 'bg-[var(--accent)]',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/** Summenblock mit Gutscheineingabe. */
function PricingSummary() {
  const { cart, applyCoupon, removeCoupon, busy } = useCart()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showInput, setShowInput] = useState(false)
  const pricing = cart?.pricing
  if (!pricing) return null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const result = await applyCoupon(code)
    if (result.ok) {
      setCode('')
      setShowInput(false)
    } else {
      setError(result.error ?? 'Der Gutschein konnte nicht eingelöst werden.')
    }
  }

  return (
    <div className="space-y-2 text-sm">
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

      {cart?.couponCode && pricing.couponApplied ? (
        <button
          type="button"
          onClick={() => void removeCoupon()}
          disabled={busy}
          className="flex items-center gap-1.5 text-xs text-ink-muted underline underline-offset-2 hover:text-danger-500"
        >
          <X className="size-3" aria-hidden="true" />
          Gutschein {cart.couponCode} entfernen
        </button>
      ) : showInput ? (
        <form onSubmit={submit} className="space-y-1.5">
          <div className="flex gap-2">
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Gutscheincode"
              aria-label="Gutscheincode"
              aria-invalid={error ? true : undefined}
              maxLength={40}
              className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border-default)] px-3 text-sm uppercase outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
            <Button type="submit" size="sm" variant="outline" disabled={busy || code.length < 3}>
              {busy ? <Spinner className="size-4" /> : 'Einlösen'}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-danger-700">
              {error}
            </p>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          <Tag className="size-3.5" aria-hidden="true" />
          Gutscheincode eingeben
        </button>
      )}

      <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-2.5">
        <span className="font-display text-base font-semibold">Gesamt</span>
        <span className="tabular font-display text-lg font-semibold">
          {formatPrice(pricing.totalCents)}
        </span>
      </div>
      <p className="text-2xs text-ink-faint">
        inkl. {formatPrice(pricing.taxCents)} MwSt.
      </p>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className={cn('tabular font-medium', tone === 'success' ? 'text-success-700' : 'text-ink')}>
        {value}
      </span>
    </div>
  )
}

/** Mengensteuerung mit ausreichend grossen Touch-Zielen. */
export function QuantityStepper({
  value,
  max,
  min = 1,
  disabled,
  label,
  onChange,
  size = 'sm',
}: {
  value: number
  max: number
  min?: number
  disabled?: boolean
  label: string
  onChange: (value: number) => void
  size?: 'sm' | 'md'
}) {
  const buttonSize = size === 'sm' ? 'size-9' : 'size-11'
  return (
    <div className="inline-flex items-center rounded-md border border-[var(--border-default)]">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={`${label}: eins weniger`}
        className={cn(
          buttonSize,
          'flex items-center justify-center rounded-l-md text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink disabled:opacity-35',
        )}
      >
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => {
          const next = Number.parseInt(e.target.value, 10)
          if (Number.isFinite(next)) onChange(Math.min(Math.max(next, min), max))
        }}
        className={cn(
          'tabular border-x border-[var(--border-default)] text-center text-sm font-medium outline-none focus:bg-[var(--accent-soft)]',
          size === 'sm' ? 'h-9 w-11' : 'h-11 w-14',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )}
      />
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`${label}: eins mehr`}
        className={cn(
          buttonSize,
          'flex items-center justify-center rounded-r-md text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink disabled:opacity-35',
        )}
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
