import type { Metadata } from 'next'
import Link from 'next/link'
import { ScrollText, SearchX, ShieldCheck } from 'lucide-react'
import { prisma, type Prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { SETTING_KEYS } from '@/lib/server/settings'
import { formatNumber } from '@/lib/money'
import { formatDateTime, formatRelative, truncate } from '@/lib/utils/text'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/page-header'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Protokoll', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/** Auswahl der Zeitraeume. `hours` haelt die Grenze in Stunden. */
const PERIODS = [
  { value: '1', label: 'Letzte 24 Stunden', hours: 24 },
  { value: '7', label: 'Letzte 7 Tage', hours: 24 * 7 },
  { value: '30', label: 'Letzte 30 Tage', hours: 24 * 30 },
  { value: '90', label: 'Letzte 90 Tage', hours: 24 * 90 },
  { value: '365', label: 'Letzte 12 Monate', hours: 24 * 365 },
] as const

/**
 * Klartext zu den protokollierten Aktionen.
 * Unbekannte Schluessel werden lesbar aufbereitet statt verschwiegen — so
 * bleibt auch eine spaeter ergaenzte Aktion sichtbar.
 */
const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Anmeldung',
  'user.created': 'Konto angelegt',
  'user.updated': 'Konto geändert',
  'user.activated': 'Konto aktiviert',
  'user.deactivated': 'Konto deaktiviert',
  'user.deleted': 'Konto gelöscht',
  'user.password_changed': 'Passwort gesetzt',
  'user.sessions_revoked': 'Sitzungen beendet',
  'role.permissions_changed': 'Rechte einer Rolle geändert',
  'role.deleted': 'Rolle gelöscht',
  'season.updated': 'Saison und Banner geändert',
  'coupon.created': 'Gutschein angelegt',
  'coupon.updated': 'Gutschein geändert',
  'coupon.activated': 'Gutschein aktiviert',
  'coupon.deactivated': 'Gutschein deaktiviert',
  'coupon.deleted': 'Gutschein gelöscht',
  'product.created': 'Produkt angelegt',
  'product.updated': 'Produkt geändert',
  'product.duplicated': 'Produkt dupliziert',
  'product.deleted': 'Produkt gelöscht',
  'order.status_changed': 'Bestellstatus geändert',
  'order.cancelled': 'Bestellung storniert',
  'order.payment_changed': 'Zahlungsstatus geändert',
  'order.refunded': 'Erstattung erfasst',
  'customer.notes_updated': 'Kundennotiz geändert',
  'inventory.stock_set': 'Bestand gebucht',
  'inventory.bulk_adjusted': 'Bestände gesammelt gebucht',
  'inventory.threshold_set': 'Meldegrenze geändert',
  'support.status_changed': 'Supportanfrage bearbeitet',
  'project.status_changed': 'Sonderanfertigung bearbeitet',
  'project.note_updated': 'Notiz zur Sonderanfertigung geändert',
  'project.attachment_downloaded': 'Anhang heruntergeladen',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, ' · ')
}

/** Farbe nach Wirkung: Anlegen gruen, Entfernen rot, alles Weitere neutral. */
function actionTone(action: string): BadgeTone {
  if (/(deleted|cancelled|deactivated|revoked)$/.test(action)) return 'danger'
  if (/(created|activated|duplicated)$/.test(action)) return 'success'
  if (action.startsWith('auth.')) return 'steel'
  if (action.startsWith('user.') || action.startsWith('role.')) return 'warning'
  return 'outline'
}

const ENTITY_LABELS: Record<string, string> = {
  User: 'Mitarbeitendes Konto',
  Role: 'Rolle',
  Setting: 'Einstellung',
  Order: 'Bestellung',
  Product: 'Produkt',
  Coupon: 'Gutschein',
  Customer: 'Kunde',
  SupportRequest: 'Supportanfrage',
  CustomProject: 'Sonderanfertigung',
  ProjectAttachment: 'Anhang',
  Recipe: 'Rezept',
}

/**
 * Datensatzarten, die unten nachgeschlagen werden. Nur bei diesen darf die
 * Liste behaupten, ein Datensatz sei nicht mehr vorhanden — bei allen anderen
 * steht schlicht die Kennung, statt etwas Falsches zu behaupten.
 */
const RESOLVED_ENTITIES = new Set([
  'Order',
  'Product',
  'Coupon',
  'Customer',
  'SupportRequest',
  'CustomProject',
  'ProjectAttachment',
  'Recipe',
  'User',
  'Role',
  'Setting',
])

/**
 * Betriebseinstellungen tragen ihren Schluessel als Datensatzkennung; er wird
 * hier in Klartext uebersetzt, statt als technischer Wert zu erscheinen.
 */
const SETTING_LABELS: Record<string, string> = {
  [SETTING_KEYS.seasonalTheme]: 'Saisonmodus und Banner',
  [SETTING_KEYS.bannerText]: 'Bannertext',
  [SETTING_KEYS.bannerLink]: 'Bannerlink',
  [SETTING_KEYS.bannerActive]: 'Banner sichtbar',
}

/** Deutsche Beschriftung der haeufigsten Detailfelder. */
const DETAIL_LABELS: Record<string, string> = {
  code: 'Code',
  email: 'E-Mail',
  name: 'Name',
  role: 'Rolle',
  previousRole: 'vorher',
  changed: 'geändert',
  active: 'aktiv',
  self: 'eigenes Konto',
  sessions: 'Sitzungen',
  added: 'erteilt',
  removed: 'entzogen',
  theme: 'Modus',
  previousTheme: 'vorher',
  bannerActive: 'Banner sichtbar',
  bannerText: 'Bannertext',
  bannerLink: 'Bannerlink',
  status: 'Status',
  previousStatus: 'vorher',
  paymentStatus: 'Zahlung',
  note: 'Notiz',
  reason: 'Grund',
  delta: 'Veränderung',
  stock: 'Bestand',
  quantity: 'Menge',
  sku: 'SKU',
  slug: 'URL-Pfad',
  type: 'Art',
  value: 'Wert',
  usageLimit: 'Nutzungslimit',
  amountCents: 'Betrag (Cent)',
  count: 'Anzahl',
  intent: 'Vorgang',
  ticketNumber: 'Ticket',
  orderNumber: 'Bestellung',
  priority: 'Priorität',
  threshold: 'Meldegrenze',
  previousCode: 'vorher',
}

/** Ein Detailwert als kurzer Text; nichts wird erfunden, nur gekuerzt. */
function detailValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'ja' : 'nein'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.length === 0 ? '—' : truncate(value, 60)
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return truncate(value.map((entry) => String(entry)).join(', '), 80)
  }
  return truncate(JSON.stringify(value), 60)
}

function parseDetail(detail: string | null): Array<{ label: string; value: string }> {
  if (!detail) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(detail)
  } catch {
    return [{ label: 'Angaben', value: truncate(detail, 80) }]
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const single = detailValue(parsed)
    return single ? [{ label: 'Angaben', value: single }] : []
  }
  const rows: Array<{ label: string; value: string }> = []
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const text = detailValue(value)
    if (text === null) continue
    rows.push({ label: DETAIL_LABELS[key] ?? key, value: text })
  }
  return rows
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

interface EntityReference {
  label: string
  href: string | null
}

/**
 * Protokoll aller sicherheitsrelevanten Aenderungen.
 *
 * Die Eintraege werden nie veraendert oder geloescht — sie sind der Beleg
 * dafuer, wer wann was getan hat. Verlinkt wird nur, was es noch gibt und was
 * die anmeldende Person auch sehen darf; ein toter oder unerlaubter Link waere
 * schlechter als reiner Text.
 */
export default async function AuditLogPage({ searchParams }: PageProps) {
  const session = await requirePermission('audit:read')
  const permissions = session.user.permissions
  const sp = await searchParams

  const query = single(sp.q).slice(0, 80)
  const editor = single(sp.bearbeiter).slice(0, 64)
  const action = single(sp.aktion).slice(0, 80)
  const periodRaw = single(sp.zeitraum)
  const period = PERIODS.find((entry) => entry.value === periodRaw)?.value ?? ''
  const direction: 'asc' | 'desc' = single(sp.richtung) === 'asc' ? 'asc' : 'desc'
  const pageRaw = Number.parseInt(single(sp.seite), 10)
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1

  const filters: Prisma.AuditLogWhereInput[] = []
  if (query.length > 0) {
    filters.push({
      OR: [
        { action: { contains: query } },
        { entity: { contains: query } },
        { entityId: { contains: query } },
        { detail: { contains: query } },
      ],
    })
  }
  if (editor === 'system') filters.push({ userId: null })
  else if (editor.length > 0) filters.push({ userId: editor })
  if (action.length > 0) filters.push({ action })
  const hours = PERIODS.find((entry) => entry.value === period)?.hours
  if (hours) filters.push({ createdAt: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) } })
  const where: Prisma.AuditLogWhereInput = filters.length > 0 ? { AND: filters } : {}

  const [total, logSize, editors, systemCount, actionRows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count(),
    prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.auditLog.count({ where: { userId: null } }),
    prisma.auditLog.groupBy({ by: ['action'], _count: { action: true }, orderBy: { action: 'asc' } }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: direction }, { id: direction }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      action: true,
      entity: true,
      entityId: true,
      detail: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  // --- Verlinkung der betroffenen Datensätze -------------------------------
  const idsFor = (entity: string): string[] => [
    ...new Set(
      entries
        .filter((entry) => entry.entity === entity && entry.entityId !== null)
        .map((entry) => entry.entityId as string),
    ),
  ]

  const orderIds = idsFor('Order')
  const productIds = idsFor('Product')
  const couponIds = idsFor('Coupon')
  const customerIds = idsFor('Customer')
  const supportIds = idsFor('SupportRequest')
  const projectIds = idsFor('CustomProject')
  const attachmentIds = idsFor('ProjectAttachment')
  const recipeIds = idsFor('Recipe')
  const userIds = idsFor('User')
  const roleIds = idsFor('Role')

  const [
    orders,
    products,
    coupons,
    customers,
    supportRequests,
    projects,
    attachments,
    recipes,
    users,
    roles,
  ] = await Promise.all([
      orderIds.length > 0
        ? prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        : [],
      productIds.length > 0
        ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
        : [],
      couponIds.length > 0
        ? prisma.coupon.findMany({ where: { id: { in: couponIds } }, select: { id: true, code: true } })
        : [],
      customerIds.length > 0
        ? prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, firstName: true, lastName: true, customerNumber: true },
          })
        : [],
      supportIds.length > 0
        ? prisma.supportRequest.findMany({
            where: { id: { in: supportIds } },
            select: { id: true, ticketNumber: true, subject: true },
          })
        : [],
      projectIds.length > 0
        ? prisma.customProject.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, projectNumber: true, projectName: true },
          })
        : [],
      attachmentIds.length > 0
        ? prisma.projectAttachment.findMany({
            where: { id: { in: attachmentIds } },
            select: { id: true, originalName: true, projectId: true },
          })
        : [],
      recipeIds.length > 0
        ? prisma.recipe.findMany({ where: { id: { in: recipeIds } }, select: { id: true, title: true } })
        : [],
      userIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
      roleIds.length > 0
        ? prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })
        : [],
    ])

  const references = new Map<string, EntityReference>()
  const register = (entity: string, id: string, label: string, href: string | null) => {
    references.set(`${entity}:${id}`, { label, href })
  }
  const may = (permission: string) => permissions.includes(permission)

  for (const order of orders) {
    register(
      'Order',
      order.id,
      order.orderNumber,
      may('orders:read') ? `/admin/bestellungen/${order.orderNumber}` : null,
    )
  }
  for (const product of products) {
    register('Product', product.id, product.name, may('products:read') ? `/admin/produkte/${product.id}` : null)
  }
  for (const coupon of coupons) {
    register('Coupon', coupon.id, coupon.code, may('coupons:read') ? `/admin/gutscheine/${coupon.id}` : null)
  }
  for (const customer of customers) {
    register(
      'Customer',
      customer.id,
      `${customer.firstName} ${customer.lastName} (${customer.customerNumber})`,
      may('customers:read') ? `/admin/kunden/${customer.id}` : null,
    )
  }
  for (const request of supportRequests) {
    register(
      'SupportRequest',
      request.id,
      `${request.ticketNumber} · ${truncate(request.subject, 40)}`,
      may('support:read') ? `/admin/support/${request.id}` : null,
    )
  }
  for (const project of projects) {
    register(
      'CustomProject',
      project.id,
      `${project.projectNumber} · ${truncate(project.projectName, 40)}`,
      may('projects:read') ? `/admin/projekte/${project.id}` : null,
    )
  }
  for (const attachment of attachments) {
    register(
      'ProjectAttachment',
      attachment.id,
      attachment.originalName,
      may('projects:read') ? `/admin/projekte/${attachment.projectId}` : null,
    )
  }
  // Rezepte werden nicht verlinkt: Die Redaktionsansicht liegt außerhalb
  // dieses Bereichs, der Titel genügt zur Einordnung.
  for (const recipe of recipes) {
    register('Recipe', recipe.id, recipe.title, null)
  }
  for (const user of users) {
    register(
      'User',
      user.id,
      `${user.firstName} ${user.lastName}`,
      may('users:read') ? `/admin/mitarbeiter/${user.id}` : null,
    )
  }
  for (const role of roles) {
    register('Role', role.id, role.name, may('roles:write') ? '/admin/mitarbeiter/rollen' : null)
  }
  // Einstellungen stehen nicht in einer eigenen Tabelle mit Namen; ihr
  // Schluessel ist zugleich die Kennung und wird direkt uebersetzt.
  for (const entry of entries) {
    if (entry.entity !== 'Setting' || entry.entityId === null) continue
    register(
      'Setting',
      entry.entityId,
      SETTING_LABELS[entry.entityId] ?? entry.entityId,
      may('marketing:write') ? '/admin/saison' : null,
    )
  }

  function href(overrides: Record<string, string | number | null>): string {
    const values: Record<string, string> = {
      q: query,
      bearbeiter: editor,
      aktion: action,
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
    return search.length > 0 ? `/admin/protokoll?${search}` : '/admin/protokoll'
  }

  const hasFilters =
    query.length > 0 || editor.length > 0 || action.length > 0 || period.length > 0

  const editorOptions = [
    ...editors.map((user) => ({ value: user.id, label: `${user.lastName}, ${user.firstName}` })),
    ...(systemCount > 0 ? [{ value: 'system', label: 'System (ohne Konto)' }] : []),
  ]

  return (
    <div>
      <AdminPageHeader
        title="Protokoll"
        description="Chronologische Aufzeichnung aller sicherheitsrelevanten Änderungen in der Verwaltung. Einträge werden weder geändert noch gelöscht."
        count={total}
        countLabel={total === 1 ? 'Eintrag' : 'Einträge'}
      />

      <p className="mb-5 flex items-start gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4 text-sm leading-relaxed text-ink-soft">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span>
          Zu jedem Eintrag wird die IP-Adresse ausschließlich pseudonymisiert gespeichert: als
          gesalzener Hash, der sich nicht in eine Adresse zurückrechnen lässt. Deshalb erscheint hier
          keine IP-Adresse. Gespeichert bleiben Zeitpunkt, Konto, Aktion und der betroffene Datensatz.
        </span>
      </p>

      <AdminFilterBar
        searchPlaceholder="Aktion, Datensatz oder Detail …"
        selects={[
          {
            name: 'bearbeiter',
            label: 'Bearbeiter',
            allLabel: 'Alle Bearbeiter',
            options: editorOptions,
          },
          {
            name: 'aktion',
            label: 'Aktion',
            allLabel: 'Alle Aktionen',
            options: actionRows.map((row) => ({
              value: row.action,
              label: `${actionLabel(row.action)} (${row._count.action})`,
            })),
          },
          {
            name: 'zeitraum',
            label: 'Zeitraum',
            allLabel: 'Zeitraum: gesamt',
            options: PERIODS.map((entry) => ({ value: entry.value, label: entry.label })),
          },
        ]}
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={
            logSize === 0 ? (
              <ScrollText className="size-5" aria-hidden="true" />
            ) : (
              <SearchX className="size-5" aria-hidden="true" />
            )
          }
          title={logSize === 0 ? 'Noch keine Einträge' : 'Kein Eintrag passt zur Auswahl'}
          description={
            logSize === 0
              ? 'Sobald in der Verwaltung etwas geändert wird, erscheint der Vorgang hier.'
              : 'Ändern Sie die Suche oder setzen Sie die Filter zurück, um wieder alle Einträge zu sehen.'
          }
          action={hasFilters ? { label: 'Filter zurücksetzen', href: '/admin/protokoll' } : undefined}
        />
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[68rem]">
              <caption className="sr-only">
                Protokolleinträge, Seite {page} von {totalPages}
              </caption>
              <Thead>
                <Tr>
                  <SortableTh
                    label="Zeitpunkt"
                    href={href({ richtung: direction === 'desc' ? 'asc' : null, seite: null })}
                    active
                    direction={direction}
                  />
                  <Th>Bearbeiter</Th>
                  <Th>Aktion</Th>
                  <Th>Betroffener Datensatz</Th>
                  <Th>Details</Th>
                </Tr>
              </Thead>
              <Tbody>
                {entries.map((entry) => {
                  const reference =
                    entry.entityId !== null
                      ? (references.get(`${entry.entity}:${entry.entityId}`) ?? null)
                      : null
                  const details = parseDetail(entry.detail)

                  return (
                    <Tr key={entry.id}>
                      <Td>
                        <span className="tabular block text-sm whitespace-nowrap">
                          {formatDateTime(entry.createdAt)}
                        </span>
                        <span className="block text-xs text-ink-faint">
                          {formatRelative(entry.createdAt)}
                        </span>
                      </Td>

                      <Td className="text-sm whitespace-nowrap">
                        {entry.user ? (
                          may('users:read') ? (
                            <Link
                              href={`/admin/mitarbeiter/${entry.user.id}`}
                              className="font-medium text-ink hover:text-[var(--accent)]"
                            >
                              {entry.user.firstName} {entry.user.lastName}
                            </Link>
                          ) : (
                            <span className="font-medium text-ink">
                              {entry.user.firstName} {entry.user.lastName}
                            </span>
                          )
                        ) : (
                          <span className="text-ink-faint">System</span>
                        )}
                      </Td>

                      <Td>
                        <Badge tone={actionTone(entry.action)}>{actionLabel(entry.action)}</Badge>
                      </Td>

                      <Td className="text-sm">
                        <span className="block text-xs text-ink-faint">
                          {ENTITY_LABELS[entry.entity] ?? entry.entity}
                        </span>
                        {reference ? (
                          reference.href ? (
                            <Link
                              href={reference.href}
                              className="font-medium text-ink hover:text-[var(--accent)]"
                            >
                              {reference.label}
                            </Link>
                          ) : (
                            <span className="font-medium text-ink">{reference.label}</span>
                          )
                        ) : entry.entityId ? (
                          RESOLVED_ENTITIES.has(entry.entity) ? (
                            <span className="text-ink-muted">
                              nicht mehr vorhanden
                              <span className="tabular ml-1 text-xs text-ink-faint">
                                {truncate(entry.entityId, 12)}
                              </span>
                            </span>
                          ) : (
                            <span className="tabular text-xs text-ink-muted">{entry.entityId}</span>
                          )
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </Td>

                      <Td className="text-sm">
                        {details.length === 0 ? (
                          <span className="text-ink-faint" aria-label="Keine weiteren Angaben">
                            —
                          </span>
                        ) : (
                          <span className="flex max-w-[26rem] flex-wrap gap-x-3 gap-y-0.5">
                            {details.map((row) => (
                              <span key={row.label} className="text-xs leading-relaxed text-ink-soft">
                                <span className="text-ink-faint">{row.label}:</span> {row.value}
                              </span>
                            ))}
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
            {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + entries.length} von{' '}
            {formatNumber(total)} {total === 1 ? 'Eintrag' : 'Einträgen'}
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
