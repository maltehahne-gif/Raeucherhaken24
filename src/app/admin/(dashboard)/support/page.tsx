import type { Metadata } from 'next'
import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import { prisma, type Prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber } from '@/lib/money'
import { formatDateTime, formatRelative, truncate } from '@/lib/utils/text'
import {
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPICS,
  SUPPORT_TOPIC_LABELS,
  type SupportPriority,
  type SupportStatus,
  type SupportTopic,
} from '@/lib/domain/enums'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/page-header'
import { SupportStatusBadge } from '@/components/admin/status-badges'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Supportanfragen', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

/**
 * Anfragen, die noch Arbeit bedeuten. Die Reihenfolge der Liste richtet sich
 * danach: erledigte Vorgaenge stehen grundsaetzlich hinter den offenen.
 */
const OPEN_STATUSES: readonly SupportStatus[] = ['new', 'in_progress', 'waiting']
const CLOSED_STATUSES: readonly SupportStatus[] = ['resolved', 'closed']

/**
 * Sortierrichtung der Spalte „Alter“ — nicht des Zeitstempels: „aufsteigend“
 * heisst juengste Anfrage zuerst. Sonst zeigte der Pfeil das Gegenteil dessen
 * an, was die Spalte beschriftet.
 */
type AgeDirection = 'asc' | 'desc'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export default async function SupportPage({ searchParams }: PageProps) {
  await requirePermission('support:read')
  const sp = await searchParams

  // --- Filterzustand aus der URL lesen und gegen erlaubte Werte pruefen ----
  const query = single(sp.q).slice(0, 80)

  const statusRaw = single(sp.status)
  const status =
    statusRaw === 'offen' || (SUPPORT_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : ''

  const topicRaw = single(sp.anliegen)
  const topic = (SUPPORT_TOPICS as readonly string[]).includes(topicRaw) ? topicRaw : ''

  const priorityRaw = single(sp.prioritaet)
  const priority = (SUPPORT_PRIORITIES as readonly string[]).includes(priorityRaw) ? priorityRaw : ''

  // Neueste zuerst ist die Voreinstellung; die Spalte laesst sich umdrehen.
  const ageDirection: AgeDirection = single(sp.richtung) === 'desc' ? 'desc' : 'asc'
  const createdAtOrder = ageDirection === 'asc' ? ('desc' as const) : ('asc' as const)

  const pageRaw = Number.parseInt(single(sp.seite), 10)
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1

  // --- Abfrage -------------------------------------------------------------
  const where: Prisma.SupportRequestWhereInput = {}

  if (query.length > 0) {
    where.OR = [
      { ticketNumber: { contains: query } },
      { subject: { contains: query } },
      { name: { contains: query } },
      { company: { contains: query } },
      { email: { contains: query } },
    ]
  }
  if (status === 'offen') where.status = { in: [...OPEN_STATUSES] }
  else if (status.length > 0) where.status = status

  if (topic.length > 0) where.topic = topic
  if (priority.length > 0) where.priority = priority

  const whereOpen: Prisma.SupportRequestWhereInput = {
    AND: [where, { status: { in: [...OPEN_STATUSES] } }],
  }
  const whereClosed: Prisma.SupportRequestWhereInput = {
    AND: [where, { status: { in: [...CLOSED_STATUSES] } }],
  }

  const [openCount, closedCount, urgentCount] = await Promise.all([
    prisma.supportRequest.count({ where: whereOpen }),
    prisma.supportRequest.count({ where: whereClosed }),
    prisma.supportRequest.count({ where: { AND: [whereOpen, { priority: 'high' }] } }),
  ])

  const filteredCount = openCount + closedCount
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const skip = (page - 1) * PAGE_SIZE

  // Die Seite wird aus zwei geordneten Gruppen zusammengesetzt: erst die
  // offenen Anfragen, danach die erledigten. Beide Gruppen sind in sich nach
  // Eingang sortiert, deshalb bleibt die Blaetterung ueber alle Seiten stabil.
  const openSkip = Math.min(skip, openCount)
  const openTake = Math.max(0, Math.min(PAGE_SIZE, openCount - skip))
  const closedSkip = Math.max(0, skip - openCount)
  const closedTake = PAGE_SIZE - openTake

  const select = {
    id: true,
    ticketNumber: true,
    subject: true,
    name: true,
    company: true,
    email: true,
    topic: true,
    status: true,
    priority: true,
    createdAt: true,
    _count: { select: { messages: true } },
  } as const

  const [openRows, closedRows] = await Promise.all([
    openTake > 0
      ? prisma.supportRequest.findMany({
          where: whereOpen,
          orderBy: { createdAt: createdAtOrder },
          skip: openSkip,
          take: openTake,
          select,
        })
      : Promise.resolve([]),
    closedTake > 0
      ? prisma.supportRequest.findMany({
          where: whereClosed,
          orderBy: { createdAt: createdAtOrder },
          skip: closedSkip,
          take: closedTake,
          select,
        })
      : Promise.resolve([]),
  ])

  const requests = [...openRows, ...closedRows]

  const hasFilters =
    query.length > 0 || status.length > 0 || topic.length > 0 || priority.length > 0
  // Nur laden, wenn die gefilterte Liste leer ist — sonst waere die
  // Zusatzabfrage reine Last ohne Nutzen.
  const totalRequests =
    filteredCount === 0 && hasFilters ? await prisma.supportRequest.count() : filteredCount

  // --- URL-Bau fuer Sortierung und Seitenwechsel ---------------------------
  function buildHref(overrides: Record<string, string | number | undefined>): string {
    const params = new URLSearchParams()
    const values: Record<string, string> = {
      q: query,
      status,
      anliegen: topic,
      prioritaet: priority,
      richtung: ageDirection === 'asc' ? '' : ageDirection,
      seite: page > 1 ? String(page) : '',
    }
    for (const [key, value] of Object.entries(overrides)) {
      values[key] = value === undefined ? '' : String(value)
    }
    for (const [key, value] of Object.entries(values)) {
      if (value.length > 0) params.set(key, value)
    }
    const search = params.toString()
    return search.length > 0 ? `/admin/support?${search}` : '/admin/support'
  }

  return (
    <div>
      <AdminPageHeader
        title="Supportanfragen"
        description="Alle Anfragen aus dem Kontaktformular. Offene Vorgänge stehen vor den erledigten, innerhalb der Gruppen nach Eingang sortiert."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:max-w-3xl">
        <SummaryTile label="Anfragen in dieser Auswahl" value={filteredCount} />
        <SummaryTile label="Davon offen" value={openCount} hint="Neu, in Bearbeitung, wartend" />
        <SummaryTile
          label="Offen mit hoher Priorität"
          value={urgentCount}
          hint={urgentCount > 0 ? 'Bitte zuerst bearbeiten' : 'Nichts Dringendes offen'}
          urgent={urgentCount > 0}
        />
      </div>

      <AdminFilterBar
        searchPlaceholder="Ticketnummer, Betreff, Name oder E-Mail …"
        selects={[
          {
            name: 'status',
            label: 'Status',
            allLabel: 'Status: alle',
            options: [
              { value: 'offen', label: 'Nur offene Anfragen' },
              ...SUPPORT_STATUSES.map((value) => ({ value, label: SUPPORT_STATUS_LABELS[value] })),
            ],
          },
          {
            name: 'anliegen',
            label: 'Anliegen',
            allLabel: 'Anliegen: alle',
            options: SUPPORT_TOPICS.map((value) => ({ value, label: SUPPORT_TOPIC_LABELS[value] })),
          },
          {
            name: 'prioritaet',
            label: 'Priorität',
            allLabel: 'Priorität: alle',
            options: SUPPORT_PRIORITIES.map((value) => ({
              value,
              label: SUPPORT_PRIORITY_LABELS[value],
            })),
          },
        ]}
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy className="size-5" aria-hidden="true" />}
          title={
            totalRequests === 0 ? 'Noch keine Supportanfragen' : 'Keine Anfrage passt zur Auswahl'
          }
          description={
            totalRequests === 0
              ? 'Sobald eine Anfrage über das Kontaktformular eingeht, erscheint sie an dieser Stelle.'
              : 'Ändern Sie die Suche oder setzen Sie die Filter zurück, um wieder alle Anfragen zu sehen.'
          }
          action={totalRequests === 0 ? undefined : { label: 'Filter zurücksetzen', href: '/admin/support' }}
        />
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[56rem]">
              <Thead>
                <tr>
                  <Th>Ticket</Th>
                  <Th>Betreff</Th>
                  <Th>Absender</Th>
                  <Th>Anliegen</Th>
                  <Th>Status</Th>
                  <Th>Priorität</Th>
                  <SortableTh
                    label="Alter"
                    href={buildHref({
                      richtung: ageDirection === 'asc' ? 'desc' : '',
                      seite: '',
                    })}
                    active
                    direction={ageDirection}
                    align="right"
                  />
                </tr>
              </Thead>
              <Tbody>
                {requests.map((request) => (
                  <Tr key={request.id} className="group relative">
                    <Td className="font-semibold text-ink">
                      {/* Der Link spannt sich über die gesamte Zeile, bleibt im
                          DOM aber ein einzelner, benannter Link. */}
                      <Link
                        href={`/admin/support/${request.id}`}
                        className="tabular rounded-xs whitespace-nowrap after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--accent)]"
                      >
                        {request.ticketNumber}
                      </Link>
                    </Td>
                    <Td>
                      <span className="block max-w-[22rem] font-medium text-ink">
                        {truncate(request.subject, 70)}
                      </span>
                      {request._count.messages > 0 && (
                        <span className="block text-xs text-ink-faint">
                          {formatNumber(request._count.messages)}{' '}
                          {request._count.messages === 1 ? 'Eintrag' : 'Einträge'} im Verlauf
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="block max-w-[14rem] truncate text-ink">
                        {request.company ?? request.name}
                      </span>
                      <span className="block max-w-[14rem] truncate text-xs text-ink-faint">
                        {request.company ? `${request.name} · ` : ''}
                        {request.email}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {SUPPORT_TOPIC_LABELS[request.topic as SupportTopic] ?? request.topic}
                    </Td>
                    <Td>
                      <SupportStatusBadge status={request.status} />
                    </Td>
                    <Td>
                      <PriorityBadge priority={request.priority} />
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <span title={formatDateTime(request.createdAt)}>
                        {formatRelative(request.createdAt)}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>

          <p className="mt-4 text-center text-xs text-ink-faint">
            Seite {formatNumber(page)} von {formatNumber(totalPages)} · Einträge{' '}
            {formatNumber(skip + 1)} bis {formatNumber(Math.min(page * PAGE_SIZE, filteredCount))} von{' '}
            {formatNumber(filteredCount)}
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

/** Prioritaet immer ausgeschrieben — Farbe allein traegt die Information nicht. */
function PriorityBadge({ priority }: { priority: string }) {
  const key = priority as SupportPriority
  const label = SUPPORT_PRIORITY_LABELS[key] ?? priority
  if (key === 'high') return <Badge tone="danger">{label}</Badge>
  if (key === 'low') return <Badge tone="outline">{label}</Badge>
  return <Badge tone="neutral">{label}</Badge>
}

function SummaryTile({
  label,
  value,
  hint,
  urgent = false,
}: {
  label: string
  value: number
  hint?: string
  urgent?: boolean
}) {
  return (
    <div
      className={
        urgent
          ? 'rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-5 py-4'
          : 'rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4'
      }
    >
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="tabular mt-1 font-display text-2xl font-semibold">{formatNumber(value)}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}
