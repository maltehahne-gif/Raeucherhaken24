import type { Metadata } from 'next'
import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { prisma, type Prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber, formatPrice } from '@/lib/money'
import { formatDate } from '@/lib/utils/text'
import {
  ORDER_OPEN_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
} from '@/lib/domain/enums'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/page-header'
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/admin/status-badges'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Bestellungen', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

/** Zeitraumfilter: Beschriftung und Tageszahl an einer Stelle. */
const PERIODS = [
  { value: '7', label: 'Letzte 7 Tage', days: 7 },
  { value: '30', label: 'Letzte 30 Tage', days: 30 },
  { value: '90', label: 'Letzte 90 Tage', days: 90 },
] as const

type SortKey = 'datum' | 'summe'
type SortDirection = 'asc' | 'desc'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export default async function OrdersPage({ searchParams }: PageProps) {
  await requirePermission('orders:read')
  const sp = await searchParams

  // --- Filterzustand aus der URL lesen und gegen erlaubte Werte pruefen ----
  const query = single(sp.q).slice(0, 80)

  const statusRaw = single(sp.status)
  const status =
    statusRaw === 'offen' || (ORDER_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : ''

  const paymentRaw = single(sp.zahlung)
  const payment = (PAYMENT_STATUSES as readonly string[]).includes(paymentRaw) ? paymentRaw : ''

  const periodRaw = single(sp.zeitraum)
  const period = PERIODS.find((p) => p.value === periodRaw)?.value ?? ''

  const sortRaw = single(sp.sortieren)
  const sort: SortKey = sortRaw === 'summe' ? 'summe' : 'datum'
  const direction: SortDirection = single(sp.richtung) === 'asc' ? 'asc' : 'desc'

  const pageRaw = Number.parseInt(single(sp.seite), 10)
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1

  // --- Abfrage -------------------------------------------------------------
  const where: Prisma.OrderWhereInput = {}

  if (query.length > 0) {
    where.OR = [
      { orderNumber: { contains: query } },
      { firstName: { contains: query } },
      { lastName: { contains: query } },
      { company: { contains: query } },
      { email: { contains: query } },
    ]
  }
  if (status === 'offen') where.status = { in: [...ORDER_OPEN_STATUSES] }
  else if (status.length > 0) where.status = status

  if (payment.length > 0) where.paymentStatus = payment

  const periodDays = PERIODS.find((p) => p.value === period)?.days
  if (periodDays) {
    where.createdAt = { gte: new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000) }
  }

  const summary = await prisma.order.aggregate({
    where,
    _count: { _all: true },
    _sum: { totalCents: true },
  })

  const filteredCount = summary._count._all
  const filteredSumCents = summary._sum.totalCents ?? 0
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)

  const orders = await prisma.order.findMany({
    where,
    orderBy: sort === 'summe' ? { totalCents: direction } : { createdAt: direction },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      firstName: true,
      lastName: true,
      company: true,
      email: true,
      totalCents: true,
      status: true,
      paymentStatus: true,
      _count: { select: { items: true } },
    },
  })

  const hasFilters =
    query.length > 0 || status.length > 0 || payment.length > 0 || period.length > 0
  // Nur laden, wenn die gefilterte Liste leer ist — sonst ist die Zusatzabfrage
  // reine Last ohne Nutzen.
  const totalOrders = filteredCount === 0 && hasFilters ? await prisma.order.count() : filteredCount

  // --- URL-Bau fuer Sortierung und Seitenwechsel ---------------------------
  function buildHref(overrides: Record<string, string | number | undefined>): string {
    const params = new URLSearchParams()
    const values: Record<string, string> = {
      q: query,
      status,
      zahlung: payment,
      zeitraum: period,
      sortieren: sort === 'datum' ? '' : sort,
      richtung: direction === 'desc' ? '' : direction,
      seite: page > 1 ? String(page) : '',
    }
    for (const [key, value] of Object.entries(overrides)) {
      values[key] = value === undefined ? '' : String(value)
    }
    for (const [key, value] of Object.entries(values)) {
      if (value.length > 0) params.set(key, value)
    }
    const search = params.toString()
    return search.length > 0 ? `/admin/bestellungen?${search}` : '/admin/bestellungen'
  }

  function sortHref(key: SortKey): string {
    // Erneuter Klick auf die aktive Spalte dreht die Richtung um.
    const nextDirection: SortDirection = sort === key && direction === 'desc' ? 'asc' : 'desc'
    return buildHref({
      sortieren: key === 'datum' ? '' : key,
      richtung: nextDirection === 'desc' ? '' : nextDirection,
      seite: '',
    })
  }

  return (
    <div>
      <AdminPageHeader
        title="Bestellungen"
        description="Alle eingegangenen Bestellungen mit Bearbeitungs- und Zahlungsstand. Wählen Sie eine Zeile für Positionen, Versand und Statuswechsel."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
          <p className="text-xs font-medium text-ink-muted">Bestellungen in dieser Auswahl</p>
          <p className="tabular mt-1 font-display text-2xl font-semibold">
            {formatNumber(filteredCount)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
          <p className="text-xs font-medium text-ink-muted">Summe dieser Auswahl</p>
          <p className="tabular mt-1 font-display text-2xl font-semibold">
            {formatPrice(filteredSumCents)}
          </p>
          <p className="mt-1 text-xs text-ink-faint">Bruttobeträge inklusive Versand</p>
        </div>
      </div>

      <AdminFilterBar
        searchPlaceholder="Bestellnummer, Name oder E-Mail …"
        selects={[
          {
            name: 'status',
            label: 'Bearbeitungsstatus',
            allLabel: 'Status: alle',
            options: [
              { value: 'offen', label: 'Nur offene Bestellungen' },
              ...ORDER_STATUSES.map((value) => ({ value, label: ORDER_STATUS_LABELS[value] })),
            ],
          },
          {
            name: 'zahlung',
            label: 'Zahlungsstatus',
            allLabel: 'Zahlung: alle',
            options: PAYMENT_STATUSES.map((value) => ({ value, label: PAYMENT_STATUS_LABELS[value] })),
          },
          {
            name: 'zeitraum',
            label: 'Zeitraum',
            allLabel: 'Zeitraum: gesamt',
            options: PERIODS.map((p) => ({ value: p.value, label: p.label })),
          },
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="size-5" aria-hidden="true" />}
          title={totalOrders === 0 ? 'Noch keine Bestellungen' : 'Keine Bestellung passt zur Auswahl'}
          description={
            totalOrders === 0
              ? 'Sobald die erste Bestellung im Shop eingeht, erscheint sie an dieser Stelle.'
              : 'Ändern Sie die Suche oder setzen Sie die Filter zurück, um wieder alle Bestellungen zu sehen.'
          }
          action={
            totalOrders === 0
              ? undefined
              : { label: 'Filter zurücksetzen', href: '/admin/bestellungen' }
          }
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Bestellnummer</Th>
                  <SortableTh
                    label="Datum"
                    href={sortHref('datum')}
                    active={sort === 'datum'}
                    direction={direction}
                  />
                  <Th>Kunde</Th>
                  <Th align="right">Positionen</Th>
                  <SortableTh
                    label="Summe"
                    href={sortHref('summe')}
                    active={sort === 'summe'}
                    direction={direction}
                    align="right"
                  />
                  <Th>Bearbeitung</Th>
                  <Th>Zahlung</Th>
                </tr>
              </Thead>
              <Tbody>
                {orders.map((order) => (
                  <Tr key={order.id} className="group relative">
                    <Td className="font-semibold text-ink">
                      {/* Der Link spannt sich über die gesamte Zeile, bleibt im
                          DOM aber ein einzelner, benannter Link. */}
                      <Link
                        href={`/admin/bestellungen/${order.orderNumber}`}
                        className="tabular rounded-xs after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--accent)]"
                      >
                        {order.orderNumber}
                      </Link>
                    </Td>
                    <Td className="tabular whitespace-nowrap">{formatDate(order.createdAt)}</Td>
                    <Td>
                      <span className="block max-w-[16rem] truncate font-medium text-ink">
                        {order.company ?? `${order.firstName} ${order.lastName}`}
                      </span>
                      <span className="block max-w-[16rem] truncate text-xs text-ink-faint">
                        {order.company ? `${order.firstName} ${order.lastName} · ` : ''}
                        {order.email}
                      </span>
                    </Td>
                    <Td align="right" className="tabular">
                      {formatNumber(order._count.items)}
                    </Td>
                    <Td align="right" className="tabular font-semibold text-ink whitespace-nowrap">
                      {formatPrice(order.totalCents)}
                    </Td>
                    <Td>
                      <OrderStatusBadge status={order.status} />
                    </Td>
                    <Td>
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>

          <p className="mt-4 text-center text-xs text-ink-faint">
            Seite {formatNumber(page)} von {formatNumber(totalPages)} · Einträge{' '}
            {formatNumber((page - 1) * PAGE_SIZE + 1)} bis{' '}
            {formatNumber(Math.min(page * PAGE_SIZE, filteredCount))}
          </p>

          <Pagination
            page={page}
            totalPages={totalPages}
            buildHref={(target) => buildHref({ seite: target > 1 ? target : '' })}
            className="mt-3"
          />
        </>
      )}
    </div>
  )
}
