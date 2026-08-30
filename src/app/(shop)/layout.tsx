import { getStorefrontSettings } from '@/lib/server/settings'
import { ensureCsrfToken } from '@/lib/server/csrf'
import { buildCartView, getCartToken } from '@/lib/server/cart'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { SeasonBanner } from '@/components/layout/season-banner'
import { SkipLink } from '@/components/layout/skip-link'
import { CartProvider } from '@/components/cart/cart-provider'
import { CartDrawer } from '@/components/cart/cart-drawer'
import { ToastProvider } from '@/components/ui/toast'
import { RevealOnScroll } from '@/components/layout/reveal'
import { JsonLdScript } from '@/components/seo/json-ld'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/structured-data'

/**
 * Layout der Storefront.
 *
 * Der Warenkorb wird bereits serverseitig geladen und als Startwert an den
 * Provider gegeben — dadurch zeigt die Kopfzeile die Artikelzahl schon beim
 * ersten Rendern korrekt an, ohne Nachladen und ohne Sprung im Layout.
 */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [settings, cartToken] = await Promise.all([getStorefrontSettings(), getCartToken()])
  const cart = cartToken ? await buildCartView(cartToken) : null

  // Legt das CSRF-Cookie an, bevor der Browser die erste schreibende Aktion sendet.
  await ensureCsrfToken()

  return (
    <ToastProvider>
      <CartProvider initialCart={cart}>
        <SkipLink />
        {settings.banner && <SeasonBanner text={settings.banner.text} link={settings.banner.link} />}
        <Header />
        <main id="hauptinhalt" className="min-h-[60vh]">
          {children}
        </main>
        <Footer />
        <CartDrawer />
        <RevealOnScroll />
        <JsonLdScript data={[organizationJsonLd(), websiteJsonLd()]} />
      </CartProvider>
    </ToastProvider>
  )
}
