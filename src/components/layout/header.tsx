'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Menu, Search, ShoppingBag, X } from 'lucide-react'
import { CATALOG_NAV, CONTENT_NAV, SERVICE_NAV } from '@/lib/navigation'
import { useCart } from '@/components/cart/cart-provider'
import { SearchDialog } from '@/components/search/search-dialog'
import { useHotkey } from '@/lib/client/hooks'
import { cn } from '@/lib/utils/cn'
import { Logo } from '@/components/layout/logo'

/**
 * Kopfzeile der Storefront.
 *
 * Auf grossen Bildschirmen ein Menue mit aufklappbaren Kategorien, auf kleinen
 * ein vollflaechiges Panel. Beide Wege fuehren zu denselben Zielen aus
 * src/lib/navigation.ts.
 */
export function Header() {
  const pathname = usePathname()
  const { itemCount, openCart } = useCart()
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)

  useHotkey('k', () => setSearchOpen(true))

  // Menues bei Navigation schliessen.
  useEffect(() => {
    setMobileOpen(false)
    setOpenGroup(null)
  }, [pathname])

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-40 border-b bg-steel-900/94 backdrop-blur-md transition-shadow duration-300',
          scrolled ? 'border-ember-900/60 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.6)]' : 'border-transparent',
        )}
      >
        <div className="container-page">
          <div className="flex h-16 items-center gap-3 lg:h-[4.5rem]">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Menü öffnen"
              aria-expanded={mobileOpen}
              className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md text-steel-200 transition-colors hover:bg-white/8 hover:text-steel-50 lg:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>

            <Link href="/" className="shrink-0 rounded-xs" aria-label="Räucherhaken24 – zur Startseite">
              <Logo className="h-7 w-auto text-steel-50 lg:h-8" />
            </Link>

            <nav aria-label="Hauptnavigation" className="ml-6 hidden lg:block">
              <ul className="flex items-center gap-0.5">
                {CATALOG_NAV.map((group) => (
                  <li key={group.href} className="relative">
                    {group.children ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setOpenGroup(openGroup === group.href ? null : group.href)}
                          onMouseEnter={() => setOpenGroup(group.href)}
                          aria-expanded={openGroup === group.href}
                          className={cn(
                            'flex h-10 items-center gap-1 rounded-md border-b-2 px-3 text-sm font-medium transition-colors',
                            pathname.startsWith(group.href)
                              ? 'border-ember-500 text-ember-400'
                              : 'border-transparent text-steel-200 hover:text-steel-50',
                          )}
                        >
                          {group.label}
                          <ChevronDown
                            className={cn('size-3.5 transition-transform duration-200', openGroup === group.href && 'rotate-180')}
                            aria-hidden="true"
                          />
                        </button>
                        {openGroup === group.href && (
                          <div
                            onMouseLeave={() => setOpenGroup(null)}
                            className="animate-scale-in absolute top-full left-0 z-10 mt-1 w-72 origin-top-left rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-overlay)]"
                          >
                            {group.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                className="block rounded-md px-3 py-2.5 transition-colors hover:bg-paper-sunken"
                              >
                                <span className="block text-sm font-medium text-ink">{child.label}</span>
                                {child.description && (
                                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                                    {child.description}
                                  </span>
                                )}
                              </Link>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <Link
                        href={group.href}
                        className={cn(
                          'flex h-10 items-center rounded-md border-b-2 px-3 text-sm font-medium transition-colors',
                          pathname.startsWith(group.href)
                            ? 'border-ember-500 text-ember-400'
                            : 'border-transparent text-steel-200 hover:text-steel-50',
                        )}
                      >
                        {group.label}
                      </Link>
                    )}
                  </li>
                ))}
                {CONTENT_NAV.map((group) => (
                  <li key={group.href}>
                    <Link
                      href={group.href}
                      className={cn(
                        'flex h-10 items-center rounded-md border-b-2 px-3 text-sm font-medium transition-colors',
                        pathname.startsWith(group.href)
                          ? 'border-ember-500 text-ember-400'
                          : 'border-transparent text-steel-200 hover:text-steel-50',
                      )}
                    >
                      {group.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden h-10 items-center gap-2 rounded-full border border-white/12 bg-white/6 pr-2 pl-3.5 text-sm text-steel-300 transition-colors hover:border-ember-500/50 hover:text-steel-50 md:flex"
              >
                <Search className="size-4" aria-hidden="true" />
                <span className="w-32 text-left lg:w-40">Suchen …</span>
                <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-sans text-2xs text-steel-300">
                  ⌘K
                </kbd>
              </button>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Suche öffnen"
                className="flex size-11 items-center justify-center rounded-md text-steel-200 transition-colors hover:bg-white/8 hover:text-steel-50 md:hidden"
              >
                <Search className="size-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={openCart}
                aria-label={itemCount > 0 ? `Warenkorb öffnen, ${itemCount} Artikel` : 'Warenkorb öffnen'}
                className="relative flex size-11 items-center justify-center rounded-md text-steel-200 transition-colors hover:bg-white/8 hover:text-steel-50"
              >
                <ShoppingBag className="size-5" aria-hidden="true" />
                {itemCount > 0 && (
                  <span className="tabular absolute top-1.5 right-1 flex min-w-4.5 items-center justify-center rounded-full bg-ember-500 px-1 text-[0.625rem] leading-4.5 font-semibold text-white shadow-[0_0_0_2px_var(--color-steel-900)]">
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
        <span className="scale-divider" aria-hidden="true" />
      </header>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MobilePanel open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  )
}

/** Vollflaechiges Navigationspanel fuer schmale Bildschirme. */
function MobilePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="animate-fade-in absolute inset-0 bg-steel-900/45" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="animate-slide-in-right absolute inset-y-0 right-0 flex w-[min(22rem,88vw)] flex-col bg-[var(--surface-raised)] shadow-[var(--shadow-overlay)]"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4">
          <Logo className="h-7 w-auto" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Menü schließen"
            autoFocus
            className="flex size-11 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper-sunken"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-label="Hauptnavigation">
          <p className="px-1 pb-2 text-2xs font-semibold tracking-wider text-ink-faint uppercase">Sortiment</p>
          <ul className="space-y-0.5">
            {CATALOG_NAV.map((group) => (
              <li key={group.href}>
                <Link
                  href={group.href}
                  className="block rounded-md px-3 py-3 text-base font-medium text-ink transition-colors hover:bg-paper-sunken"
                >
                  {group.label}
                </Link>
                {group.children && (
                  <ul className="mt-0.5 mb-1 ml-3 space-y-0.5 border-l border-[var(--border-subtle)] pl-3">
                    {group.children.slice(1).map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className="block rounded-md px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-6 px-1 pb-2 text-2xs font-semibold tracking-wider text-ink-faint uppercase">Beratung</p>
          <ul className="space-y-0.5">
            {CONTENT_NAV.map((group) => (
              <li key={group.href}>
                <Link
                  href={group.href}
                  className="block rounded-md px-3 py-3 text-base font-medium text-ink transition-colors hover:bg-paper-sunken"
                >
                  {group.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 px-1 pb-2 text-2xs font-semibold tracking-wider text-ink-faint uppercase">Service</p>
          <ul className="space-y-0.5">
            {SERVICE_NAV.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-md px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
