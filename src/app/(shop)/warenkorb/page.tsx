import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
import { buildCartView, getCartToken } from '@/lib/server/cart'
import { CartPageContent } from '@/components/cart/cart-page'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Warenkorb',
  description: 'Ihre ausgewählten Artikel bei Räucherhaken24.',
  path: '/warenkorb',
  noIndex: true,
})

/**
 * Vollbild-Warenkorb als Alternative zum Panel.
 * Nuetzlich vor der Bestellung, beim Teilen des Bildschirms und wenn viele
 * Positionen im Korb liegen.
 */
export default async function CartPage() {
  const token = await getCartToken()
  const cart = token ? await buildCartView(token) : null

  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Start', href: '/' }, { label: 'Warenkorb' }]} className="mb-6" />
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">Warenkorb</h1>
      <CartPageContent initialCart={cart} />
    </div>
  )
}
