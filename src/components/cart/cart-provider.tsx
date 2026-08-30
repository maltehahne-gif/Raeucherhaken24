'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '@/lib/client/api'
import { useToast } from '@/components/ui/toast'
import type { CartView } from '@/lib/server/cart'

/**
 * Warenkorb-Zustand im Browser.
 *
 * Der Zustand ist bewusst eine Kopie des Servers: Jede Aktion schickt die
 * Absicht an die API und uebernimmt die Antwort vollstaendig. Preise werden
 * dadurch nie im Browser gerechnet und koennen nicht auseinanderlaufen.
 */

interface CartContextValue {
  cart: CartView | null
  /** true, solange der erste Abruf laeuft. */
  loading: boolean
  /** true, waehrend eine Aenderung verarbeitet wird. */
  busy: boolean
  open: boolean
  itemCount: number
  openCart: () => void
  closeCart: () => void
  addItem: (input: {
    productId: string
    variantId?: string | null
    quantity: number
    configuration?: Record<string, string> | null
    productName?: string
  }) => Promise<boolean>
  updateQuantity: (itemId: string, quantity: number) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
  applyCoupon: (code: string) => Promise<{ ok: boolean; error?: string }>
  removeCoupon: () => Promise<void>
  refresh: () => Promise<void>
}

const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart muss innerhalb von <CartProvider> verwendet werden')
  return ctx
}

export function CartProvider({
  children,
  initialCart,
}: {
  children: React.ReactNode
  initialCart: CartView | null
}) {
  const [cart, setCart] = useState<CartView | null>(initialCart)
  const [loading, setLoading] = useState(initialCart === null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const toast = useToast()

  const applyResult = useCallback(
    (next: CartView) => {
      setCart(next)
      // Serverseitige Hinweise (Bestand angepasst, Artikel entfernt) sichtbar machen.
      for (const notice of next.notices) toast.info('Warenkorb angepasst', notice)
      if (next.couponMessage) toast.info('Gutschein', next.couponMessage)
    },
    [toast],
  )

  const refresh = useCallback(async () => {
    const result = await apiRequest<CartView>('/api/cart')
    if (result.ok) setCart(result.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (initialCart === null) void refresh()
  }, [initialCart, refresh])

  const addItem = useCallback<CartContextValue['addItem']>(
    async (input) => {
      setBusy(true)
      const result = await apiRequest<CartView>('/api/cart', {
        method: 'POST',
        body: {
          productId: input.productId,
          variantId: input.variantId ?? null,
          quantity: input.quantity,
          configuration: input.configuration ?? null,
        },
      })
      setBusy(false)

      if (!result.ok) {
        toast.error('Nicht in den Warenkorb gelegt', result.error)
        return false
      }
      applyResult(result.data)
      setOpen(true)
      return true
    },
    [applyResult, toast],
  )

  const updateQuantity = useCallback<CartContextValue['updateQuantity']>(
    async (itemId, quantity) => {
      setBusy(true)
      const result = await apiRequest<CartView>('/api/cart', {
        method: 'PATCH',
        body: { itemId, quantity },
      })
      setBusy(false)
      if (!result.ok) {
        toast.error('Menge nicht geändert', result.error)
        await refresh()
        return
      }
      applyResult(result.data)
    },
    [applyResult, refresh, toast],
  )

  const removeItem = useCallback<CartContextValue['removeItem']>(
    async (itemId) => {
      setBusy(true)
      const result = await apiRequest<CartView>('/api/cart', {
        method: 'DELETE',
        body: { itemId },
      })
      setBusy(false)
      if (!result.ok) {
        toast.error('Artikel nicht entfernt', result.error)
        return
      }
      applyResult(result.data)
    },
    [applyResult, toast],
  )

  const applyCoupon = useCallback<CartContextValue['applyCoupon']>(
    async (code) => {
      setBusy(true)
      const result = await apiRequest<CartView>('/api/cart/coupon', { method: 'POST', body: { code } })
      setBusy(false)
      if (!result.ok) return { ok: false, error: result.error }
      applyResult(result.data)
      toast.success('Gutschein eingelöst', `Der Code ${code} wurde angewendet.`)
      return { ok: true }
    },
    [applyResult, toast],
  )

  const removeCoupon = useCallback<CartContextValue['removeCoupon']>(async () => {
    setBusy(true)
    const result = await apiRequest<CartView>('/api/cart/coupon', { method: 'DELETE' })
    setBusy(false)
    if (result.ok) setCart(result.data)
  }, [])

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      loading,
      busy,
      open,
      itemCount: cart?.itemCount ?? 0,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
      addItem,
      updateQuantity,
      removeItem,
      applyCoupon,
      removeCoupon,
      refresh,
    }),
    [cart, loading, busy, open, addItem, updateQuantity, removeItem, applyCoupon, removeCoupon, refresh],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
