import type { Metadata } from 'next'
import Link from 'next/link'
import { History, SearchX } from 'lucide-react'
import { prisma, type Prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber } from '@/lib/money'
import { formatDateTime, formatRelative } from '@/lib/utils/text'
import { MOVEMENT_REASONS, MOVEMENT_REASON_LABELS, type MovementReason } from '@/lib/domain/enums'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Bestandsjournal', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/**
 * Bestandsjournal.
 *
 * Vollstaendige, chronologische Liste aller Bestandsbuchungen. Eintraege
 * werden nie geaendert oder geloescht — eine falsche Buchung wird durch eine
 * neue Buchung ausgeglichen, damit die Herleitung jedes Bestandes erhalten
 * bleibt.
 */

const PERIODS = [
  { value: '7', label: 'Letzte 7 Tage', days: 7 },
  { value: '30', label: 'Letzte 30 Tage', days: 30 },
  { value: '90', label: 'Letzte 90 Tage', days: 90 },
  { value: '365', label: 'Letzte 12 Monate', days: 365 },
] as const

const REASON_TONES: Record<MovementReason, BadgeTone> = {
  order: 'info',
  cancellation: 'steel',
  refund: 'warning',
  manual: 'accent',
  correction: 'outline',
  seed: 'neutral',
}

/** Gruende, deren Referenz eine Bestellnummer ist. */
const ORDER_REASONS: readonly MovementReason[] = ['order', 'cancellation', 'refund']

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export default async function InventoryJournalPage({ searchParams }: PageProps) {
  await requirePermission('inventory:read')

  const sp = await searchParams
  const query = single(sp.q).slice(0, 80)
  const productId = single(sp.artikel)
  const reasonRaw = single(sp.grund)
  const reason = (MOVEMENT_REASONS as readonly string[]).includes(reasonRaw) ? reasonRaw : ''
  const periodRaw = single(sp.zeitraum)
  const period = PERIODS.find((entry) => entry.value === periodRaw)?.value ?? ''
  const direction: 'asc' | 'desc' = single(sp.richtung) === 'asc' ? 'asc' : 'desc'
  const pageRaw = Number.parseInt(single(sp.seite), 10)
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1

  const where: Prisma.InventoryMovementWhereInput = {}
  if (query.length > 0) {
    where.OR = [
      { product: { name: { contains: query } } },
      { product: { sku: { contains: query } } },
      { reference: { contains: query } },
      { note: { contains: query } },
    ]
  }
  if (productId.length > 0) where.productId = productId
  if (reason.length > 0) where.reason = reason

  const days = PERIODS.find((entry) => entry.value === period)?.days
  if (days) where.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }

  const [filteredCount, incoming, outgoing, products] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.aggregate({ where: { ...where, delta: { gt: 0 } }, _sum: { delta: true } }),
    prisma.inventoryMovement.aggregate({ where: { ...where, delta: { lt: 0 } }, _sum: { delta: true } }),
    prisma.product.findMany({
      where: { movements: { some: {} } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, sku: true },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)

  const movements = await prisma.inventoryMovement.findMany({
    where,
    orderBy: [{ createdAt: direction }, { id: direction }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      delta: true,
      stockAfter: true,
      reason: true,
      reference: true,
      note: true,
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { name: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  })

  // Nur auf Bestellungen verlinken, die es wirklich noch gibt — ein toter Link
  // im Journal wäre schlimmer als reiner Text.
  const references = [
    ...new Set(
      movements
        .filter((movement) => ORDER_REASONS.includes(movement.reason as MovementReason))
        .map((movement) => movement.reference)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  const knownOrders =
    references.length > 0
      ? new Set(
          (
            await prisma.order.findMany({
              where: { orderNumber: { in: references } },
              select: { orderNumber: true },
            })
          ).map((order) => order.orderNumber),
        )
      : new Set<string>()

  const hasFilters =
    query.length > 0 || productId.length > 0 || reason.length > 0 || period.length > 0
  const journalSize = filteredCount === 0 && hasFilters ? await prisma.inventoryMovement.count() : filteredCount

  function href(overrides: Record<string, string | number | null>): string {
    const values: Record<string, string> = {
      q: query,
      artikel: productId,
      grund: reason,
      zeitraum: period,
      richtung: direction === 'desc' ? '' : direction,
      seite: page > 1 ? String(page) : '',
    }
    for (const [key, value] of Object.entries(overrides)) {
      values[key] = value === null ? '' : String(value)
    }
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) {
      if (value.length > 0) params.set(key, value)
    }
    const search = params.toString()
    return search.length > 0 ? `/admin/lager/bewegungen?${search}` : '/admin/lager/bewegungen'
  }

  const incomingSum = incoming._sum.delta ?? 0
  const outgoingSum = outgoing._sum.delta ?? 0

  return (
    <div>
      <AdminPageHeader
        backHref="/admin/lager"
        backLabel="Zurück zur Bestandsübersicht"
        title="Bestandsjournal"
        description="Jede Bestandsänderung mit Zeitpunkt, Grund und Bearbeiter. Einträge werden nicht verändert; eine falsche Buchung wird durch eine Gegenbuchung ausgeglichen."
        count={filteredCount}
        countLabel={filteredCount === 1 ? 'Buchung' : 'Buchungen'}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:max-w-3xl">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
          <p className="text-xs font-medium text-ink-muted">Buchungen in dieser Auswahl</p>
          <p className="tabular mt-1 font-display text-2xl font-semibold">{formatNumber(filteredCount)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
          <p className="text-xs font-medium text-ink-muted">Zugänge</p>
          <p className="tabular mt-1 font-display text-2xl font-semibold text-success-700">
            +{formatNumber(incomingSum)}
          </p>
          <p className="mt-1 text-xs text-ink-faint">Stück</p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
          <p className="text-xs font-medium text-ink-muted">Abgänge</p>
          <p className="tabular mt-1 font-display text-2xl font-semibold text-danger-700">
            {formatNumber(outgoingSum)}
          </p>
          <p className="mt-1 text-xs text-ink-faint">Stück</p>
        </div>
      </div>

      <AdminFilterBar
        searchPlaceholder="Artikel, SKU, Referenz oder Notiz …"
        selects={[
          {
            name: 'artikel',
            label: 'Artikel',
            allLabel: 'Artikel: alle',
            options: products.map((product) => ({
              value: product.id,
              label: `${product.name} (${product.sku})`,
            })),
          },
          {
            name: 'grund',
            label: 'Grund',
            allLabel: 'Grund: alle',
            options: MOVEMENT_REASONS.map((value) => ({ value, label: MOVEMENT_REASON_LABELS[value] })),
          },
          {
            name: 'zeitraum',
            label: 'Zeitraum',
            allLabel: 'Zeitraum: gesamt',
            options: PERIODS.map((entry) => ({ value: entry.value, label: entry.label })),
          },
        ]}
      />

      {movements.length === 0 ? (
        <EmptyState
          icon={
            journalSize === 0 ? (
              <History className="size-5" aria-hidden="true" />
            ) : (
              <SearchX className="size-5" aria-hidden="true" />
            )
          }
          title={journalSize === 0 ? 'Noch keine Buchungen' : 'Keine Buchung passt zur Auswahl'}
          description={
            journalSize === 0
              ? 'Sobald ein Bestand gebucht oder eine Bestellung ausgeliefert wird, erscheint der Vorgang hier.'
              : 'Ändern Sie die Suche oder setzen Sie die Filter zurück, um wieder alle Buchungen zu sehen.'
          }
          action={
            journalSize === 0
              ? { label: 'Zur Bestandsübersicht', href: '/admin/lager' }
              : { label: 'Filter zurücksetzen', href: '/admin/lager/bewegungen' }
          }
        />
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[68rem]">
              <caption className="sr-only">
                Bestandsjournal, Seite {page} von {totalPages}
              </caption>
              <Thead>
                <Tr>
                  <SortableTh
                    label="Zeitpunkt"
                    href={href({ richtung: direction === 'desc' ? 'asc' : null, seite: null })}
                    active
                    direction={direction}
                  />
                  <Th>Artikel</Th>
                  <Th align="right">Veränderung</Th>
                  <Th align="right">Bestand danach</Th>
                  <Th>Grund</Th>
                  <Th>Referenz</Th>
                  <Th>Bearbeiter</Th>
                  <Th>Notiz</Th>
                </Tr>
              </Thead>
              <Tbody>
                {movements.map((movement) => {
                  const reasonKey = movement.reason as MovementReason
                  const linkable =
                    movement.reference !== null && knownOrders.has(movement.reference)

                  return (
                    <Tr key={movement.id}>
                      <Td>
                        <span className="tabular block text-sm whitespace-nowrap">
                          {formatDateTime(movement.createdAt)}
                        </span>
                        <span className="block text-xs text-ink-faint">
                          {formatRelative(movement.createdAt)}
                        </span>
                      </Td>

                      <Td>
                        <Link
                          href={`/admin/produkte/${movement.product.id}`}
                          className="font-medium text-ink hover:text-[var(--accent)]"
                        >
                          {movement.product.name}
                        </Link>
                        <span className="tabular mt-0.5 block text-xs text-ink-faint">
                          {movement.product.sku}
                          {movement.variant ? ` · ${movement.variant.name}` : ''}
                        </span>
                      </Td>

                      <Td align="right">
                        <span
                          className={cn(
                            'tabular font-semibold',
                            movement.delta > 0 ? 'text-success-700' : 'text-danger-700',
                          )}
                        >
                          {movement.delta > 0 ? '+' : ''}
                          {formatNumber(movement.delta)}
                        </span>
                      </Td>

                      <Td align="right">
                        <span className="tabular text-sm">{formatNumber(movement.stockAfter)}</span>
                      </Td>

                      <Td>
                        <Badge tone={REASON_TONES[reasonKey] ?? 'neutral'}>
                          {MOVEMENT_REASON_LABELS[reasonKey] ?? movement.reason}
                        </Badge>
                      </Td>

                      <Td>
                        {movement.reference === null ? (
                          <span className="text-ink-faint" aria-label="Keine Referenz">
                            —
                          </span>
                        ) : linkable ? (
                          <Link
                            href={`/admin/bestellungen/${movement.reference}`}
                            className="tabular text-sm font-medium text-ink hover:text-[var(--accent)]"
                          >
                            {movement.reference}
                          </Link>
                        ) : (
                          <span className="tabular text-sm">{movement.reference}</span>
                        )}
                      </Td>

                      <Td className="text-sm whitespace-nowrap">
                        {movement.user
                          ? `${movement.user.firstName} ${movement.user.lastName}`
                          : 'System'}
                      </Td>

                      <Td className="text-sm">
                        {movement.note ? (
                          <span className="block max-w-[18rem] truncate" title={movement.note}>
                            {movement.note}
                          </span>
                        ) : (
                          <span className="text-ink-faint" aria-label="Keine Notiz">
                            —
                          </span>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          </TableWrap>

          <p className="mt-4 text-center text-xs text-ink-muted" aria-live="polite">
            {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + movements.length} von{' '}
            {formatNumber(filteredCount)} {filteredCount === 1 ? 'Buchung' : 'Buchungen'}
          </p>

          <Pagination
            page={page}
            totalPages={totalPages}
            buildHref={(target) => href({ seite: target === 1 ? null : target })}
            className="mt-3"
          />
        </>
      )}
    </div>
  )
}
