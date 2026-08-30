'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BadgePercent,
  Boxes,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Palette,
  Ruler,
  ScrollText,
  ShoppingCart,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { cn } from '@/lib/utils/cn'
import { initials } from '@/lib/utils/text'
import type { PermissionKey } from '@/lib/server/permissions'
import type { AuthUser } from '@/lib/server/auth'
import { Logo } from '@/components/layout/logo'

/**
 * Rahmen des Verwaltungsbereichs: Seitennavigation, Kopfleiste, Abmeldung.
 *
 * Die Navigation blendet Punkte aus, für die die Berechtigung fehlt. Das ist
 * reine Bedienerfreundlichkeit — die eigentliche Absicherung erfolgt in jeder
 * Route und jeder API serverseitig.
 */

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  permission: PermissionKey
  exact?: boolean
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Überblick',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view', exact: true },
    ],
  },
  {
    group: 'Verkauf',
    items: [
      { href: '/admin/bestellungen', label: 'Bestellungen', icon: ShoppingCart, permission: 'orders:read' },
      { href: '/admin/kunden', label: 'Kunden', icon: Users, permission: 'customers:read' },
      { href: '/admin/gutscheine', label: 'Gutscheine', icon: BadgePercent, permission: 'coupons:read' },
    ],
  },
  {
    group: 'Sortiment',
    items: [
      { href: '/admin/produkte', label: 'Produkte', icon: Package, permission: 'products:read' },
      { href: '/admin/lager', label: 'Lager', icon: Boxes, permission: 'inventory:read' },
    ],
  },
  {
    group: 'Anfragen',
    items: [
      { href: '/admin/support', label: 'Support', icon: LifeBuoy, permission: 'support:read' },
      { href: '/admin/projekte', label: 'Sonderanfertigungen', icon: Ruler, permission: 'projects:read' },
      { href: '/admin/bewertungen', label: 'Bewertungen', icon: MessageSquare, permission: 'content:write' },
    ],
  },
  {
    group: 'Betrieb',
    items: [
      { href: '/admin/saison', label: 'Saison & Banner', icon: Palette, permission: 'marketing:write' },
      { href: '/admin/mitarbeiter', label: 'Mitarbeitende', icon: UsersRound, permission: 'users:read' },
      { href: '/admin/protokoll', label: 'Protokoll', icon: ScrollText, permission: 'audit:read' },
    ],
  },
]

export function AdminShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => setMobileOpen(false), [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  async function logout() {
    setLoggingOut(true)
    const result = await apiRequest<{ redirectTo: string }>('/api/admin/auth', { method: 'DELETE' })
    router.push(result.ok ? result.data.redirectTo : '/admin/anmelden')
    router.refresh()
  }

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => user.permissions.includes(item.permission)),
  })).filter((group) => group.items.length > 0)

  const nav = (
    <nav aria-label="Verwaltungsnavigation" className="flex-1 space-y-6 px-3 py-4">
      {groups.map((group) => (
        <div key={group.group}>
          <p className="px-3 pb-1.5 text-2xs font-semibold tracking-wider text-steel-400 uppercase">
            {group.group}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      active ? 'bg-steel-700 text-white' : 'text-steel-300 hover:bg-steel-800 hover:text-white',
                    )}
                  >
                    <Icon className="size-4.5 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )

  const sidebarFooter = (
    <div className="border-t border-steel-700 p-3">
      <Link
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className="mb-1 flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-steel-300 transition-colors hover:bg-steel-800 hover:text-white"
      >
        <ExternalLink className="size-4.5 shrink-0" aria-hidden="true" />
        Shop ansehen
      </Link>
      <div className="flex items-center gap-2.5 rounded-md px-3 py-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-steel-700 text-2xs font-semibold text-steel-100"
        >
          {initials(user.firstName, user.lastName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-steel-100">
            {user.firstName} {user.lastName}
          </span>
          <span className="block truncate text-xs text-steel-400">{user.roleName}</span>
        </span>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={loggingOut}
          aria-label="Abmelden"
          title="Abmelden"
          className="shrink-0 rounded-md p-2 text-steel-400 transition-colors hover:bg-steel-800 hover:text-white disabled:opacity-50"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh bg-paper-sunken">
      {/* Seitennavigation ab Desktop */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-steel-900 lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Link href="/admin">
            <Logo className="h-6 w-auto text-steel-50" />
          </Link>
        </div>
        <div className="scroll-area min-h-0 flex-1 overflow-y-auto">{nav}</div>
        {sidebarFooter}
      </aside>

      {/* Panel auf schmalen Bildschirmen */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-steel-900/60" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Verwaltungsnavigation"
            className="animate-slide-in-right absolute inset-y-0 right-0 flex w-[min(17rem,86vw)] flex-col bg-steel-900"
          >
            <div className="flex h-16 shrink-0 items-center justify-between px-5">
              <Logo className="h-6 w-auto text-steel-50" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Navigation schließen"
                autoFocus
                className="rounded-md p-2 text-steel-300 hover:bg-steel-800 hover:text-white"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="scroll-area min-h-0 flex-1 overflow-y-auto">{nav}</div>
            {sidebarFooter}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-page)]/92 px-4 backdrop-blur-md lg:hidden">
          <Logo className="h-6 w-auto" />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Navigation öffnen"
            className="ml-auto flex size-11 items-center justify-center rounded-md text-ink-soft hover:bg-paper-sunken"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
