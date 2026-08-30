import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber, formatPrice } from '@/lib/money'
import { formatDate, formatDateTime } from '@/lib/utils/text'
import { COUPON_TYPE_LABELS, type CouponType } from '@/lib/domain/enums'
import { toDateTimeLocalInput } from '@/lib/validation/product'
import {
  COUPON_STATE_DESCRIPTIONS,
  COUPON_STATE_LABELS,
  COUPON_STATE_TONES,
  bpToPercentInput,
  centsToInput,
  couponState,
  describeCouponInWords,
  formatCouponValue,
} from '@/lib/validation/coupon'
import { AdminPageHeader } from '@/components/admin/page-header'
import { CouponForm, type CouponFormValues } from '@/components/admin/coupon-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

/** Mehr Einloesungen passen nicht sinnvoll auf eine Seite; darauf wird hingewiesen. */
const REDEMPTION_LIMIT = 100

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const coupon = await prisma.coupon.findUnique({ where: { id }, select: { code: true } })
  return {
    title: coupon ? `Gutschein ${coupon.code}` : 'Gutschein nicht gefunden',
    robots: { index: false, follow: false },
  }
}

/** Der gespeicherte Wert zurueck in die Eingabeeinheit des Formulars. */
function valueToInput(type: CouponType, value: number): string {
  switch (type) {
    case 'percent':
      return bpToPercentInput(value)
    case 'fixed':
      return centsToInput(value)
    case 'free_shipping':
      return ''
  }
}

/**
 * Gutschein bearbeiten und auswerten.
 *
 * Die Einloesungen stehen unter dem Formular: Sie sind der Beleg dafuer, was
 * der Code tatsaechlich gekostet hat, und entscheiden darueber, ob er noch
 * geloescht werden darf.
 */
export default async function CouponDetailPage({ params }: PageProps) {
  const session = await requirePermission('coupons:read')
  const canWrite = session.user.permissions.includes('coupons:write')
  const canReadOrders = session.user.permissions.includes('orders:read')
  const { id } = await params

  const coupon = await prisma.coupon.findUnique({ where: { id } })
  if (!coupon) notFound()

  const [redemptions, summary] = await Promise.all([
    prisma.couponRedemption.findMany({
      where: { couponId: coupon.id },
      orderBy: { createdAt: 'desc' },
      take: REDEMPTION_LIMIT,
      select: {
        id: true,
        customerEmail: true,
        discountCents: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
      },
    }),
    prisma.couponRedemption.aggregate({
      where: { couponId: coupon.id },
      _count: true,
      _sum: { discountCents: true },
    }),
  ])

  const now = new Date()
  const type = coupon.type as CouponType
  const state = couponState(coupon, now)
  const redemptionCount = summary._count
  const discountTotal = summary._sum.discountCents ?? 0
  const remaining = coupon.usageLimit > 0 ? Math.max(0, coupon.usageLimit - coupon.usageCount) : null

  const initialValues: CouponFormValues = {
    code: coupon.code,
    description: coupon.description ?? '',
    type: coupon.type,
    value: valueToInput(type, coupon.value),
    minOrderValueCents: coupon.minOrderValueCents > 0 ? centsToInput(coupon.minOrderValueCents) : '',
    maxDiscountCents: coupon.maxDiscountCents > 0 ? centsToInput(coupon.maxDiscountCents) : '',
    startsAt: coupon.startsAt ? toDateTimeLocalInput(coupon.startsAt) : '',
    endsAt: coupon.endsAt ? toDateTimeLocalInput(coupon.endsAt) : '',
    usageLimit: String(coupon.usageLimit),
    perCustomerLimit: String(coupon.perCustomerLimit),
    active: coupon.active,
  }

  return (
    <div>
      <AdminPageHeader
        backHref="/admin/gutscheine"
        backLabel="Zurück zur Gutscheinliste"
        title={`Gutschein ${coupon.code}`}
        description={`Angelegt am ${formatDateTime(coupon.createdAt)} · Zuletzt geändert am ${formatDateTime(coupon.updatedAt)}`}
        actions={
          <div className="text-right">
            <p className="tabular font-display text-2xl font-semibold">
              {formatCouponValue(type, coupon.value)}
            </p>
            <p className="text-xs text-ink-faint">{COUPON_TYPE_LABELS[type] ?? coupon.type}</p>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={COUPON_STATE_TONES[state]}>{COUPON_STATE_LABELS[state]}</Badge>
        <span className="text-sm text-ink-muted">{COUPON_STATE_DESCRIPTIONS[state]}</span>
      </div>

      {/* Kennzahlen */}
      <section aria-labelledby="kennzahlen" className="mb-6">
        <h2 id="kennzahlen" className="sr-only">
          Kennzahlen
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Einlösungen"
            value={
              coupon.usageLimit > 0
                ? `${formatNumber(coupon.usageCount)} von ${formatNumber(coupon.usageLimit)}`
                : formatNumber(coupon.usageCount)
            }
            note={remaining === null ? 'ohne Nutzungslimit' : `noch ${formatNumber(remaining)} möglich`}
          />
          <MetricTile
            label="Gewährter Rabatt"
            value={formatPrice(discountTotal)}
            note={
              redemptionCount > 0
                ? `Ø ${formatPrice(Math.round(discountTotal / redemptionCount))} je Bestellung`
                : 'noch keine Einlösung'
            }
          />
          <MetricTile
            label="Limit je Kunde"
            value={coupon.perCustomerLimit > 0 ? formatNumber(coupon.perCustomerLimit) : 'ohne'}
            note="gezählt je E-Mail-Adresse"
          />
          <MetricTile
            label="Gültigkeit"
            value={coupon.endsAt ? `bis ${formatDate(coupon.endsAt)}` : 'unbefristet'}
            note={coupon.startsAt ? `ab ${formatDate(coupon.startsAt)}` : 'ohne Startdatum'}
          />
        </ul>
      </section>

      {/* Regel in Worten */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle as="h2">Regel</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="font-display text-lg leading-snug font-semibold text-ink">
            {describeCouponInWords(
              {
                type,
                value: coupon.value,
                minOrderValueCents: coupon.minOrderValueCents,
                maxDiscountCents: coupon.maxDiscountCents,
                startsAt: coupon.startsAt,
                endsAt: coupon.endsAt,
              },
              now,
            )}
          </p>
          {coupon.description && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{coupon.description}</p>
          )}
        </CardBody>
      </Card>

      {canWrite ? (
        <CouponForm
          mode="edit"
          couponId={coupon.id}
          initialValues={initialValues}
          redemptionCount={redemptionCount}
          usageCount={coupon.usageCount}
        />
      ) : (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle as="h2">Einstellungen</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <DataRow label="Code">
                <span className="tabular font-medium">{coupon.code}</span>
              </DataRow>
              <DataRow label="Art">{COUPON_TYPE_LABELS[type] ?? coupon.type}</DataRow>
              <DataRow label="Wert">{formatCouponValue(type, coupon.value)}</DataRow>
              <DataRow label="Mindestbestellwert">
                {coupon.minOrderValueCents > 0 ? formatPrice(coupon.minOrderValueCents) : 'ohne'}
              </DataRow>
              <DataRow label="Maximaler Rabattbetrag">
                {type === 'percent' && coupon.maxDiscountCents > 0
                  ? formatPrice(coupon.maxDiscountCents)
                  : 'ohne'}
              </DataRow>
              <DataRow label="Nutzungslimit gesamt">
                {coupon.usageLimit > 0 ? formatNumber(coupon.usageLimit) : 'unbegrenzt'}
              </DataRow>
            </dl>
            <p className="mt-4 text-xs text-ink-muted">
              Zum Bearbeiten fehlt Ihnen die Berechtigung „Gutscheine bearbeiten“.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Einlösungen */}
      <Card className="mt-5">
        <CardHeader>
          <CardTitle as="h2">Einlösungen</CardTitle>
          <span className="text-xs text-ink-faint">
            {formatNumber(redemptionCount)} {redemptionCount === 1 ? 'Einlösung' : 'Einlösungen'}
          </span>
        </CardHeader>
        {redemptions.length === 0 ? (
          <CardBody>
            <EmptyState
              compact
              icon={<Receipt className="size-5" aria-hidden="true" />}
              title="Noch nicht eingelöst"
              description="Sobald der Code in einer Bestellung verwendet wird, erscheint hier die zugehörige Einlösung."
            />
          </CardBody>
        ) : (
          <>
            <TableWrap className="rounded-none border-0">
              <Table className="min-w-[40rem]">
                <caption className="sr-only">Einlösungen des Gutscheins {coupon.code}</caption>
                <Thead>
                  <Tr>
                    <Th>Bestellung</Th>
                    <Th>E-Mail</Th>
                    <Th>Eingelöst am</Th>
                    <Th align="right">Rabattbetrag</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {redemptions.map((redemption) => (
                    <Tr key={redemption.id}>
                      <Td>
                        {canReadOrders ? (
                          <Link
                            href={`/admin/bestellungen/${redemption.order.orderNumber}`}
                            className="tabular font-medium text-ink hover:text-[var(--accent)]"
                          >
                            {redemption.order.orderNumber}
                          </Link>
                        ) : (
                          <span className="tabular font-medium text-ink">
                            {redemption.order.orderNumber}
                          </span>
                        )}
                      </Td>
                      <Td className="text-sm break-all">
                        <a
                          href={`mailto:${redemption.customerEmail}`}
                          className="hover:text-[var(--accent)]"
                        >
                          {redemption.customerEmail}
                        </a>
                      </Td>
                      <Td className="text-sm whitespace-nowrap">
                        {formatDateTime(redemption.createdAt)}
                      </Td>
                      <Td align="right" className="tabular font-medium text-ink">
                        {formatPrice(redemption.discountCents)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableWrap>
            {redemptionCount > redemptions.length && (
              <CardBody className="border-t border-[var(--border-subtle)]">
                <p className="text-xs text-ink-muted">
                  Angezeigt werden die letzten {REDEMPTION_LIMIT} Einlösungen.
                </p>
              </CardBody>
            )}
          </>
        )}
      </Card>
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
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-[var(--border-subtle)] pb-2 last:border-b-0">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  )
}
