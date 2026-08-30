import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound, Plus, SearchX, ShieldCheck, UsersRound } from 'lucide-react'
import { prisma, type Prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatDateTime, formatRelative } from '@/lib/utils/text'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/page-header'
import { UserRowActions } from '@/components/admin/user-form'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Mitarbeitende', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const SORT_ORDERS = {
  'name-asc': [{ lastName: 'asc' }, { firstName: 'asc' }],
  'name-desc': [{ lastName: 'desc' }, { firstName: 'desc' }],
  'mail-asc': [{ email: 'asc' }],
  'mail-desc': [{ email: 'desc' }],
  'rolle-asc': [{ role: { name: 'asc' } }, { lastName: 'asc' }],
  'rolle-desc': [{ role: { name: 'desc' } }, { lastName: 'asc' }],
  'anmeldung-desc': [{ lastLoginAt: 'desc' }, { lastName: 'asc' }],
  'anmeldung-asc': [{ lastLoginAt: 'asc' }, { lastName: 'asc' }],
} satisfies Record<string, Prisma.UserOrderByWithRelationInput[]>

type SortKey = keyof typeof SORT_ORDERS
const DEFAULT_SORT: SortKey = 'name-asc'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/**
 * Mitarbeiterliste der Verwaltung.
 *
 * Suche, Filter, Sortierung und Seite stehen vollstaendig in der URL: eine
 * gefilterte Ansicht ist teilbar, und die Zurueck-Taste funktioniert.
 *
 * Die Schutzregeln stehen bewusst sichtbar ueber der Liste. Sie sind kein
 * Bedienhinweis, sondern beschreiben, was die API in jedem Fall durchsetzt —
 * auch dann, wenn eine Schaltflaeche sie gar nicht erst anbietet.
 */
export default async function AdminUsersPage({ searchParams }: PageProps) {
  const session = await requirePermission('users:read')
  const canWrite = session.user.permissions.includes('users:write')
  const canManageRoles = session.user.permissions.includes('roles:write')
  const sp = await searchParams

  const query = single(sp.q).slice(0, 80)
  const roleId = single(sp.rolle).slice(0, 64)
  const statusRaw = single(sp.status)
  const status = statusRaw === 'aktiv' || statusRaw === 'inaktiv' ? statusRaw : ''
  const sortParam = single(sp.sortierung)
  const sort: SortKey = sortParam in SORT_ORDERS ? (sortParam as SortKey) : DEFAULT_SORT
  const requestedPage = Number.parseInt(single(sp.seite), 10)

  const filters: Prisma.UserWhereInput[] = []
  if (query.length > 0) {
    filters.push({
      OR: [
        { firstName: { contains: query } },
        { lastName: { contains: query } },
        { email: { contains: query } },
      ],
    })
  }
  if (roleId.length > 0) filters.push({ roleId })
  if (status.length > 0) filters.push({ active: status === 'aktiv' })
  const where: Prisma.UserWhereInput = filters.length > 0 ? { AND: filters } : {}

  const [total, userCount, roles, administrators] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count(),
    prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { users: true } } },
    }),
    // Konten, die Mitarbeitende verwalten dürfen — die Zahl erklärt, warum das
    // letzte davon nicht deaktiviert werden kann.
    prisma.user.count({
      where: {
        active: true,
        role: { permissions: { some: { permission: { key: 'users:write' } } } },
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page =
    Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, totalPages) : 1

  const users = await prisma.user.findMany({
    where,
    orderBy: SORT_ORDERS[sort],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      role: { select: { id: true, name: true } },
    },
  })

  const baseParams: Record<string, string> = {}
  if (query.length > 0) baseParams.q = query
  if (roleId.length > 0) baseParams.rolle = roleId
  if (status.length > 0) baseParams.status = status
  if (sort !== DEFAULT_SORT) baseParams.sortierung = sort

  function href(overrides: Record<string, string | number | null>): string {
    const params = new URLSearchParams(baseParams)
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, String(value))
    }
    const search = params.toString()
    return search.length > 0 ? `/admin/mitarbeiter?${search}` : '/admin/mitarbeiter'
  }

  function sortHref(ascending: SortKey, descending: SortKey): string {
    const next = sort === ascending ? descending : ascending
    return href({ sortierung: next === DEFAULT_SORT ? null : next, seite: null })
  }

  const filtered = query.length > 0 || roleId.length > 0 || status.length > 0

  return (
    <div>
      <AdminPageHeader
        title="Mitarbeitende"
        description="Konten für den Verwaltungsbereich. Die Rolle bestimmt, welche Bereiche sichtbar und bedienbar sind."
        count={total}
        countLabel={total === 1 ? 'Konto' : 'Konten'}
        actions={
          <>
            {canManageRoles && (
              <ButtonLink href="/admin/mitarbeiter/rollen" variant="outline" size="sm">
                <KeyRound className="size-4" aria-hidden="true" />
                Rollen und Rechte
              </ButtonLink>
            )}
            {canWrite && (
              <ButtonLink href="/admin/mitarbeiter/neu" size="sm">
                <Plus className="size-4" aria-hidden="true" />
                Konto anlegen
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck className="size-4 text-ink-muted" aria-hidden="true" />
          Schutzregeln dieser Verwaltung
        </h2>
        <ul className="mt-2 grid gap-1.5 text-sm leading-relaxed text-ink-muted sm:grid-cols-2">
          <li>Das eigene Konto lässt sich weder deaktivieren noch löschen.</li>
          <li>Die eigene Rolle lässt sich nicht ändern — niemand stuft sich selbst herauf.</li>
          <li>
            Deaktivierung und Rollenwechsel beenden sofort alle Sitzungen des betroffenen Kontos.
          </li>
          <li>
            Derzeit dürfen {administrators} {administrators === 1 ? 'Konto' : 'Konten'} Mitarbeitende
            verwalten; das letzte davon kann nicht deaktiviert werden.
          </li>
        </ul>
      </div>

      <AdminFilterBar
        searchPlaceholder="Name oder E-Mail-Adresse …"
        selects={[
          {
            name: 'rolle',
            label: 'Rolle',
            allLabel: 'Alle Rollen',
            options: roles.map((role) => ({
              value: role.id,
              label: `${role.name} (${role._count.users})`,
            })),
          },
          {
            name: 'status',
            label: 'Status',
            allLabel: 'Alle Zustände',
            options: [
              { value: 'aktiv', label: 'Aktiv' },
              { value: 'inaktiv', label: 'Deaktiviert' },
            ],
          },
        ]}
      />

      {users.length === 0 ? (
        userCount === 0 ? (
          <EmptyState
            icon={<UsersRound className="size-5" aria-hidden="true" />}
            title="Noch keine Mitarbeiterkonten"
            description="Legen Sie das erste Konto an. Jede Person arbeitet mit einem eigenen Zugang — nur so bleiben Buchungen und Protokoll nachvollziehbar."
            action={canWrite ? { label: 'Konto anlegen', href: '/admin/mitarbeiter/neu' } : undefined}
          />
        ) : (
          <EmptyState
            icon={<SearchX className="size-5" aria-hidden="true" />}
            title="Keine Treffer"
            description="Zu dieser Suche und diesen Filtern gibt es kein Konto. Ändern Sie die Filter oder setzen Sie sie zurück."
            action={filtered ? { label: 'Filter zurücksetzen', href: '/admin/mitarbeiter' } : undefined}
          />
        )
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[60rem]">
              <caption className="sr-only">
                Mitarbeiterkonten, Seite {page} von {totalPages}
              </caption>
              <Thead>
                <Tr>
                  <SortableTh
                    label="Name"
                    href={sortHref('name-asc', 'name-desc')}
                    active={sort === 'name-asc' || sort === 'name-desc'}
                    direction={sort === 'name-desc' ? 'desc' : 'asc'}
                  />
                  <SortableTh
                    label="E-Mail"
                    href={sortHref('mail-asc', 'mail-desc')}
                    active={sort === 'mail-asc' || sort === 'mail-desc'}
                    direction={sort === 'mail-desc' ? 'desc' : 'asc'}
                  />
                  <SortableTh
                    label="Rolle"
                    href={sortHref('rolle-asc', 'rolle-desc')}
                    active={sort === 'rolle-asc' || sort === 'rolle-desc'}
                    direction={sort === 'rolle-desc' ? 'desc' : 'asc'}
                  />
                  <Th>Status</Th>
                  <SortableTh
                    label="Letzte Anmeldung"
                    href={sortHref('anmeldung-desc', 'anmeldung-asc')}
                    active={sort === 'anmeldung-asc' || sort === 'anmeldung-desc'}
                    direction={sort === 'anmeldung-asc' ? 'asc' : 'desc'}
                  />
                  <Th align="right">Aktionen</Th>
                </Tr>
              </Thead>
              <Tbody>
                {users.map((user) => {
                  const isSelf = user.id === session.user.id
                  const fullName = `${user.firstName} ${user.lastName}`
                  return (
                    <Tr key={user.id}>
                      <Td>
                        <Link
                          href={`/admin/mitarbeiter/${user.id}`}
                          className="font-medium text-ink hover:text-[var(--accent)]"
                        >
                          {fullName}
                        </Link>
                        {isSelf && (
                          <span className="ml-2 inline-flex align-middle">
                            <Badge tone="outline">Ihr Konto</Badge>
                          </span>
                        )}
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          angelegt {formatDateTime(user.createdAt)}
                        </span>
                      </Td>

                      <Td className="text-sm">
                        <a
                          href={`mailto:${user.email}`}
                          className="break-all hover:text-[var(--accent)]"
                        >
                          {user.email}
                        </a>
                      </Td>

                      <Td className="text-sm whitespace-nowrap">{user.role.name}</Td>

                      <Td>
                        {user.active ? (
                          <Badge tone="success">Aktiv</Badge>
                        ) : (
                          <Badge tone="steel">Deaktiviert</Badge>
                        )}
                      </Td>

                      <Td>
                        {user.lastLoginAt ? (
                          <>
                            <span className="tabular block text-sm whitespace-nowrap">
                              {formatDateTime(user.lastLoginAt)}
                            </span>
                            <span className="block text-xs text-ink-faint">
                              {formatRelative(user.lastLoginAt)}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-ink-faint">noch nie angemeldet</span>
                        )}
                      </Td>

                      <Td align="right">
                        <UserRowActions
                          userId={user.id}
                          name={fullName}
                          active={user.active}
                          isSelf={isSelf}
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
            {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + users.length} von {total}{' '}
            {total === 1 ? 'Konto' : 'Konten'}
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
