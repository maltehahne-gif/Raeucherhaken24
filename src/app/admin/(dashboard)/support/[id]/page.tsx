import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, Mail, MessagesSquare } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatDateTime, formatRelative } from '@/lib/utils/text'
import {
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_TOPIC_LABELS,
  type SupportPriority,
  type SupportStatus,
  type SupportTopic,
} from '@/lib/domain/enums'
import { AdminPageHeader } from '@/components/admin/page-header'
import { SupportStatusBadge } from '@/components/admin/status-badges'
import { SupportComposer, SupportStatusForm } from '@/components/admin/support-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const request = await prisma.supportRequest.findUnique({
    where: { id },
    select: { ticketNumber: true },
  })
  return {
    title: request ? `Anfrage ${request.ticketNumber}` : 'Supportanfrage',
    robots: { index: false, follow: false },
  }
}

export default async function SupportDetailPage({ params }: PageProps) {
  const session = await requirePermission('support:read')
  const { id } = await params

  const request = await prisma.supportRequest.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  })

  if (!request) notFound()

  const permissions = session.user.permissions
  const canWrite = permissions.includes('support:write')
  const status = request.status as SupportStatus
  const priority = request.priority as SupportPriority

  // Die Bestellnummer stammt aus einem freien Eingabefeld des Kontaktformulars.
  // Verlinkt wird deshalb nur, wenn dazu wirklich eine Bestellung existiert.
  const order = request.orderNumber
    ? await prisma.order.findUnique({
        where: { orderNumber: request.orderNumber },
        select: { id: true, orderNumber: true, status: true, createdAt: true },
      })
    : null

  const customer = permissions.includes('customers:read')
    ? await prisma.customer.findUnique({
        where: { email: request.email },
        select: { id: true, customerNumber: true, firstName: true, lastName: true, company: true },
      })
    : null

  const mailtoHref = `mailto:${encodeURIComponent(request.email)}?subject=${encodeURIComponent(
    `Ihre Anfrage ${request.ticketNumber}: ${request.subject}`,
  )}`

  return (
    <div>
      <AdminPageHeader
        backHref="/admin/support"
        backLabel="Zurück zur Anfrageübersicht"
        title={request.subject}
        description={`Ticket ${request.ticketNumber} · eingegangen am ${formatDateTime(request.createdAt)} (${formatRelative(request.createdAt)})`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SupportStatusBadge status={request.status} />
        <PriorityBadge priority={request.priority} />
        <Badge tone="outline">
          {SUPPORT_TOPIC_LABELS[request.topic as SupportTopic] ?? request.topic}
        </Badge>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Die Anfrage im Wortlaut */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Anfrage im Wortlaut</CardTitle>
              <span className="tabular text-xs text-ink-faint">
                {formatDateTime(request.createdAt)}
              </span>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="rounded-lg bg-paper-sunken px-4 py-3.5 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                {request.message}
              </p>

              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <DataRow
                  label="Anliegen"
                  value={SUPPORT_TOPIC_LABELS[request.topic as SupportTopic] ?? request.topic}
                />
                <div>
                  <dt className="text-2xs font-semibold tracking-wider text-ink-muted uppercase">
                    Bestellnummer
                  </dt>
                  <dd className="mt-1 text-ink-soft">
                    {request.orderNumber ? (
                      order ? (
                        <Link
                          href={`/admin/bestellungen/${order.orderNumber}`}
                          className="tabular inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                        >
                          {order.orderNumber}
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </Link>
                      ) : (
                        <>
                          <span className="tabular font-medium text-ink">{request.orderNumber}</span>
                          <span className="mt-0.5 block text-xs text-ink-faint">
                            Zu dieser Nummer wurde keine Bestellung gefunden. Bitte beim Absender
                            nachfragen.
                          </span>
                        </>
                      )
                    ) : (
                      <span className="text-ink-faint">Nicht angegeben</span>
                    )}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {/* Verlauf */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Verlauf</CardTitle>
              <span className="text-xs text-ink-faint">
                Interne Notizen und Antwortentwürfe, chronologisch
              </span>
            </CardHeader>
            {request.messages.length === 0 ? (
              <CardBody>
                <EmptyState
                  compact
                  icon={<MessagesSquare className="size-5" aria-hidden="true" />}
                  title="Noch kein Eintrag"
                  description={
                    canWrite
                      ? 'Halten Sie hier fest, was Sie geklärt haben, oder entwerfen Sie eine Antwort an den Absender.'
                      : 'Sobald jemand eine Notiz oder einen Antwortentwurf erfasst, erscheint sie an dieser Stelle.'
                  }
                  headingLevel="h3"
                />
              </CardBody>
            ) : (
              <ol className="divide-y divide-[var(--border-subtle)]">
                {request.messages.map((entry) => {
                  const isReply = entry.kind === 'reply'
                  return (
                    <li key={entry.id} className="px-5 py-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {isReply ? (
                          <Badge tone="info">Antwortentwurf an den Absender</Badge>
                        ) : (
                          <Badge tone="neutral">Interne Notiz</Badge>
                        )}
                        <span className="text-xs text-ink-muted">
                          {entry.user
                            ? `${entry.user.firstName} ${entry.user.lastName}`
                            : 'Konto entfernt'}
                        </span>
                        <span className="tabular text-xs text-ink-faint">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                      <p
                        className={
                          isReply
                            ? 'rounded-r-lg border-l-2 border-info-500 bg-info-50/60 px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft'
                            : 'rounded-lg bg-paper-sunken px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft'
                        }
                      >
                        {entry.body}
                      </p>
                      {isReply && (
                        <p className="mt-1.5 text-xs text-ink-faint">
                          Dieser Text war für den Absender bestimmt und wurde von dieser Anwendung
                          nicht versendet.
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>

          <SupportComposer
            requestId={request.id}
            ticketNumber={request.ticketNumber}
            status={status}
            canWrite={canWrite}
          />
        </div>

        {/* Seitenspalte */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Absender</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              {request.company && <p className="font-medium text-ink">{request.company}</p>}
              <p className={request.company ? 'text-ink-soft' : 'font-medium text-ink'}>
                {request.name}
              </p>
              <p>
                <a href={mailtoHref} className="text-ink-soft break-all hover:text-[var(--accent)]">
                  {request.email}
                </a>
              </p>
              {request.phone && (
                <p>
                  <a
                    href={`tel:${request.phone.replace(/\s/g, '')}`}
                    className="text-ink-soft hover:text-[var(--accent)]"
                  >
                    {request.phone}
                  </a>
                </p>
              )}

              {customer && (
                <p className="border-t border-[var(--border-subtle)] pt-2">
                  <Link
                    href={`/admin/kunden/${customer.id}`}
                    className="inline-flex items-center gap-1 font-medium hover:text-[var(--accent)]"
                  >
                    Kundenakte {customer.customerNumber}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                </p>
              )}

              <div className="border-t border-[var(--border-subtle)] pt-3">
                <a
                  href={mailtoHref}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border-default)] px-3.5 text-sm font-medium text-ink transition-colors hover:border-[var(--border-strong)] hover:bg-paper-sunken"
                >
                  <Mail className="size-4" aria-hidden="true" />
                  Antwort im E-Mail-Programm
                </a>
                <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                  Öffnet Ihr E-Mail-Programm mit Empfänger und Betreff. Den Text übernehmen Sie aus
                  dem Antwortentwurf — diese Anwendung versendet selbst keine E-Mails.
                </p>
              </div>

              <dl className="tabular space-y-1 border-t border-[var(--border-subtle)] pt-2 text-xs text-ink-muted">
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Eingegangen</dt>
                  <dd>{formatDateTime(request.createdAt)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Zuletzt geändert</dt>
                  <dd>{formatDateTime(request.updatedAt)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <SupportStatusForm
            requestId={request.id}
            ticketNumber={request.ticketNumber}
            status={status}
            priority={priority}
            canWrite={canWrite}
          />
        </div>
      </div>
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-semibold tracking-wider text-ink-muted uppercase">{label}</dt>
      <dd className="mt-1 text-ink-soft">{value}</dd>
    </div>
  )
}

/** Prioritaet immer ausgeschrieben — Farbe allein traegt die Information nicht. */
function PriorityBadge({ priority }: { priority: string }) {
  const key = priority as SupportPriority
  const label = `Priorität: ${SUPPORT_PRIORITY_LABELS[key] ?? priority}`
  if (key === 'high') return <Badge tone="danger">{label}</Badge>
  if (key === 'low') return <Badge tone="outline">{label}</Badge>
  return <Badge tone="neutral">{label}</Badge>
}
