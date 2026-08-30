import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, Clock, CreditCard, Package, Truck } from 'lucide-react'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { formatPrice } from '@/lib/money'
import { formatDate } from '@/lib/utils/text'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import {
  CARRIER_LABELS,
  CARRIER_TRACKING_URLS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type Carrier,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/domain/enums'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Bestellbestätigung',
  description: 'Ihre Bestellung bei Räucherhaken24.',
  path: '/bestellung',
  noIndex: true,
})

type PageProps = { params: Promise<{ nummer: string }> }

/**
 * Bestellbestaetigung und Statusansicht.
 *
 * Die Bestellnummer ist bewusst der einzige Zugang — dafuer ist sie
 * nicht fortlaufend erratbar genug fuer sensible Daten, deshalb zeigt die
 * Seite keine vollstaendige Anschrift, sondern nur Ort und Nachnamen-Initiale.
 * Vollstaendige Daten stehen in der Bestellbestaetigung per E-Mail.
 */
export default async function OrderPage({ params }: PageProps) {
  const { nummer } = await params
  const order = await prisma.order.findUnique({
    where: { orderNumber: decodeURIComponent(nummer) },
    include: {
      items: true,
      statusHistory: { orderBy: { createdAt: 'asc' }, select: { toValue: true, field: true, createdAt: true } },
    },
  })
  if (!order) notFound()

  const status = order.status as OrderStatus
  const paymentStatus = order.paymentStatus as PaymentStatus
  const carrier = order.carrier as Carrier | null
  const trackingUrl =
    carrier && order.trackingNumber && CARRIER_TRACKING_URLS[carrier]
      ? CARRIER_TRACKING_URLS[carrier]!.replace('{tracking}', encodeURIComponent(order.trackingNumber))
      : null

  const isCancelled = status === 'cancelled'

  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <div className="text-center">
        <span
          className={
            isCancelled
              ? 'inline-flex size-14 items-center justify-center rounded-full bg-paper-muted text-ink-muted'
              : 'inline-flex size-14 items-center justify-center rounded-full bg-success-50 text-success-500'
          }
        >
          {isCancelled ? (
            <Package className="size-7" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-7" aria-hidden="true" />
          )}
        </span>
        <h1 className="mt-5 font-display text-3xl font-semibold sm:text-4xl">
          {isCancelled ? 'Diese Bestellung wurde storniert' : 'Vielen Dank für Ihre Bestellung'}
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          Bestellnummer <strong className="tabular font-semibold text-ink">{order.orderNumber}</strong> vom{' '}
          {formatDate(order.createdAt)}
        </p>
        {!isCancelled && (
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-muted">
            Wir haben Ihnen eine Bestätigung an <strong className="text-ink">{maskEmail(order.email)}</strong>{' '}
            geschickt. Darin stehen alle Zahlungsdaten. Bewahren Sie die Bestellnummer auf — damit rufen Sie
            diese Seite jederzeit wieder auf.
          </p>
        )}
      </div>

      {/* Status */}
      <div className="mt-9 grid gap-4 sm:grid-cols-2">
        <StatusCard
          icon={<CreditCard className="size-4.5" aria-hidden="true" />}
          label="Zahlung"
          value={PAYMENT_STATUS_LABELS[paymentStatus]}
          tone={paymentStatus === 'paid' ? 'success' : paymentStatus === 'failed' ? 'danger' : 'warning'}
          hint={
            paymentStatus === 'pending'
              ? 'Wir versenden, sobald Ihre Überweisung eingegangen ist.'
              : undefined
          }
        />
        <StatusCard
          icon={<Truck className="size-4.5" aria-hidden="true" />}
          label="Bearbeitung"
          value={ORDER_STATUS_LABELS[status]}
          tone={status === 'delivered' ? 'success' : isCancelled ? 'neutral' : 'info'}
          hint={
            trackingUrl
              ? undefined
              : status === 'shipped'
                ? 'Ihre Sendung ist unterwegs.'
                : undefined
          }
        />
      </div>

      {trackingUrl && (
        <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <h2 className="font-display text-base font-semibold">Sendungsverfolgung</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            {carrier ? CARRIER_LABELS[carrier] : 'Versanddienstleister'} ·{' '}
            <span className="tabular">{order.trackingNumber}</span>
          </p>
          <ButtonLink href={trackingUrl} variant="outline" size="sm" className="mt-3" target="_blank" rel="noopener noreferrer">
            Sendung verfolgen
          </ButtonLink>
        </div>
      )}

      {/* Positionen */}
      <section className="mt-9" aria-labelledby="positionen">
        <h2 id="positionen" className="font-display text-xl font-semibold">
          Bestellte Artikel
        </h2>
        <ul className="mt-4 divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-4 px-5 py-4">
              <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-md bg-paper-sunken text-sm font-semibold text-ink-soft">
                {item.quantity}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.name}</span>
                {item.configSummary && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{item.configSummary}</span>
                )}
                <span className="tabular mt-0.5 block text-xs text-ink-faint">
                  Art.-Nr. {item.articleNumber} · {formatPrice(item.unitPriceCents)} je Stück
                </span>
              </span>
              <span className="tabular shrink-0 text-sm font-semibold">{formatPrice(item.lineTotalCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 text-sm">
          <SummaryRow label="Zwischensumme" value={formatPrice(order.subtotalCents)} />
          {order.discountCents > 0 && (
            <SummaryRow
              label={`Gutschein ${order.couponCode ?? ''}`.trim()}
              value={`−${formatPrice(order.discountCents)}`}
            />
          )}
          <SummaryRow
            label="Versand"
            value={order.shippingCents === 0 ? 'kostenfrei' : formatPrice(order.shippingCents)}
          />
          <div className="flex items-baseline justify-between gap-4 border-t border-[var(--border-subtle)] pt-3">
            <dt className="font-display text-base font-semibold">Gesamtsumme</dt>
            <dd className="tabular font-display text-xl font-semibold">{formatPrice(order.totalCents)}</dd>
          </div>
          <p className="text-xs text-ink-faint">inkl. {formatPrice(order.taxCents)} MwSt.</p>
          {order.refundedCents > 0 && (
            <p className="text-xs font-medium text-ink-muted">
              Davon erstattet: {formatPrice(order.refundedCents)}
            </p>
          )}
        </dl>
      </section>

      {/* Lieferung */}
      <section className="mt-9" aria-labelledby="lieferung">
        <h2 id="lieferung" className="font-display text-xl font-semibold">
          Lieferung
        </h2>
        <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-sm leading-relaxed text-ink-soft">
          <p>
            {order.firstName} {order.lastName.charAt(0)}.
            {order.company ? ` · ${order.company}` : ''}
          </p>
          <p className="text-ink-muted">
            {order.postalCode} {order.city}
          </p>
          {order.note && (
            <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-ink-muted">
              <span className="font-medium text-ink">Ihr Hinweis:</span> {order.note}
            </p>
          )}
          <p className="mt-3 text-xs text-ink-faint">
            Die vollständige Lieferanschrift steht in Ihrer Bestellbestätigung per E-Mail.
          </p>
        </div>
      </section>

      {/* Verlauf */}
      {order.statusHistory.length > 1 && (
        <section className="mt-9" aria-labelledby="verlauf">
          <h2 id="verlauf" className="font-display text-xl font-semibold">
            Verlauf
          </h2>
          <ol className="mt-4 space-y-3">
            {order.statusHistory.map((entry, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <Clock className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                <span>
                  <span className="font-medium">
                    {entry.field === 'payment'
                      ? PAYMENT_STATUS_LABELS[entry.toValue as PaymentStatus] ?? entry.toValue
                      : ORDER_STATUS_LABELS[entry.toValue as OrderStatus] ?? entry.toValue}
                  </span>
                  <span className="ml-2 text-ink-faint">{formatDate(entry.createdAt)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3 border-t border-[var(--border-subtle)] pt-8">
        <ButtonLink href="/kategorie" variant="outline">
          Weiter einkaufen
        </ButtonLink>
        <Link
          href="/kontakt"
          className="inline-flex h-11 items-center px-4 text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Frage zur Bestellung
        </Link>
      </div>
    </div>
  )
}

/** Verdeckt den Mittelteil der Adresse: m****e@beispiel.de */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain || local.length <= 2) return email
  return `${local[0]}${'*'.repeat(Math.max(3, local.length - 2))}${local[local.length - 1]}@${domain}`
}

function StatusCard({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
      <p className="flex items-center gap-2 text-2xs font-semibold tracking-wide text-ink-faint uppercase">
        {icon}
        {label}
      </p>
      <p className="mt-2">
        <Badge tone={tone} size="md">
          {value}
        </Badge>
      </p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  )
}
