import type { Metadata } from 'next'
import Link from 'next/link'
import { Users, UserSearch } from 'lucide-react'
import { prisma, type Prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber, formatPrice } from '@/lib/money'
import { formatDate, parseTags } from '@/lib/utils/text'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Kunden', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const SORT_ORDERS = {
  'name-asc': [{ lastName: 'asc' }, { firstName: 'asc' }],
  'name-desc': [{ lastName: 'desc' }, { firstName: 'desc' }],
  'umsatz-asc': [{ totalSpentCents: 'asc' }, { lastName: 'asc' }],
  'umsatz-desc': [{ totalSpentCents: 'desc' }, { lastName: 'asc' }],
  'bestellungen-asc': [{ orderCount: 'asc' }, { lastName: 'asc' }],
  'bestellungen-desc': [{ orderCount: 'desc' }, { lastName: 'asc' }],
  'letzte-asc': [{ lastOrderAt: 'asc' }, { lastName: 'asc' }],
  'letzte-desc': [{ lastOrderAt: 'desc' }, { lastName: 'asc' }],
} satisfies Record<string, Prisma.CustomerOrderByWithRelationInput[]>

type SortKey = keyof typeof SORT_ORDERS
/** Zuletzt aktive Kundschaft zuerst — das ist die Sicht, die im Alltag zählt. */
const DEFAULT_SORT: SortKey = 'letzte-desc'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/**
 * Tags liegen als kommaseparierte Zeichenkette in einer Spalte. Ein einfaches
 * `contains` wuerde auch Teiltreffer liefern („privat“ in „privatkunde“),
 * deshalb wird der Tag mitsamt seiner Trennzeichen gesucht — mit und ohne
 * Leerzeichen nach dem Komma, weil beide Schreibweisen im Bestand vorkommen.
 */
function tagFilter(tag: string): Prisma.CustomerWhereInput {
  return {
    OR: [
      { tags: tag },
      { tags: { startsWith: `${tag},` } },
      { tags: { endsWith: `,${tag}` } },
      { tags: { endsWith: `, ${tag}` } },
      { tags: { contains: `,${tag},` } },
      { tags: { contains: `, ${tag},` } },
    ],
  }
}

/**
 * Kundenliste der Verwaltung.
 *
 * Suche, Filter, Sortierung und Seite stehen vollstaendig in der URL: eine
 * gefilterte Ansicht ist damit teilbar, die Zurueck-Taste funktioniert, und die
 * Seite kommt ohne Client-Zustand aus.
 */
export default async function AdminCustomersPage({ searchParams }: PageProps) {
  await requirePermission('customers:read')
  const sp = await searchParams

  const query = single(sp.q).slice(0, 80)
  const tag = single(sp.tag).slice(0, 40)
  const sortParam = single(sp.sortierung)
  const sort: SortKey = sortParam in SORT_ORDERS ? (sortParam as SortKey) : DEFAULT_SORT
  const requestedPage = Number.parseInt(single(sp.seite), 10)

  const filters: Prisma.CustomerWhereInput[] = []
  if (query.length > 0) {
    filters.push({
      OR: [
        { customerNumber: { contains: query } },
        { firstName: { contains: query } },
        { lastName: { contains: query } },
        { company: { contains: query } },
        { email: { contains: query } },
      ],
    })
  }
  if (tag.length > 0) filters.push(tagFilter(tag))
  const where: Prisma.CustomerWhereInput = filters.length > 0 ? { AND: filters } : {}

  const [total, customerCount, tagRows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.count(),
    prisma.customer.findMany({ where: { NOT: { tags: '' } }, select: { tags: true }, distinct: ['tags'] }),
  ])

  const tagOptions = [...new Set(tagRows.flatMap((row) => parseTags(row.tags)))].sort((a, b) =>
    a.localeCompare(b, 'de-DE'),
  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page =
    Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, totalPages) : 1

  const customers = await prisma.customer.findMany({
    where,
    orderBy: SORT_ORDERS[sort],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      customerNumber: true,
      firstName: true,
      lastName: true,
      company: true,
      email: true,
      tags: true,
      orderCount: true,
      totalSpentCents: true,
      lastOrderAt: true,
      addresses: {
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: { postalCode: true, city: true },
      },
      // Rueckfallebene fuer den Ort, solange noch keine Anschrift gepflegt ist:
      // die Anschrift der letzten Bestellung.
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { postalCode: true, city: true },
      },
    },
  })

  const baseParams: Record<string, string> = {}
  if (query.length > 0) baseParams.q = query
  if (tag.length > 0) baseParams.tag = tag
  if (sort !== DEFAULT_SORT) baseParams.sortierung = sort

  function href(overrides: Record<string, string | number | null>): string {
    const params = new URLSearchParams(baseParams)
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, String(value))
    }
    const search = params.toString()
    return search.length > 0 ? `/admin/kunden?${search}` : '/admin/kunden'
  }

  function sortHref(ascending: SortKey, descending: SortKey): string {
    const next = sort === ascending ? descending : ascending
    return href({ sortierung: next === DEFAULT_SORT ? null : next, seite: null })
  }

  const filtered = query.length > 0 || tag.length > 0

  return (
    <div>
      <AdminPageHeader
        title="Kunden"
        description="Kundenakten mit Bestellhistorie, Kennzahlen und internen Notizen."
        count={total}
        countLabel={total === 1 ? 'Kunde' : 'Kunden'}
      />

      <AdminFilterBar
        searchPlaceholder="Name, Firma, E-Mail oder Kundennummer …"
        selects={[
          {
            name: 'tag',
            label: 'Tag',
            allLabel: 'Alle Tags',
            options: tagOptions.map((option) => ({ value: option, label: option })),
          },
        ]}
      />

      {customers.length === 0 ? (
        customerCount === 0 ? (
          <EmptyState
            icon={<Users className="size-5" aria-hidden="true" />}
            title="Noch keine Kunden erfasst"
            description="Sobald die erste Bestellung eingeht, wird die zugehörige Kundenakte automatisch angelegt."
          />
        ) : (
          <EmptyState
            icon={<UserSearch className="size-5" aria-hidden="true" />}
            title="Keine Treffer"
            description="Zu dieser Suche und diesem Filter gibt es keine Kundenakte. Ändern Sie die Angaben oder setzen Sie den Filter zurück."
            action={filtered ? { label: 'Filter zurücksetzen', href: '/admin/kunden' } : undefined}
          />
        )
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[64rem]">
              <caption className="sr-only">
                Kunden, Seite {page} von {totalPages}
              </caption>
              <Thead>
                <Tr>
                  <Th>Kundennummer</Th>
                  <SortableTh
                    label="Name / Firma"
                    href={sortHref('name-asc', 'name-desc')}
                    active={sort === 'name-asc' || sort === 'name-desc'}
                    direction={sort === 'name-desc' ? 'desc' : 'asc'}
                  />
                  <Th>E-Mail</Th>
                  <Th>Ort</Th>
                  <SortableTh
                    label="Bestellungen"
                    align="right"
                    href={sortHref('bestellungen-desc', 'bestellungen-asc')}
                    active={sort === 'bestellungen-asc' || sort === 'bestellungen-desc'}
                    direction={sort === 'bestellungen-asc' ? 'asc' : 'desc'}
                  />
                  <SortableTh
                    label="Gesamtumsatz"
                    align="right"
                    href={sortHref('umsatz-desc', 'umsatz-asc')}
                    active={sort === 'umsatz-asc' || sort === 'umsatz-desc'}
                    direction={sort === 'umsatz-asc' ? 'asc' : 'desc'}
                  />
                  <SortableTh
                    label="Letzte Bestellung"
                    href={sortHref('letzte-desc', 'letzte-asc')}
                    active={sort === 'letzte-asc' || sort === 'letzte-desc'}
                    direction={sort === 'letzte-asc' ? 'asc' : 'desc'}
                  />
                  <Th>Tags</Th>
                </Tr>
              </Thead>
              <Tbody>
                {customers.map((customer) => {
                  const place = customer.addresses[0] ?? customer.orders[0] ?? null
                  const tags = parseTags(customer.tags)
                  return (
                    <Tr key={customer.id}>
                      <Td>
                        <Link
                          href={`/admin/kunden/${customer.id}`}
                          className="tabular font-medium text-ink hover:text-[var(--accent)]"
                        >
                          {customer.customerNumber}
                        </Link>
                      </Td>

                      <Td>
                        <Link
                          href={`/admin/kunden/${customer.id}`}
                          className="font-medium text-ink hover:text-[var(--accent)]"
                        >
                          {customer.company ?? `${customer.firstName} ${customer.lastName}`}
                        </Link>
                        {customer.company && (
                          <span className="mt-0.5 block text-xs text-ink-faint">
                            {customer.firstName} {customer.lastName}
                          </span>
                        )}
                      </Td>

                      <Td>
                        <a
                          href={`mailto:${customer.email}`}
                          className="text-sm break-all hover:text-[var(--accent)]"
                        >
                          {customer.email}
                        </a>
                      </Td>

                      <Td className="text-sm whitespace-nowrap">
                        {place ? (
                          <>
                            <span className="tabular text-ink-faint">{place.postalCode}</span> {place.city}
                          </>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </Td>

                      <Td align="right" className="tabular">
                        {formatNumber(customer.orderCount)}
                      </Td>

                      <Td align="right" className="tabular font-medium text-ink">
                        {formatPrice(customer.totalSpentCents)}
                      </Td>

                      <Td className="text-sm whitespace-nowrap">
                        {customer.lastOrderAt ? (
                          formatDate(customer.lastOrderAt)
                        ) : (
                          <span className="text-ink-faint">Noch keine</span>
                        )}
                      </Td>

                      <Td>
                        {tags.length === 0 ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {tags.slice(0, 3).map((entry) => (
                              <Badge key={entry} tone="outline">
                                {entry}
                              </Badge>
                            ))}
                            {tags.length > 3 && (
                              <Badge tone="neutral">+{tags.length - 3}</Badge>
                            )}
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
            {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + customers.length} von {total}{' '}
            {total === 1 ? 'Kunde' : 'Kunden'}
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
