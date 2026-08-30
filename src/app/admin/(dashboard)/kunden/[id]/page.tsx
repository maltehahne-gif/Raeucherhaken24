import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Mail, Phone, ShoppingCart } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber, formatPrice } from '@/lib/money'
import { formatDate, formatDateTime, formatRelative, parseTags } from '@/lib/utils/text'
import { AdminPageHeader } from '@/components/admin/page-header'
import { CustomerNotes } from '@/components/admin/customer-notes'
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/admin/status-badges'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

/** Neuere Bestellungen zuerst; darueber hinaus verweist die Seite auf die Bestellliste. */
const ORDER_HISTORY_LIMIT = 100

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { customerNumber: true },
  })
  return {
    title: customer ? `Kunde ${customer.customerNumber}` : 'Kundenakte',
    robots: { index: false, follow: false },
  }
}

const regionNames = new Intl.DisplayNames(['de'], { type: 'region' })

/** Laendercode in eine deutsche Bezeichnung; unbekannte Codes bleiben stehen. */
function countryLabel(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

const ADDRESS_KIND_LABELS: Record<string, string> = {
  shipping: 'Lieferadresse',
  billing: 'Rechnungsadresse',
}

/**
 * Kundenakte.
 *
 * Stammdaten und Anschriften stammen aus den Bestellungen des Kunden und
 * werden hier nur angezeigt. Bearbeitbar sind ausschliesslich die internen
 * Notizen und Tags — mit der Berechtigung `customers:write`.
 */
export default async function CustomerDetailPage({ params }: PageProps) {
  const session = await requirePermission('customers:read')
  const { id } = await params

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      customerNumber: true,
      email: true,
      firstName: true,
      lastName: true,
      company: true,
      phone: true,
      notes: true,
      tags: true,
      orderCount: true,
      totalSpentCents: true,
      lastOrderAt: true,
      createdAt: true,
      addresses: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          kind: true,
          firstName: true,
          lastName: true,
          company: true,
          street: true,
          postalCode: true,
          city: true,
          country: true,
          isDefault: true,
        },
      },
      _count: { select: { orders: true } },
    },
  })

  if (!customer) notFound()

  const canWrite = session.user.permissions.includes('customers:write')
  const canReadOrders = session.user.permissions.includes('orders:read')

  const [orders, cancelledCount, tagRows] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: ORDER_HISTORY_LIMIT,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        totalCents: true,
        couponCode: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where: { customerId: customer.id, status: 'cancelled' } }),
    // Vorschlagsliste fuer die Tag-Vergabe: was im Bestand bereits vergeben ist.
    prisma.customer.findMany({
      where: { NOT: { tags: '' } },
      select: { tags: true },
      distinct: ['tags'],
    }),
  ])

  const tags = parseTags(customer.tags)
  const tagSuggestions = [...new Set(tagRows.flatMap((row) => parseTags(row.tags)))].sort((a, b) =>
    a.localeCompare(b, 'de-DE'),
  )

  const averageOrderCents =
    customer.orderCount > 0 ? Math.round(customer.totalSpentCents / customer.orderCount) : 0
  const displayName = `${customer.firstName} ${customer.lastName}`
  const truncated = customer._count.orders > orders.length

  return (
    <div>
      <AdminPageHeader
        backHref="/admin/kunden"
        backLabel="Zurück zur Kundenliste"
        title={customer.company ?? displayName}
        description={`Kundennummer ${customer.customerNumber} · Kunde seit ${formatDate(customer.createdAt)}`}
        actions={
          canReadOrders ? (
            <Link
              href={`/admin/bestellungen?q=${encodeURIComponent(customer.email)}`}
              className="flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-[var(--accent)]"
            >
              Bestellungen filtern
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />

      {tags.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <Link key={tag} href={`/admin/kunden?tag=${encodeURIComponent(tag)}`}>
              <Badge tone="outline">{tag}</Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Kennzahlen */}
      <section aria-labelledby="kennzahlen" className="mb-6">
        <h2 id="kennzahlen" className="sr-only">
          Kennzahlen
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Bestellungen"
            value={formatNumber(customer.orderCount)}
            note={
              cancelledCount > 0
                ? `${formatNumber(cancelledCount)} storniert, nicht im Umsatz enthalten`
                : 'ohne Stornierungen'
            }
          />
          <MetricTile
            label="Gesamtumsatz"
            value={formatPrice(customer.totalSpentCents)}
            note="abzüglich Erstattungen"
          />
          <MetricTile
            label="Durchschnittlicher Bestellwert"
            value={customer.orderCount > 0 ? formatPrice(averageOrderCents) : '—'}
            note={customer.orderCount > 0 ? `über ${formatNumber(customer.orderCount)} Bestellungen` : 'noch keine Bestellung'}
          />
          <MetricTile
            label="Letzte Bestellung"
            value={customer.lastOrderAt ? formatDate(customer.lastOrderAt) : '—'}
            note={customer.lastOrderAt ? formatRelative(customer.lastOrderAt) : `Kunde seit ${formatDate(customer.createdAt)}`}
          />
        </ul>
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Bestellhistorie */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Bestellhistorie</CardTitle>
              <span className="text-xs text-ink-faint">
                {formatNumber(customer._count.orders)}{' '}
                {customer._count.orders === 1 ? 'Bestellung' : 'Bestellungen'}
              </span>
            </CardHeader>
            {orders.length === 0 ? (
              <CardBody>
                <EmptyState
                  compact
                  icon={<ShoppingCart className="size-5" aria-hidden="true" />}
                  title="Noch keine Bestellung"
                  description="Zu dieser Kundenakte liegt bislang keine Bestellung vor."
                />
              </CardBody>
            ) : (
              <>
                <TableWrap className="rounded-none border-0">
                  <Table className="min-w-[42rem]">
                    <caption className="sr-only">
                      Bestellungen von {customer.company ?? displayName}
                    </caption>
                    <Thead>
                      <Tr>
                        <Th>Bestellung</Th>
                        <Th>Datum</Th>
                        <Th>Status</Th>
                        <Th align="right">Positionen</Th>
                        <Th align="right">Summe</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {orders.map((order) => (
                        <Tr key={order.id}>
                          <Td>
                            {canReadOrders ? (
                              <Link
                                href={`/admin/bestellungen/${order.orderNumber}`}
                                className="tabular font-medium text-ink hover:text-[var(--accent)]"
                              >
                                {order.orderNumber}
                              </Link>
                            ) : (
                              <span className="tabular font-medium text-ink">{order.orderNumber}</span>
                            )}
                            {order.couponCode && (
                              <span className="tabular mt-0.5 block text-xs text-ink-faint">
                                Gutschein {order.couponCode}
                              </span>
                            )}
                          </Td>
                          <Td className="text-sm whitespace-nowrap">{formatDate(order.createdAt)}</Td>
                          <Td>
                            <span className="flex flex-wrap items-center gap-1">
                              <OrderStatusBadge status={order.status} />
                              <PaymentStatusBadge status={order.paymentStatus} />
                            </span>
                          </Td>
                          <Td align="right" className="tabular">
                            {formatNumber(order._count.items)}
                          </Td>
                          <Td align="right" className="tabular font-medium text-ink">
                            {formatPrice(order.totalCents)}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableWrap>
                {truncated && (
                  <CardBody className="border-t border-[var(--border-subtle)]">
                    <p className="text-xs text-ink-muted">
                      Angezeigt werden die letzten {ORDER_HISTORY_LIMIT} Bestellungen.{' '}
                      {canReadOrders && (
                        <Link
                          href={`/admin/bestellungen?q=${encodeURIComponent(customer.email)}`}
                          className="font-medium text-[var(--accent)] underline underline-offset-4"
                        >
                          Alle Bestellungen dieses Kunden ansehen
                        </Link>
                      )}
                    </p>
                  </CardBody>
                )}
              </>
            )}
          </Card>

          <CustomerNotes
            customerId={customer.id}
            customerName={customer.company ?? displayName}
            initialNotes={customer.notes ?? ''}
            initialTags={tags}
            canWrite={canWrite}
            suggestions={tagSuggestions}
          />
        </div>

        <div className="space-y-5">
          {/* Stammdaten */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Stammdaten</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="space-y-3 text-sm">
                <DataRow label="Kundennummer">
                  <span className="tabular">{customer.customerNumber}</span>
                </DataRow>
                <DataRow label="Name">{displayName}</DataRow>
                {customer.company && <DataRow label="Firma">{customer.company}</DataRow>}
                <DataRow label="E-Mail">
                  <a
                    href={`mailto:${customer.email}`}
                    className="inline-flex items-center gap-1.5 break-all hover:text-[var(--accent)]"
                  >
                    <Mail className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                    {customer.email}
                  </a>
                </DataRow>
                <DataRow label="Telefon">
                  {customer.phone ? (
                    <a
                      href={`tel:${customer.phone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-1.5 hover:text-[var(--accent)]"
                    >
                      <Phone className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                      {customer.phone}
                    </a>
                  ) : (
                    <span className="text-ink-faint">Nicht hinterlegt</span>
                  )}
                </DataRow>
                <DataRow label="Kunde seit">{formatDateTime(customer.createdAt)}</DataRow>
              </dl>
            </CardBody>
          </Card>

          {/* Anschriften */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Anschriften</CardTitle>
              <span className="text-xs text-ink-faint">
                {formatNumber(customer.addresses.length)}{' '}
                {customer.addresses.length === 1 ? 'Anschrift' : 'Anschriften'}
              </span>
            </CardHeader>
            <CardBody>
              {customer.addresses.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Für diese Kundenakte ist keine Anschrift gespeichert. Die Lieferanschrift der
                  jeweiligen Bestellung steht in der Bestellung selbst.
                </p>
              ) : (
                <ul className="space-y-4">
                  {customer.addresses.map((address) => (
                    <li key={address.id} className="text-sm">
                      <p className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-2xs font-semibold tracking-wider text-ink-muted uppercase">
                          {ADDRESS_KIND_LABELS[address.kind] ?? address.kind}
                        </span>
                        {address.isDefault && <Badge tone="accent">Standard</Badge>}
                      </p>
                      <address className="leading-relaxed text-ink-soft not-italic">
                        {address.company && (
                          <>
                            {address.company}
                            <br />
                          </>
                        )}
                        {address.firstName} {address.lastName}
                        <br />
                        {address.street}
                        <br />
                        <span className="tabular">{address.postalCode}</span> {address.city}
                        <br />
                        {countryLabel(address.country)}
                      </address>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

function MetricTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="tabular mt-1.5 font-display text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-ink-faint">{note}</p>
    </li>
  )
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  )
}
