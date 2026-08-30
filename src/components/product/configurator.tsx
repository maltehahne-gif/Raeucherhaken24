'use client'

import { useMemo, useState } from 'react'
import { Check, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OptionCard } from '@/components/ui/field'
import { QuantityStepper } from '@/components/cart/cart-drawer'
import { useCart } from '@/components/cart/cart-provider'
import { priceLine, type PricingPromotion } from '@/lib/server/pricing'
import { formatPrice, formatBp } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

/**
 * Räucherhaken-Konfigurator.
 *
 * Die Vorschau rechnet mit exakt derselben Funktion wie der Server
 * (priceLine aus der Pricing Engine — reine Funktionen ohne Serverabhaengigkeit).
 * Verbindlich ist trotzdem allein das Ergebnis der API: beim Hinzufuegen
 * schickt der Browser nur die gewaehlten Optionsschluessel, und der Server
 * bewertet sie erneut gegen die Stammdaten. Ein manipulierter Aufpreis im
 * Browser aendert damit nichts am tatsaechlichen Preis.
 */

export interface ConfigOptionView {
  key: string
  label: string
  description: string | null
  priceDeltaCents: number
  priceDeltaBp: number
  isDefault: boolean
}

export interface ConfigGroupView {
  key: string
  label: string
  helpText: string | null
  required: boolean
  options: ConfigOptionView[]
}

interface SerializedPromotion {
  id: string
  name: string
  salePriceCents: number | null
  discountBp: number | null
  startsAt: string
  endsAt: string
  active: boolean
}

export function ProductConfigurator({
  productId,
  productName,
  basePriceCents,
  taxRateBp,
  groups,
  priceTiers,
  promotions,
  maxQuantity,
  disabled = false,
}: {
  productId: string
  productName: string
  basePriceCents: number
  taxRateBp: number
  groups: ConfigGroupView[]
  priceTiers: Array<{ minQty: number; discountBp: number }>
  promotions: SerializedPromotion[]
  maxQuantity: number
  disabled?: boolean
}) {
  const { addItem, busy } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const group of groups) {
      const preset = group.options.find((o) => o.isDefault) ?? (group.required ? group.options[0] : undefined)
      if (preset) initial[group.key] = preset.key
    }
    return initial
  })

  const missingGroups = groups.filter((g) => g.required && !selection[g.key])

  const breakdown = useMemo(() => {
    const chosenOptions = groups.flatMap((group) => {
      const optionKey = selection[group.key]
      if (!optionKey) return []
      const option = group.options.find((o) => o.key === optionKey)
      if (!option) return []
      return [
        {
          groupKey: group.key,
          optionKey: option.key,
          label: option.label,
          groupLabel: group.label,
          priceDeltaCents: option.priceDeltaCents,
          priceDeltaBp: option.priceDeltaBp,
          weightDeltaGrams: 0,
        },
      ]
    })

    const parsedPromotions: PricingPromotion[] = promotions.map((p) => ({
      id: p.id,
      name: p.name,
      salePriceCents: p.salePriceCents,
      discountBp: p.discountBp,
      startsAt: new Date(p.startsAt),
      endsAt: new Date(p.endsAt),
      active: p.active,
    }))

    return priceLine(
      {
        key: 'preview',
        productId,
        name: productName,
        sku: '',
        articleNumber: '',
        basePriceCents,
        taxRateBp,
        quantity,
        weightGrams: 0,
        options: chosenOptions,
        promotions: parsedPromotions,
        priceTiers,
      },
      new Date(),
    )
  }, [groups, selection, promotions, productId, productName, basePriceCents, taxRateBp, quantity, priceTiers])

  async function handleAdd() {
    if (missingGroups.length > 0) return
    const ok = await addItem({ productId, quantity, configuration: selection, productName })
    if (ok) {
      setJustAdded(true)
      setTimeout(() => setJustAdded(false), 2200)
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <fieldset key={group.key}>
          <legend className="mb-1 text-sm font-semibold text-ink">
            {group.label}
            {group.required && (
              <span className="ml-0.5 text-[var(--accent)]" aria-hidden="true">
                *
              </span>
            )}
          </legend>
          {group.helpText && <p className="mb-2.5 text-xs leading-relaxed text-ink-muted">{group.helpText}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {group.options.map((option) => (
              <OptionCard
                key={option.key}
                name={`config-${group.key}`}
                value={option.key}
                label={option.label}
                description={option.description ?? undefined}
                meta={surchargeLabel(option, basePriceCents)}
                checked={selection[group.key] === option.key}
                disabled={disabled}
                onChange={() => setSelection((s) => ({ ...s, [group.key]: option.key }))}
              />
            ))}
          </div>
        </fieldset>
      ))}

      {/* Preisaufschlüsselung */}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-paper-sunken/70 p-4">
        <h3 className="text-sm font-semibold">Ihre Konfiguration</h3>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Grundpreis" value={formatPrice(basePriceCents)} />
          {breakdown.options.map((option) => (
            <Row
              key={option.groupKey}
              label={`${option.groupLabel}: ${option.label}`}
              value={
                option.priceDeltaCents === 0 && option.priceDeltaBp === 0
                  ? 'ohne Aufpreis'
                  : `+ ${formatPrice(option.priceDeltaCents + Math.round((basePriceCents * option.priceDeltaBp) / 10_000))}`
              }
              muted
            />
          ))}
          {breakdown.appliedPromotionName && (
            <Row label={breakdown.appliedPromotionName} value="Aktionspreis" tone="accent" />
          )}
          {breakdown.appliedTierMinQty !== null && (
            <Row
              label={`Mengenstaffel ab ${breakdown.appliedTierMinQty} Stück`}
              value={`− ${formatBp(breakdown.appliedTierDiscountBp)}`}
              tone="success"
            />
          )}
          <div className="flex items-baseline justify-between gap-4 border-t border-[var(--border-subtle)] pt-2">
            <dt className="text-sm font-medium">Stückpreis</dt>
            <dd className="tabular text-sm font-semibold">{formatPrice(breakdown.unitPriceCents)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-display text-base font-semibold">
              Gesamt ({quantity} {quantity === 1 ? 'Stück' : 'Stück'})
            </dt>
            <dd className="tabular font-display text-lg font-semibold">
              {formatPrice(breakdown.lineTotalCents)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-2xs text-ink-faint">
          Vorschau. Verbindlich ist der im Warenkorb ausgewiesene Preis.
        </p>
      </div>

      {missingGroups.length > 0 && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          Bitte wählen Sie noch: {missingGroups.map((g) => g.label).join(', ')}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper
          size="md"
          value={quantity}
          min={1}
          max={maxQuantity}
          disabled={busy || disabled}
          label={`Menge für ${productName}`}
          onChange={setQuantity}
        />
        <Button
          size="lg"
          className="min-w-[13rem] flex-1"
          loading={busy}
          disabled={disabled || missingGroups.length > 0}
          onClick={() => void handleAdd()}
        >
          {justAdded ? (
            <>
              <Check className="size-4.5" aria-hidden="true" />
              Im Warenkorb
            </>
          ) : (
            <>
              <ShoppingBag className="size-4.5" aria-hidden="true" />
              Konfiguration in den Warenkorb
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function surchargeLabel(option: ConfigOptionView, basePriceCents: number): string | undefined {
  const fromBp = Math.round((basePriceCents * option.priceDeltaBp) / 10_000)
  const total = option.priceDeltaCents + fromBp
  if (total === 0) return undefined
  return total > 0 ? `+ ${formatPrice(total)}` : `− ${formatPrice(-total)}`
}

function Row({
  label,
  value,
  muted,
  tone,
}: {
  label: string
  value: string
  muted?: boolean
  tone?: 'accent' | 'success'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn('min-w-0', muted ? 'text-ink-muted' : 'text-ink-soft')}>{label}</dt>
      <dd
        className={cn(
          'tabular shrink-0 font-medium',
          tone === 'accent' && 'text-[var(--accent-hover)]',
          tone === 'success' && 'text-success-700',
          !tone && (muted ? 'text-ink-muted' : 'text-ink'),
        )}
      >
        {value}
      </dd>
    </div>
  )
}
