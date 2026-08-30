import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, History, Package, PackageSearch, PackageX } from 'lucide-react'
import { prisma, type Prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber } from '@/lib/money'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/page-header'
import { StockEditor, type StockEditorRow, type StockSortLink } from '@/components/admin/stock-editor'
import { ButtonLink } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState } from '@/components/ui/states'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Lager', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/**
 * Bestandsuebersicht.
 *
 * Standardsortierung ist der kleinste Bestand zuerst: Wer das Lager oeffnet,
 * will zuerst sehen, was ausgeht — nicht, was reichlich vorhanden ist.
 *
 * Der Zustand „niedrig“ umfasst bewusst auch ausverkaufte Artikel, damit der
 * Sprung vom Dashboard (/admin/lager?filter=niedrig) genau die Artikel zeigt,
 * die dort als Nachbestellbedarf gezaehlt wurden.
 */

const CONDITIONS = ['niedrig', 'ausverkauft', 'ausreichend'] as const
type Condition = (typeof CONDITIONS)[number]

const CONDITION_LABELS: Record<Condition, string> = {
  niedrig: 'Meldegrenze erreicht',
  ausverkauft: 'Ausverkauft',
  ausreichend: 'Bestand ausreichend',
}

const SORT_ORDERS = {
  'bestand-asc': [{ stock: 'asc' }, { name: 'asc' }],
  'bestand-desc': [{ stock: 'desc' }, { name: 'asc' }],
  'name-asc': [{ name: 'asc' }],
  'name-desc': [{ name: 'desc' }],
  'meldegrenze-asc': [{ lowStockThreshold: 'asc' }, { name: 'asc' }],
  'meldegrenze-desc': [{ lowStockThreshold: 'desc' }, { name: 'asc' }],
} satisfies Record<string, Prisma.ProductOrderByWithRelationInput[]>

type SortKey = keyof typeof SORT_ORDERS
const DEFAULT_SORT: SortKey = 'bestand-asc'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/** Bedingung als Prisma-Filter. Der Feldbezug vergleicht zwei Spalten derselben Zeile. */
function conditionWhere(condition: Condition): Prisma.ProductWhereInput {
  switch (condition) {
    case 'niedrig':
      return { stock: { lte: prisma.product.fields.lowStockThreshold } }
    case 'ausverkauft':
      return { stock: { lte: 0 } }
    case 'ausreichend':
      return { stock: { gt: prisma.product.fields.lowStockThreshold } }
  }
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const session = await requirePermission('inventory:read')
  const canWrite = session.user.permissions.includes('inventory:write')

  const sp = await searchParams
  const query = single(sp.q).slice(0, 80)
  const categoryId = single(sp.kategorie)
  const conditionRaw = single(sp.filter)
  const condition = (CONDITIONS as readonly string[]).includes(conditionRaw)
    ? (conditionRaw as Condition)
    : null
  const sortRaw = single(sp.sortierung)
  const sort: SortKey = sortRaw in SORT_ORDERS ? (sortRaw as SortKey) : DEFAULT_SORT
  const pageRaw = Number.parseInt(single(sp.seite), 10)
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1

  const where: Prisma.ProductWhereInput = {}
  if (query.length > 0) {
    where.OR = [
      { name: { contains: query } },
      { sku: { contains: query } },
      { articleNumber: { contains: query } },
    ]
  }
  if (categoryId.length > 0) where.categoryId = categoryId
  if (condition) Object.assign(where, conditionWhere(condition))

  const [filteredCount, catalogSize, lowCount, outCount, unitSum, categories] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.count(),
    prisma.product.count({ where: conditionWhere('niedrig') }),
    prisma.product.count({ where: conditionWhere('ausverkauft') }),
    prisma.product.aggregate({ _sum: { stock: true, reservedStock: true } }),
    prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)

  const products = await prisma.product.findMany({
    where,
    orderBy: SORT_ORDERS[sort],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      sku: true,
      articleNumber: true,
      stock: true,
      reservedStock: true,
      lowStockThreshold: true,
      allowBackorder: true,
      active: true,
      category: { select: { name: true } },
    },
  })

  const rows: StockEditorRow[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    articleNumber: product.articleNumber,
    categoryName: product.category.name,
    stock: product.stock,
    reservedStock: product.reservedStock,
    lowStockThreshold: product.lowStockThreshold,
    allowBackorder: product.allowBackorder,
    active: product.active,
  }))

  function href(overrides: Record<string, string | number | null>): string {
    const values: Record<string, string> = {
      q: query,
      kategorie: categoryId,
      filter: condition ?? '',
      sortierung: sort === DEFAULT_SORT ? '' : sort,
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
    return search.length > 0 ? `/admin/lager?${search}` : '/admin/lager'
  }

  /** Erneuter Klick auf die aktive Spalte dreht die Richtung um. */
  function sortLink(ascending: SortKey, descending: SortKey): StockSortLink {
    const active = sort === ascending || sort === descending
    const next = sort === ascending ? descending : ascending
    return {
      href: href({ sortierung: next === DEFAULT_SORT ? null : next, seite: null }),
      active,
      direction: sort === descending ? 'desc' : 'asc',
    }
  }

  const hasFilters = query.length > 0 || categoryId.length > 0 || condition !== null
  const reserved = unitSum._sum.reservedStock ?? 0

  return (
    <div>
      <AdminPageHeader
        title="Lager"
        description="Bestände prüfen und buchen. Jede Änderung wird mit Zeitpunkt, Bearbeiter und Grund im Bestandsjournal festgehalten."
        count={filteredCount}
        countLabel="Artikel in dieser Auswahl"
        actions={
          <ButtonLink href="/admin/lager/bewegungen" size="sm" variant="outline">
            <History className="size-4" aria-hidden="true" />
            Bestandsjournal
          </ButtonLink>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          href="/admin/lager"
          icon={<Package className="size-4.5" aria-hidden="true" />}
          label="Artikel im Sortiment"
          value={formatNumber(catalogSize)}
        />
        <SummaryTile
          href="/admin/lager?filter=niedrig"
          icon={<AlertTriangle className="size-4.5" aria-hidden="true" />}
          label="Meldegrenze erreicht"
          value={formatNumber(lowCount)}
          urgent={lowCount > 0}
        />
        <SummaryTile
          href="/admin/lager?filter=ausverkauft"
          icon={<PackageX className="size-4.5" aria-hidden="true" />}
          label="Ausverkauft"
          value={formatNumber(outCount)}
          urgent={outCount > 0}
        />
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
          <p className="text-xs font-medium text-ink-muted">Bestand gesamt</p>
          <p className="tabular mt-1 font-display text-2xl font-semibold">
            {formatNumber(unitSum._sum.stock ?? 0)}
          </p>
          <p className="tabular mt-1 text-xs text-ink-faint">
            davon {formatNumber(reserved)} durch offene Bestellungen reserviert
          </p>
        </div>
      </div>

      <AdminFilterBar
        searchPlaceholder="Artikel, SKU oder Artikelnummer …"
        selects={[
          {
            name: 'kategorie',
            label: 'Kategorie',
            allLabel: 'Alle Kategorien',
            options: categories.map((category) => ({ value: category.id, label: category.name })),
          },
          {
            name: 'filter',
            label: 'Zustand',
            allLabel: 'Zustand: alle',
            options: CONDITIONS.map((value) => ({ value, label: CONDITION_LABELS[value] })),
          },
        ]}
      />

      {rows.length === 0 ? (
        catalogSize === 0 ? (
          <EmptyState
            icon={<Package className="size-5" aria-hidden="true" />}
            title="Noch keine Artikel angelegt"
            description="Sobald das erste Produkt im Sortiment steht, können Sie hier dessen Bestand pflegen."
            action={{ label: 'Zu den Produkten', href: '/admin/produkte' }}
          />
        ) : (
          <EmptyState
            icon={<PackageSearch className="size-5" aria-hidden="true" />}
            title={
              condition === 'niedrig'
                ? 'Kein Artikel hat die Meldegrenze erreicht'
                : condition === 'ausverkauft'
                  ? 'Kein Artikel ist ausverkauft'
                  : 'Keine Treffer'
            }
            description={
              hasFilters
                ? 'Zu dieser Suche und diesen Filtern gibt es keinen Artikel. Ändern Sie die Filter oder setzen Sie sie zurück.'
                : 'Zu dieser Auswahl gibt es keinen Artikel.'
            }
            action={hasFilters ? { label: 'Filter zurücksetzen', href: '/admin/lager' } : undefined}
          />
        )
      ) : (
        <>
          <StockEditor
            rows={rows}
            canWrite={canWrite}
            nameSort={sortLink('name-asc', 'name-desc')}
            stockSort={sortLink('bestand-asc', 'bestand-desc')}
            thresholdSort={sortLink('meldegrenze-asc', 'meldegrenze-desc')}
          />

          <p className="mt-4 text-center text-xs text-ink-muted" aria-live="polite">
            {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + rows.length} von{' '}
            {formatNumber(filteredCount)} {filteredCount === 1 ? 'Artikel' : 'Artikeln'}
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

function SummaryTile({
  href,
  icon,
  label,
  value,
  urgent = false,
}: {
  href: string
  icon: React.ReactNode
  label: string
  value: string
  urgent?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-xl border px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]',
        urgent
          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-raised)]',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          urgent ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'bg-paper-sunken text-ink-muted',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="tabular block font-display text-2xl font-semibold">{value}</span>
        <span className="block text-xs leading-snug text-ink-muted">{label}</span>
      </span>
    </Link>
  )
}
