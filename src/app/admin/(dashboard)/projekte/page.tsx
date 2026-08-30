import type { Metadata } from 'next'
import Link from 'next/link'
import { Paperclip, Ruler } from 'lucide-react'
import { prisma, type Prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber } from '@/lib/money'
import { formatDate, formatDateTime, truncate } from '@/lib/utils/text'
import {
  MATERIAL_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from '@/lib/domain/enums'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/page-header'
import { ProjectStatusBadge } from '@/components/admin/status-badges'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const metadata: Metadata = {
  title: 'Sonderanfertigungen',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

/** Werkstoffe, die im Anfrageformular zur Wahl stehen (src/lib/validation/project.ts). */
const PROJECT_MATERIALS = ['V4A', 'V2A', 'VA'] as const

type SortKey = 'eingang' | 'stueckzahl'
type SortDirection = 'asc' | 'desc'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  await requirePermission('projects:read')
  const sp = await searchParams

  // --- Filterzustand aus der URL lesen und gegen erlaubte Werte pruefen ----
  const query = single(sp.q).slice(0, 80)

  const statusRaw = single(sp.status)
  const status = (PROJECT_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : ''

  const materialRaw = single(sp.werkstoff)
  const material = (PROJECT_MATERIALS as readonly string[]).includes(materialRaw) ? materialRaw : ''

  const sortRaw = single(sp.sortieren)
  const sort: SortKey = sortRaw === 'stueckzahl' ? 'stueckzahl' : 'eingang'
  const direction: SortDirection = single(sp.richtung) === 'asc' ? 'asc' : 'desc'

  const pageRaw = Number.parseInt(single(sp.seite), 10)
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1

  // --- Abfrage -------------------------------------------------------------
  const where: Prisma.CustomProjectWhereInput = {}

  if (query.length > 0) {
    where.OR = [
      { projectNumber: { contains: query } },
      { projectName: { contains: query } },
      { contactName: { contains: query } },
      { company: { contains: query } },
      { email: { contains: query } },
    ]
  }
  if (status.length > 0) where.status = status
  if (material.length > 0) where.material = material

  const [filteredCount, newCount, productionCount] = await Promise.all([
    prisma.customProject.count({ where }),
    prisma.customProject.count({ where: { AND: [where, { status: 'new' }] } }),
    prisma.customProject.count({ where: { AND: [where, { status: 'in_production' }] } }),
  ])

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const skip = (page - 1) * PAGE_SIZE

  const projects = await prisma.customProject.findMany({
    where,
    orderBy: sort === 'stueckzahl' ? { quantity: direction } : { createdAt: direction },
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      projectNumber: true,
      projectName: true,
      contactName: true,
      company: true,
      email: true,
      material: true,
      quantity: true,
      status: true,
      createdAt: true,
      _count: { select: { attachments: true } },
    },
  })

  const hasFilters = query.length > 0 || status.length > 0 || material.length > 0
  // Nur laden, wenn die gefilterte Liste leer ist — sonst waere die
  // Zusatzabfrage reine Last ohne Nutzen.
  const totalProjects =
    filteredCount === 0 && hasFilters ? await prisma.customProject.count() : filteredCount

  // --- URL-Bau fuer Sortierung und Seitenwechsel ---------------------------
  function buildHref(overrides: Record<string, string | number | undefined>): string {
    const params = new URLSearchParams()
    const values: Record<string, string> = {
      q: query,
      status,
      werkstoff: material,
      sortieren: sort === 'eingang' ? '' : sort,
      richtung: direction === 'desc' ? '' : direction,
      seite: page > 1 ? String(page) : '',
    }
    for (const [key, value] of Object.entries(overrides)) {
      values[key] = value === undefined ? '' : String(value)
    }
    for (const [key, value] of Object.entries(values)) {
      if (value.length > 0) params.set(key, value)
    }
    const search = params.toString()
    return search.length > 0 ? `/admin/projekte?${search}` : '/admin/projekte'
  }

  function sortHref(key: SortKey): string {
    // Erneuter Klick auf die aktive Spalte dreht die Richtung um.
    const nextDirection: SortDirection = sort === key && direction === 'desc' ? 'asc' : 'desc'
    return buildHref({
      sortieren: key === 'eingang' ? '' : key,
      richtung: nextDirection === 'desc' ? '' : nextDirection,
      seite: '',
    })
  }

  return (
    <div>
      <AdminPageHeader
        title="Sonderanfertigungen"
        description="Anfragen aus dem Formular für Sonderanfertigungen mit technischen Angaben und Anhängen. Wählen Sie eine Zeile für die vollständige Spezifikation."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:max-w-3xl">
        <SummaryTile label="Projekte in dieser Auswahl" value={filteredCount} />
        <SummaryTile
          label="Neu eingegangen"
          value={newCount}
          hint={newCount > 0 ? 'Warten auf technische Prüfung' : 'Nichts Unbearbeitetes'}
          urgent={newCount > 0}
        />
        <SummaryTile label="In Fertigung" value={productionCount} />
      </div>

      <AdminFilterBar
        searchPlaceholder="Projektnummer, Projektname, Kontakt oder E-Mail …"
        selects={[
          {
            name: 'status',
            label: 'Status',
            allLabel: 'Status: alle',
            options: PROJECT_STATUSES.map((value) => ({
              value,
              label: PROJECT_STATUS_LABELS[value],
            })),
          },
          {
            name: 'werkstoff',
            label: 'Werkstoff',
            allLabel: 'Werkstoff: alle',
            options: PROJECT_MATERIALS.map((value) => ({
              value,
              label: MATERIAL_LABELS[value] ?? value,
            })),
          },
        ]}
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<Ruler className="size-5" aria-hidden="true" />}
          title={
            totalProjects === 0 ? 'Noch keine Sonderanfragen' : 'Kein Projekt passt zur Auswahl'
          }
          description={
            totalProjects === 0
              ? 'Sobald eine Anfrage über das Formular für Sonderanfertigungen eingeht, erscheint sie an dieser Stelle.'
              : 'Ändern Sie die Suche oder setzen Sie die Filter zurück, um wieder alle Projekte zu sehen.'
          }
          action={totalProjects === 0 ? undefined : { label: 'Filter zurücksetzen', href: '/admin/projekte' }}
        />
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[54rem]">
              <Thead>
                <tr>
                  <Th>Projektnummer</Th>
                  <Th>Projekt</Th>
                  <Th>Kontakt</Th>
                  <Th>Werkstoff</Th>
                  <SortableTh
                    label="Stückzahl"
                    href={sortHref('stueckzahl')}
                    active={sort === 'stueckzahl'}
                    direction={direction}
                    align="right"
                  />
                  <Th>Status</Th>
                  <SortableTh
                    label="Eingang"
                    href={sortHref('eingang')}
                    active={sort === 'eingang'}
                    direction={direction}
                    align="right"
                  />
                </tr>
              </Thead>
              <Tbody>
                {projects.map((project) => (
                  <Tr key={project.id} className="group relative">
                    <Td className="font-semibold text-ink">
                      {/* Der Link spannt sich über die gesamte Zeile, bleibt im
                          DOM aber ein einzelner, benannter Link. */}
                      <Link
                        href={`/admin/projekte/${project.id}`}
                        className="tabular rounded-xs whitespace-nowrap after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--accent)]"
                      >
                        {project.projectNumber}
                      </Link>
                    </Td>
                    <Td>
                      <span className="block max-w-[20rem] font-medium text-ink">
                        {truncate(project.projectName, 60)}
                      </span>
                      {project._count.attachments > 0 && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-faint">
                          <Paperclip className="size-3" aria-hidden="true" />
                          {formatNumber(project._count.attachments)}{' '}
                          {project._count.attachments === 1 ? 'Anhang' : 'Anhänge'}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="block max-w-[14rem] truncate text-ink">
                        {project.company ?? project.contactName}
                      </span>
                      <span className="block max-w-[14rem] truncate text-xs text-ink-faint">
                        {project.company ? `${project.contactName} · ` : ''}
                        {project.email}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {MATERIAL_LABELS[project.material] ?? project.material}
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap">
                      {formatNumber(project.quantity)} Stk.
                    </Td>
                    <Td>
                      <ProjectStatusBadge status={project.status} />
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap">
                      <span title={formatDateTime(project.createdAt)}>
                        {formatDate(project.createdAt)}
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
