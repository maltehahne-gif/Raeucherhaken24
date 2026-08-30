import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgePercent, Plus, SearchX } from 'lucide-react'
import { prisma, type Prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber, formatPrice } from '@/lib/money'
import { formatDate } from '@/lib/utils/text'
import { COUPON_TYPES, COUPON_TYPE_LABELS, type CouponType } from '@/lib/domain/enums'
import {
  COUPON_STATES,
  COUPON_STATE_LABELS,
  COUPON_STATE_TONES,
  couponState,
  formatCouponValue,
  type CouponState,
} from '@/lib/validation/coupon'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/page-header'
import { CouponRowActions } from '@/components/admin/coupon-form'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Gutscheine', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const SORT_ORDERS = {
  'neu-desc': [{ createdAt: 'desc' }],
  'neu-asc': [{ createdAt: 'asc' }],
  'code-asc': [{ code: 'asc' }],
  'code-desc': [{ code: 'desc' }],
  'nutzung-asc': [{ usageCount: 'asc' }, { code: 'asc' }],
  'nutzung-desc': [{ usageCount: 'desc' }, { code: 'asc' }],
  'ende-asc': [{ endsAt: 'asc' }, { code: 'asc' }],
  'ende-desc': [{ endsAt: 'desc' }, { code: 'asc' }],
} satisfies Record<string, Prisma.CouponOrderByWithRelationInput[]>

type SortKey = keyof typeof SORT_ORDERS
const DEFAULT_SORT: SortKey = 'neu-desc'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/**
 * Uebersetzt den angezeigten Zustand in eine Datenbankbedingung.
 *
 * Die Bedingungen folgen exakt der Reihenfolge von `couponState`: Ein
 * abgelaufener Gutschein taucht nicht zusaetzlich unter „ausgeschöpft“ auf.
 * Der Vergleich zweier Spalten (`usageCount` gegen `usageLimit`) laeuft ueber
 * eine Feldreferenz — so bleibt die Filterung in der Datenbank und die
 * Seitenzahlen stimmen.
 */
function stateWhere(state: CouponState, now: Date): Prisma.CouponWhereInput {
  const started: Prisma.CouponWhereInput = { OR: [{ startsAt: null }, { startsAt: { lte: now } }] }
  const running: Prisma.CouponWhereInput = { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
  const exhausted: Prisma.CouponWhereInput = {
    usageLimit: { gt: 0 },
    usageCount: { gte: prisma.coupon.fields.usageLimit },
  }
  const available: Prisma.CouponWhereInput = {
    OR: [{ usageLimit: 0 }, { usageCount: { lt: prisma.coupon.fields.usageLimit } }],
  }

  switch (state) {
    case 'disabled':
      return { active: false }
    case 'scheduled':
      return { active: true, startsAt: { gt: now } }
    case 'expired':
      return { active: true, AND: [started, { endsAt: { lte: now } }] }
    case 'exhausted':
      return { active: true, AND: [started, running, exhausted] }
    case 'active':
      return { active: true, AND: [started, running, available] }
  }
}

/**
 * Gutscheinliste der Verwaltung.
 *
 * Suche, Filter, Sortierung und Seite stehen vollstaendig in der URL. Der
 * Zustand jeder Zeile wird mit derselben Funktion bestimmt, mit der auch die
 * Gutscheinpruefung im Shop urteilt — die Liste zeigt damit genau das, was
 * Kundinnen und Kunden erleben.
 */
export default async function AdminCouponsPage({ searchParams }: PageProps) {
  const session = await requirePermission('coupons:read')
  const canWrite = session.user.permissions.includes('coupons:write')
  const sp = await searchParams

  const query = single(sp.q).slice(0, 60)
  const typeRaw = single(sp.art)
  const type = (COUPON_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : ''
  const stateRaw = single(sp.zustand)
  const state = (COUPON_STATES as readonly string[]).includes(stateRaw) ? (stateRaw as CouponState) : null
  const sortParam = single(sp.sortierung)
  const sort: SortKey = sortParam in SORT_ORDERS ? (sortParam as SortKey) : DEFAULT_SORT
  const requestedPage = Number.parseInt(single(sp.seite), 10)

  const now = new Date()
  const filters: Prisma.CouponWhereInput[] = []
  if (query.length > 0) {
    filters.push({
      OR: [{ code: { contains: query } }, { description: { contains: query } }],
    })
  }
  if (type.length > 0) filters.push({ type })
  if (state) filters.push(stateWhere(state, now))
  const where: Prisma.CouponWhereInput = filters.length > 0 ? { AND: filters } : {}

  const [total, couponCount] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.count(),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page =
    Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, totalPages) : 1

  const coupons = await prisma.coupon.findMany({
    where,
    orderBy: SORT_ORDERS[sort],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      code: true,
      description: true,
      type: true,
      value: true,
      minOrderValueCents: true,
      startsAt: true,
      endsAt: true,
      usageLimit: true,
      usageCount: true,
      active: true,
    },
  })

  const baseParams: Record<string, string> = {}
  if (query.length > 0) baseParams.q = query
  if (type.length > 0) baseParams.art = type
  if (state) baseParams.zustand = state
  if (sort !== DEFAULT_SORT) baseParams.sortierung = sort

  function href(overrides: Record<string, string | number | null>): string {
    const params = new URLSearchParams(baseParams)
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, String(value))
    }
    const search = params.toString()
    return search.length > 0 ? `/admin/gutscheine?${search}` : '/admin/gutscheine'
  }

  function sortHref(ascending: SortKey, descending: SortKey): string {
    const next = sort === ascending ? descending : ascending
    return href({ sortierung: next === DEFAULT_SORT ? null : next, seite: null })
  }

  const filtered = query.length > 0 || type.length > 0 || state !== null

  return (
    <div>
      <AdminPageHeader
        title="Gutscheine"
        description="Rabattcodes anlegen, befristen und auswerten. Geprüft wird jeder Code beim Einlösen erneut."
        count={total}
        countLabel={total === 1 ? 'Gutschein' : 'Gutscheine'}
        actions={
          canWrite ? (
            <ButtonLink href="/admin/gutscheine/neu" size="sm">
              <Plus className="size-4" aria-hidden="true" />
              Gutschein anlegen
            </ButtonLink>
          ) : undefined
        }
      />

      <AdminFilterBar
        searchPlaceholder="Code oder Beschreibung …"
        selects={[
          {
            name: 'art',
            label: 'Art',
            allLabel: 'Alle Arten',
            options: COUPON_TYPES.map((option) => ({
              value: option,
              label: COUPON_TYPE_LABELS[option],
            })),
          },
          {
            name: 'zustand',
            label: 'Zustand',
            allLabel: 'Alle Zustände',
            options: COUPON_STATES.map((option) => ({
              value: option,
              label: COUPON_STATE_LABELS[option],
            })),
          },
        ]}
      />

      {coupons.length === 0 ? (
        couponCount === 0 ? (
          <EmptyState
            icon={<BadgePercent className="size-5" aria-hidden="true" />}
            title="Noch keine Gutscheine angelegt"
            description="Legen Sie den ersten Rabattcode an. Er wirkt erst, wenn er aktiv und im Gültigkeitszeitraum ist."
            action={canWrite ? { label: 'Gutschein anlegen', href: '/admin/gutscheine/neu' } : undefined}
          />
        ) : (
          <EmptyState
            icon={<SearchX className="size-5" aria-hidden="true" />}
            title="Keine Treffer"
            description="Zu dieser Suche und diesen Filtern gibt es keinen Gutschein. Ändern Sie die Filter oder setzen Sie sie zurück."
            action={filtered ? { label: 'Filter zurücksetzen', href: '/admin/gutscheine' } : undefined}
          />
        )
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[72rem]">
              <caption className="sr-only">
                Gutscheine, Seite {page} von {totalPages}
              </caption>
              <Thead>
                <Tr>
                  <SortableTh
                    label="Code"
                    href={sortHref('code-asc', 'code-desc')}
                    active={sort === 'code-asc' || sort === 'code-desc'}
                    direction={sort === 'code-desc' ? 'desc' : 'asc'}
                  />
                  <Th>Beschreibung</Th>
                  <Th>Art</Th>
                  <Th align="right">Wert</Th>
                  <Th align="right">Mindestbestellwert</Th>
                  <SortableTh
                    label="Nutzung"
                    align="right"
                    href={sortHref('nutzung-desc', 'nutzung-asc')}
                    active={sort === 'nutzung-asc' || sort === 'nutzung-desc'}
                    direction={sort === 'nutzung-asc' ? 'asc' : 'desc'}
                  />
                  <SortableTh
                    label="Gültigkeit"
                    href={sortHref('ende-asc', 'ende-desc')}
                    active={sort === 'ende-asc' || sort === 'ende-desc'}
                    direction={sort === 'ende-desc' ? 'desc' : 'asc'}
                  />
                  <Th>Zustand</Th>
                  <Th align="right">Aktionen</Th>
                </Tr>
              </Thead>
              <Tbody>
                {coupons.map((coupon) => {
                  const currentState = couponState(coupon, now)
                  const couponType = coupon.type as CouponType
                  return (
                    <Tr key={coupon.id}>
                      <Td>
                        <Link
                          href={`/admin/gutscheine/${coupon.id}`}
                          className="tabular font-semibold text-ink hover:text-[var(--accent)]"
                        >
                          {coupon.code}
                        </Link>
                      </Td>

                      <Td className="max-w-[18rem] text-sm">
                        {coupon.description ? (
                          <span className="line-clamp-2">{coupon.description}</span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </Td>

                      <Td className="text-sm whitespace-nowrap">
                        {COUPON_TYPE_LABELS[couponType] ?? coupon.type}
                      </Td>

                      <Td align="right" className="tabular font-medium text-ink whitespace-nowrap">
                        {formatCouponValue(couponType, coupon.value)}
                      </Td>

                      <Td align="right" className="tabular whitespace-nowrap">
                        {coupon.minOrderValueCents > 0 ? (
                          formatPrice(coupon.minOrderValueCents)
                        ) : (
                          <span className="text-ink-faint">ohne</span>
                        )}
                      </Td>

                      <Td align="right" className="tabular whitespace-nowrap">
                        {coupon.usageLimit > 0 ? (
                          <>
                            {formatNumber(coupon.usageCount)} von {formatNumber(coupon.usageLimit)}
                          </>
                        ) : (
                          <>
                            {formatNumber(coupon.usageCount)}{' '}
                            <span className="text-ink-faint">ohne Limit</span>
                          </>
                        )}
                      </Td>

                      <Td className="text-sm whitespace-nowrap">
                        <ValidityCell startsAt={coupon.startsAt} endsAt={coupon.endsAt} />
                      </Td>

                      <Td>
                        <Badge tone={COUPON_STATE_TONES[currentState]}>
                          {COUPON_STATE_LABELS[currentState]}
                        </Badge>
                      </Td>

                      <Td align="right">
                        <CouponRowActions
                          couponId={coupon.id}
                          code={coupon.code}
                          active={coupon.active}
                          canWrite={canWrite}
                        />
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          </TableWrap>

          <p className="mt-4 text-center text-xs text-ink-muted" aria-live="polite">
            {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + coupons.length} von {total}{' '}
            {total === 1 ? 'Gutschein' : 'Gutscheinen'}
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

/** Zeitraum in einer Zeile; fehlende Grenzen werden ausgeschrieben. */
function ValidityCell({ startsAt, endsAt }: { startsAt: Date | null; endsAt: Date | null }) {
  if (!startsAt && !endsAt) return <span className="text-ink-faint">unbefristet</span>
  if (startsAt && endsAt) {
    return (
      <span className="tabular">
        {formatDate(startsAt)} – {formatDate(endsAt)}
      </span>
    )
  }
  if (startsAt) return <span className="tabular">ab {formatDate(startsAt)}</span>
  return <span className="tabular">bis {formatDate(endsAt as Date)}</span>
}
