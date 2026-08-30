import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  LifeBuoy,
  Package,
  Ruler,
  ShoppingCart,
  UserPlus,
} from 'lucide-react'
import { requirePermission } from '@/lib/server/auth'
import { getDashboardData, type PeriodComparison } from '@/lib/server/analytics'
import { formatPrice, formatNumber } from '@/lib/money'
import { formatDate, formatRelative } from '@/lib/utils/text'
import { RevenueChart } from '@/components/admin/revenue-chart'
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/admin/status-badges'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Verwaltungs-Dashboard.
 *
 * Aufbau nach Dringlichkeit: erst Zahlen, die eine Entscheidung erfordern
 * (offene Vorgänge, niedrige Bestände), dann die Umsatzentwicklung.
 */
export default async function AdminDashboard() {
  await requirePermission('dashboard:view')
  const data = await getDashboardData()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Stand {formatDate(new Date())} · Umsätze ohne Stornierungen und abzüglich Erstattungen
        </p>
      </div>

      {/* Offene Vorgänge zuerst — das ist die Arbeit von heute. */}
      <section aria-labelledby="vorgaenge">
        <h2 id="vorgaenge" className="sr-only">
          Offene Vorgänge
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <TaskTile
            href="/admin/bestellungen?status=offen"
            icon={<ShoppingCart className="size-4.5" aria-hidden="true" />}
            label="Offene Bestellungen"
            value={data.openOrders}
            urgent={data.openOrders > 0}
          />
          <TaskTile
            href="/admin/bestellungen?zahlung=pending"
            icon={<CreditCard className="size-4.5" aria-hidden="true" />}
            label="Zahlung ausstehend"
            value={data.unpaidOrders}
          />
          <TaskTile
            href="/admin/support?status=new"
            icon={<LifeBuoy className="size-4.5" aria-hidden="true" />}
            label="Neue Supportanfragen"
            value={data.newSupportRequests}
            urgent={data.newSupportRequests > 0}
          />
          <TaskTile
            href="/admin/projekte?status=new"
            icon={<Ruler className="size-4.5" aria-hidden="true" />}
            label="Neue Sonderanfragen"
            value={data.newProjects}
            urgent={data.newProjects > 0}
          />
          <TaskTile
            href="/admin/kunden"
            icon={<UserPlus className="size-4.5" aria-hidden="true" />}
            label="Neukunden (30 Tage)"
            value={data.newCustomers30d}
          />
        </ul>
      </section>

      {/* Umsatz */}
      <section aria-labelledby="umsatz" className="space-y-4">
        <h2 id="umsatz" className="font-display text-lg font-semibold">
          Umsatzentwicklung
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <RevenueTile label="Heute" comparison={data.today} previousLabel="gestern" />
          <RevenueTile label="Letzte 7 Tage" comparison={data.last7Days} previousLabel="der Vorwoche" />
          <RevenueTile label="Letzte 30 Tage" comparison={data.last30Days} previousLabel="der Vorperiode" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle as="h3">Umsatz der letzten 30 Tage</CardTitle>
          </CardHeader>
          <CardBody>
            <RevenueChart points={data.chart} />
          </CardBody>
        </Card>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Aktuelle Bestellungen */}
        <Card>
          <CardHeader>
            <CardTitle as="h2">Aktuelle Bestellungen</CardTitle>
            <Link
              href="/admin/bestellungen"
              className="flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-[var(--accent)]"
            >
              Alle ansehen
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          {data.recentOrders.length === 0 ? (
            <CardBody>
              <EmptyState
                compact
                icon={<ShoppingCart className="size-5" aria-hidden="true" />}
                title="Noch keine Bestellungen"
                description="Sobald die erste Bestellung eingeht, erscheint sie hier."
              />
            </CardBody>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {data.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/bestellungen/${order.orderNumber}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-paper-sunken/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-sm font-semibold">{order.orderNumber}</span>
                        <OrderStatusBadge status={order.status} />
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
                        {order.company ?? `${order.firstName} ${order.lastName}`} ·{' '}
                        {order.itemCount} {order.itemCount === 1 ? 'Position' : 'Positionen'} ·{' '}
                        {formatRelative(order.createdAt)}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {formatPrice(order.totalCents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          {/* Niedrige Bestände */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Niedrige Bestände</CardTitle>
              <Link
                href="/admin/lager?filter=niedrig"
                className="flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-[var(--accent)]"
              >
                Lager öffnen
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </CardHeader>
            {data.lowStock.length === 0 ? (
              <CardBody>
                <EmptyState
                  compact
                  icon={<Package className="size-5" aria-hidden="true" />}
                  title="Alle Bestände über der Meldegrenze"
                  description="Es besteht derzeit kein Nachbestellbedarf."
                />
              </CardBody>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {data.lowStock.map((product) => (
                  <li key={product.id} className="flex items-center gap-3 px-5 py-3">
                    <AlertTriangle
                      className={cn(
                        'size-4 shrink-0',
                        product.stock === 0 ? 'text-danger-500' : 'text-warning-500',
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/admin/produkte/${product.id}`}
                        className="block truncate text-sm font-medium hover:text-[var(--accent)]"
                      >
                        {product.name}
                      </Link>
                      <span className="tabular block text-xs text-ink-faint">{product.sku}</span>
                    </span>
                    <span
                      className={cn(
                        'tabular shrink-0 text-sm font-semibold',
                        product.stock === 0 ? 'text-danger-700' : 'text-warning-700',
                      )}
                    >
                      {product.stock} / {product.lowStockThreshold}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Bestseller */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Meistverkauft (30 Tage)</CardTitle>
            </CardHeader>
            {data.bestsellers.length === 0 ? (
              <CardBody>
                <EmptyState
                  compact
                  icon={<Package className="size-5" aria-hidden="true" />}
                  title="Noch keine Verkaufsdaten"
                  description="Die Auswertung erscheint, sobald Bestellungen vorliegen."
                />
              </CardBody>
            ) : (
              <ol className="divide-y divide-[var(--border-subtle)]">
                {data.bestsellers.map((item, index) => (
                  <li key={`${item.productId}-${index}`} className="flex items-center gap-3 px-5 py-3">
                    <span className="tabular flex size-6 shrink-0 items-center justify-center rounded bg-paper-sunken text-xs font-semibold text-ink-muted">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.slug ? (
                        <Link href={`/produkt/${item.slug}`} className="hover:text-[var(--accent)]">
                          {item.name}
                        </Link>
                      ) : (
                        item.name
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block text-sm font-semibold">
                        {formatNumber(item.quantity)} Stk.
                      </span>
                      <span className="tabular block text-xs text-ink-faint">
                        {formatPrice(item.revenueCents)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function TaskTile({
  href,
  icon,
  label,
  value,
  urgent = false,
}: {
  href: string
  icon: React.ReactNode
  label: string
  value: number
  urgent?: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          'flex h-full items-center gap-3 rounded-xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]',
          urgent && value > 0
            ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
            : 'border-[var(--border-subtle)] bg-[var(--surface-raised)]',
        )}
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            urgent && value > 0 ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'bg-paper-sunken text-ink-muted',
          )}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="tabular block text-xl font-semibold">{formatNumber(value)}</span>
          <span className="block text-xs leading-snug text-ink-muted">{label}</span>
        </span>
      </Link>
    </li>
  )
}

function RevenueTile({
  label,
  comparison,
  previousLabel,
}: {
  label: string
  comparison: PeriodComparison
  previousLabel: string
}) {
  const change = comparison.changePercent
  const positive = change !== null && change >= 0

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="tabular mt-1.5 font-display text-2xl font-semibold">
        {formatPrice(comparison.currentCents)}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {change === null ? (
          // Bewusst ohne Zeitangabe: "aus der gestern" waere falsch, und eine
          // Fallunterscheidung nur fuer diesen Satz lohnt nicht.
          <span className="text-ink-faint">Kein Vergleichswert vorhanden</span>
        ) : (
          <>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                positive ? 'text-success-700' : 'text-danger-700',
              )}
            >
              {positive ? (
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="size-3.5" aria-hidden="true" />
              )}
              {Math.abs(change).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
            </span>
            <span className="text-ink-faint">
              gegenüber {previousLabel} ({formatPrice(comparison.previousCents)})
            </span>
          </>
        )}
      </p>
      <p className="tabular mt-2 border-t border-[var(--border-subtle)] pt-2 text-xs text-ink-muted">
        {formatNumber(comparison.currentOrders)}{' '}
        {comparison.currentOrders === 1 ? 'Bestellung' : 'Bestellungen'}
      </p>
    </div>
  )
}
