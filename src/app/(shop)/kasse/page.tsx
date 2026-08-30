import type { Metadata } from 'next'
import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { buildCartView, getCartToken } from '@/lib/server/cart'
import { CheckoutForm } from '@/components/checkout/checkout-form'
import { OrderSummary } from '@/components/checkout/order-summary'
import { EmptyState } from '@/components/ui/states'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Kasse',
  description: 'Bestellung abschließen bei Räucherhaken24.',
  path: '/kasse',
  noIndex: true,
})

/**
 * Checkout.
 *
 * Bewusst eine einzige Seite ohne Nebenwege: Adresse, Übersicht, Bestätigung.
 * Kein Konto, kein Zwischenschritt, keine Ablenkung durch Navigation.
 */
export default async function CheckoutPage() {
  const token = await getCartToken()
  const cart = token ? await buildCartView(token) : null

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<ShoppingBag className="size-5" aria-hidden="true" />}
          title="Ihr Warenkorb ist leer"
          description="Legen Sie zuerst Artikel in den Warenkorb, dann können Sie die Bestellung abschließen."
          action={{ label: 'Zum Sortiment', href: '/kategorie' }}
        />
      </div>
    )
  }

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Bestellung abschließen</h1>
        <Link href="/warenkorb" className="shrink-0 text-sm text-ink-muted underline underline-offset-4 hover:text-ink">
          Warenkorb prüfen
        </Link>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">
        <CheckoutForm couponCode={cart.couponCode} />
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="sr-only">Bestellübersicht</h2>
          <OrderSummary cart={cart} />
        </aside>
      </div>
    </div>
  )
}
