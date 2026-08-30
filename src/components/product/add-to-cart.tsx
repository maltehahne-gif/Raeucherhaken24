'use client'

import { useState } from 'react'
import { Check, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuantityStepper } from '@/components/cart/cart-drawer'
import { useCart } from '@/components/cart/cart-provider'

/**
 * Kaufblock der Produktseite.
 *
 * Mehrfachklicks sind unschaedlich: waehrend der Verarbeitung ist der Knopf
 * gesperrt, und die Menge wird serverseitig gegen den Bestand geprueft.
 */
export function AddToCart({
  productId,
  variantId,
  productName,
  maxQuantity,
  disabled,
  disabledReason,
  configuration,
  packagingUnit = 1,
}: {
  productId: string
  variantId?: string | null
  productName: string
  maxQuantity: number
  disabled?: boolean
  disabledReason?: string
  configuration?: Record<string, string> | null
  /** Stueck je Verpackungseinheit — die Menge zaehlt in Gebinden. */
  packagingUnit?: number
}) {
  const { addItem, busy } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [justAdded, setJustAdded] = useState(false)

  async function handleAdd() {
    const ok = await addItem({ productId, variantId, quantity, configuration, productName })
    if (ok) {
      setJustAdded(true)
      setTimeout(() => setJustAdded(false), 2200)
    }
  }

  if (disabled) {
    return (
      <div className="rounded-lg border border-[var(--border-default)] bg-paper-sunken px-4 py-3.5 text-center">
        <p className="text-sm font-medium text-ink-soft">
          {disabledReason ?? 'Dieser Artikel ist derzeit nicht bestellbar.'}
        </p>
        <a
          href="/kontakt"
          className="mt-1 inline-block text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Lieferbarkeit anfragen
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper
          size="md"
          value={quantity}
          min={1}
          max={maxQuantity}
          disabled={busy}
          label={`Menge für ${productName}`}
          onChange={setQuantity}
        />
        <Button
          size="lg"
          onClick={() => void handleAdd()}
          loading={busy}
          className="min-w-[13rem] flex-1"
        >
          {justAdded ? (
            <>
              <Check className="size-4.5" aria-hidden="true" />
              Im Warenkorb
            </>
          ) : (
            <>
              <ShoppingBag className="size-4.5" aria-hidden="true" />
              In den Warenkorb
            </>
          )}
        </Button>
      </div>
      {packagingUnit > 1 && (
        <p className="text-xs text-ink-muted">
          Abgabe in Verpackungseinheiten zu {packagingUnit} Stück — {quantity}{' '}
          {quantity === 1 ? 'Einheit' : 'Einheiten'} entsprechen {quantity * packagingUnit} Stück.
        </p>
      )}
    </div>
  )
}
