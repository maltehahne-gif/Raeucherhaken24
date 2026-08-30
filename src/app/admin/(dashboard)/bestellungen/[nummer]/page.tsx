import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber, formatPrice } from '@/lib/money'
import { formatDateTime } from '@/lib/utils/text'
import {
  CARRIER_LABELS,
  CARRIER_TRACKING_URLS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type Carrier,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '@/lib/domain/enums'
import { AdminPageHeader } from '@/components/admin/page-header'
import { OrderActions } from '@/components/admin/order-actions'
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/admin/status-badges'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ nummer: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { nummer } = await params
  return {
    title: `Bestellung ${decodeURIComponent(nummer)}`,
    robots: { index: false, follow: false },
  }
}

const regionNames = new Intl.DisplayNames(['de'], { type: 'region' })

/** Ländercode in eine deutsche Bezeichnung; unbekannte Codes bleiben stehen. */
function countryLabel(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export default async function OrderDetailPage({ params }: PageProps) {
  const session = await requirePermission('orders:read')
  const { nummer } = await params

  const order = await prisma.order.findUnique({
    where: { orderNumber: decodeURIComponent(nummer) },
    include: {
      items: { orderBy: { id: 'asc' } },
      statusHistory: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      customer: {
        select: {
          id: true,
          customerNumber: true,
          email: true,
          firstName: true,
          lastName: true,
          company: true,
          phone: true,
          orderCount: true,
          totalSpentCents: true,
        },
      },
      redemption: { include: { coupon: { select: { code: true, description: true } } } },
    },
  })

  if (!order) notFound()

  const permissions = session.user.permissions
  const status = order.status as OrderStatus
  const paymentStatus = order.paymentStatus as PaymentStatus
  const carrier = order.carrier as Carrier | null
  const trackingUrl =
    carrier && order.trackingNumber
      ? CARRIER_TRACKING_URLS[carrier]?.replace('{tracking}', encodeURIComponent(order.trackingNumber))
      : undefined

  const itemQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div>
      <AdminPageHeader
        backHref="/admin/bestellungen"
        backLabel="Zurück zur Bestellübersicht"
        title={`Bestellung ${order.orderNumber}`}
        description={`Eingegangen am ${formatDateTime(order.createdAt)} · ${
          PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod
        }`}
        actions={
          <div className="text-right">
            <p className="tabular font-display text-2xl font-semibold">{formatPrice(order.totalCents)}</p>
            <p className="text-xs text-ink-faint">
              {formatNumber(order.items.length)}{' '}
              {order.items.length === 1 ? 'Position' : 'Positionen'} · {formatNumber(itemQuantity)} Stück
            </p>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={order.status} />
        <PaymentStatusBadge status={order.paymentStatus} />
        {order.couponCode && <Badge tone="info">Gutschein {order.couponCode}</Badge>}
        {order.refundedCents > 0 && (
          <Badge tone="warning">Erstattet {formatPrice(order.refundedCents)}</Badge>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Positionen */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Positionen</CardTitle>
            </CardHeader>
            <TableWrap className="rounded-none border-0">
              <Table className="min-w-[38rem]">
                <Thead>
                  <tr>
                    <Th>Artikel</Th>
                    <Th align="right">Menge</Th>
                    <Th align="right">Stückpreis</Th>
                    <Th align="right">Zeilensumme</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {order.items.map((item) => (
                    <Tr key={item.id}>
                      <Td>
                        <span className="block font-medium text-ink">{item.name}</span>
                        <span className="tabular block text-xs text-ink-faint">
                          Art.-Nr. {item.articleNumber} · SKU {item.sku}
                        </span>
                        {item.configSummary && (
                          <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                            {item.configSummary}
                          </span>
                        )}
                        {item.restockedQty > 0 && (
                          <span className="mt-1 block text-xs font-medium text-warning-700">
                            {formatNumber(item.restockedQty)} Stück zurück ins Lager gebucht
                          </span>
                        )}
                      </Td>
                      <Td align="right" className="tabular">
                        {formatNumber(item.quantity)}
                      </Td>
                      <Td align="right" className="tabular whitespace-nowrap">
                        {formatPrice(item.unitPriceCents)}
                        {item.listPriceCents > item.unitPriceCents && (
                          <span className="block text-xs text-ink-faint line-through">
                            {formatPrice(item.listPriceCents)}
                          </span>
                        )}
                      </Td>
                      <Td align="right" className="tabular font-semibold text-ink whitespace-nowrap">
                        {formatPrice(item.lineTotalCents)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>

            {/* Summenblock */}
            <CardBody className="border-t border-[var(--border-subtle)]">
              <dl className="ml-auto w-full max-w-sm space-y-2 text-sm">
                <SumRow label="Zwischensumme" value={formatPrice(order.subtotalCents)} />
                {order.discountCents > 0 && (
                  <SumRow
                    label={order.couponCode ? `Rabatt (Gutschein ${order.couponCode})` : 'Rabatt'}
                    value={`− ${formatPrice(order.discountCents)}`}
                    tone="success"
                  />
                )}
                <SumRow
                  label="Versand"
                  value={order.shippingCents === 0 ? 'Versandkostenfrei' : formatPrice(order.shippingCents)}
                />
                <div className="flex items-baseline justify-between gap-4 border-t border-[var(--border-subtle)] pt-2.5">
                  <dt className="font-display text-base font-semibold">Gesamt</dt>
                  <dd className="tabular font-display text-lg font-semibold">
                    {formatPrice(order.totalCents)}
                  </dd>
                </div>
                <SumRow label="darin enthaltene Umsatzsteuer" value={formatPrice(order.taxCents)} muted />
                {order.refundedCents > 0 && (
                  <SumRow label="bereits erstattet" value={formatPrice(order.refundedCents)} tone="warning" />
                )}
              </dl>
            </CardBody>
          </Card>

          {/* Lieferadresse und Hinweis */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Lieferadresse und Hinweis</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
                  Lieferadresse
                </h3>
                <address className="mt-2 text-sm leading-relaxed text-ink-soft not-italic">
                  {order.company && <span className="block font-medium text-ink">{order.company}</span>}
                  <span className="block">
                    {order.firstName} {order.lastName}
                  </span>
                  <span className="block">{order.street}</span>
                  <span className="block">
                    {order.postalCode} {order.city}
                  </span>
                  <span className="block">{countryLabel(order.country)}</span>
                </address>
                <p className="mt-3 text-sm text-ink-soft">
                  <a href={`mailto:${order.email}`} className="hover:text-[var(--accent)]">
                    {order.email}
                  </a>
                  {order.phone && (
                    <>
                      <br />
                      <a href={`tel:${order.phone.replace(/\s/g, '')}`} className="hover:text-[var(--accent)]">
                        {order.phone}
                      </a>
                    </>
                  )}
                </p>
              </div>
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">
                  Bestellhinweis des Kunden
                </h3>
                {order.note ? (
                  <p className="mt-2 rounded-lg bg-paper-sunken px-3.5 py-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                    {order.note}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-ink-faint">Kein Hinweis hinterlegt.</p>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Statushistorie */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Statushistorie</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="space-y-4">
                {order.statusHistory.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--accent)]"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        <span className="font-medium">
                          {entry.field === 'payment' ? 'Zahlung' : 'Bearbeitung'}:
                        </span>{' '}
                        {entry.fromValue && (
                          <>
                            <span className="text-ink-muted">{labelFor(entry.field, entry.fromValue)}</span>
                            <span aria-hidden="true" className="text-ink-faint">
                              {' → '}
                            </span>
                            <span className="sr-only">geändert zu</span>
                          </>
                        )}
                        <span className="font-medium">{labelFor(entry.field, entry.toValue)}</span>
                      </p>
                      <p className="tabular mt-0.5 text-xs text-ink-faint">
                        {formatDateTime(entry.createdAt)} ·{' '}
                        {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'System'}
                      </p>
                      {entry.note && (
                        <p className="mt-1.5 rounded-md bg-paper-sunken px-3 py-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                          {entry.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        {/* Seitenspalte */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Kunde</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              {order.customer ? (
                <>
                  <p className="font-medium text-ink">
                    {permissions.includes('customers:read') ? (
                      <Link
                        href={`/admin/kunden/${order.customer.id}`}
                        className="inline-flex items-center gap-1 hover:text-[var(--accent)]"
                      >
                        {order.customer.company ??
                          `${order.customer.firstName} ${order.customer.lastName}`}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </Link>
                    ) : (
                      (order.customer.company ??
                      `${order.customer.firstName} ${order.customer.lastName}`)
                    )}
                  </p>
                  <p className="tabular text-xs text-ink-faint">
                    Kundennummer {order.customer.customerNumber}
                  </p>
                  <p className="text-ink-soft">{order.customer.email}</p>
                  {order.customer.phone && <p className="text-ink-soft">{order.customer.phone}</p>}
                  <p className="tabular border-t border-[var(--border-subtle)] pt-2 text-xs text-ink-muted">
                    {formatNumber(order.customer.orderCount)}{' '}
                    {order.customer.orderCount === 1 ? 'Bestellung' : 'Bestellungen'} ·{' '}
                    {formatPrice(order.customer.totalSpentCents)} Umsatz
                  </p>
                </>
              ) : (
                <p className="text-ink-muted">
                  Zu dieser Bestellung ist keine Kundenakte verknüpft. Die Kontaktdaten der Bestellung
                  bleiben davon unberührt.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Versand</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              {carrier ? (
                <p className="text-ink-soft">
                  Dienstleister:{' '}
                  <span className="font-medium text-ink">{CARRIER_LABELS[carrier] ?? carrier}</span>
                </p>
              ) : (
                <p className="text-ink-muted">Noch kein Versanddienstleister hinterlegt.</p>
              )}
              {order.trackingNumber && (
                <p className="text-ink-soft">
                  Sendungsnummer: <span className="tabular font-medium text-ink">{order.trackingNumber}</span>
                  {trackingUrl && (
                    <>
                      {' '}
                      <a
                        href={trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                      >
                        Sendung verfolgen
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    </>
                  )}
                </p>
              )}
              <dl className="tabular space-y-1 border-t border-[var(--border-subtle)] pt-2 text-xs text-ink-muted">
                <DateRow label="Versendet" value={order.shippedAt} />
                <DateRow label="Zugestellt" value={order.deliveredAt} />
                <DateRow label="Storniert" value={order.cancelledAt} />
                <DateRow label="Zuletzt geändert" value={order.updatedAt} />
              </dl>
            </CardBody>
          </Card>

          <OrderActions
            orderId={order.id}
            orderNumber={order.orderNumber}
            status={status}
            paymentStatus={paymentStatus}
            totalCents={order.totalCents}
            refundedCents={order.refundedCents}
            carrier={order.carrier}
            trackingNumber={order.trackingNumber}
            couponCode={order.couponCode}
            canWrite={permissions.includes('orders:write')}
            canCancel={permissions.includes('orders:cancel')}
            canRefund={permissions.includes('orders:refund')}
          />
        </div>
      </div>
    </div>
  )
}

/** Historieneinträge tragen je nach Feld Bestell- oder Zahlungsstati. */
function labelFor(field: string, value: string): string {
  if (field === 'payment') return PAYMENT_STATUS_LABELS[value as PaymentStatus] ?? value
  return ORDER_STATUS_LABELS[value as OrderStatus] ?? value
}

function SumRow({
  label,
  value,
  tone,
  muted = false,
}: {
  label: string
  value: string
  tone?: 'success' | 'warning'
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={muted ? 'text-xs text-ink-muted' : 'text-ink-soft'}>{label}</dt>
      <dd
        className={
          tone === 'success'
            ? 'tabular font-medium text-success-700'
            : tone === 'warning'
              ? 'tabular font-medium text-warning-700'
              : muted
                ? 'tabular text-xs text-ink-muted'
                : 'tabular font-medium text-ink'
        }
      >
        {value}
      </dd>
    </div>
  )
}

function DateRow({ label, value }: { label: string; value: Date | null }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd>{formatDateTime(value)}</dd>
    </div>
  )
}
