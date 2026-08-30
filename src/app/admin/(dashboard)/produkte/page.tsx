import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { Package, PackageSearch, Plus } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { selectPromotion } from '@/lib/server/pricing'
import { formatPrice } from '@/lib/money'
import { AdminPageHeader } from '@/components/admin/page-header'
import { AdminFilterBar } from '@/components/admin/filter-bar'
import { StockBadge } from '@/components/admin/status-badges'
import { ProductRowActions } from '@/components/admin/product-form'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/ui/pagination'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Produkte', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const SORT_ORDERS = {
  'name-asc': [{ name: 'asc' }],
  'name-desc': [{ name: 'desc' }],
  'preis-asc': [{ priceCents: 'asc' }, { name: 'asc' }],
  'preis-desc': [{ priceCents: 'desc' }, { name: 'asc' }],
  'bestand-asc': [{ stock: 'asc' }, { name: 'asc' }],
  'bestand-desc': [{ stock: 'desc' }, { name: 'asc' }],
} satisfies Record<string, Prisma.ProductOrderByWithRelationInput[]>

type SortKey = keyof typeof SORT_ORDERS
const DEFAULT_SORT: SortKey = 'name-asc'

const STATUS_OPTIONS = [
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'inaktiv', label: 'Inaktiv' },
  { value: 'ausverkauft', label: 'Ausverkauft' },
]

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function readParam(source: Record<string, string | string[] | undefined>, key: string): string {
  const value = source[key]
  const single = Array.isArray(value) ? value[0] : value
  return typeof single === 'string' ? single.trim() : ''
}

/**
 * Produktliste der Verwaltung.
 *
 * Suche, Filter, Sortierung und Seite stehen vollstaendig in der URL: eine
 * gefilterte Ansicht ist damit teilbar, die Zurueck-Taste funktioniert, und die
 * Seite kommt ohne Client-Zustand aus. Interaktiv ist allein die Aktionsspalte.
 */
export default async function AdminProductsPage({ searchParams }: PageProps) {
  const session = await requirePermission('products:read')
  const canWrite = session.user.permissions.includes('products:write')

  const sp = await searchParams
  const query = readParam(sp, 'q')
  const categoryId = readParam(sp, 'kategorie')
  const status = readParam(sp, 'status')
  const sortParam = readParam(sp, 'sortierung')
  const sort: SortKey = sortParam in SORT_ORDERS ? (sortParam as SortKey) : DEFAULT_SORT
  const requestedPage = Number.parseInt(readParam(sp, 'seite'), 10)

  const where: Prisma.ProductWhereInput = {}
  if (query.length > 0) {
    where.OR = [
      { name: { contains: query } },
      { sku: { contains: query } },
      { articleNumber: { contains: query } },
    ]
  }
  if (categoryId.length > 0) where.categoryId = categoryId
  if (status === 'aktiv') where.active = true
  if (status === 'inaktiv') where.active = false
  if (status === 'ausverkauft') {
    where.stock = { lte: 0 }
    where.allowBackorder = false
  }

  const now = new Date()
  const [total, categories, catalogSize] = await Promise.all([
    prisma.product.count({ where }),
    prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.product.count(),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, totalPages) : 1

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
      slug: true,
      priceCents: true,
      stock: true,
      lowStockThreshold: true,
      allowBackorder: true,
      active: true,
      visible: true,
      bestseller: true,
      category: { select: { name: true } },
      images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, alt: true } },
      promotions: {
        where: { active: true, startsAt: { lte: now }, endsAt: { gt: now } },
        select: {
          id: true,
          name: true,
          salePriceCents: true,
          discountBp: true,
          startsAt: true,
          endsAt: true,
          active: true,
        },
      },
    },
  })

  // Basis fuer alle Links dieser Seite: der aktuelle Filterzustand.
  const baseParams: Record<string, string> = {}
  if (query.length > 0) baseParams.q = query
  if (categoryId.length > 0) baseParams.kategorie = categoryId
  if (status.length > 0) baseParams.status = status
  if (sort !== DEFAULT_SORT) baseParams.sortierung = sort

  function href(overrides: Record<string, string | number | null>): string {
    const params = new URLSearchParams(baseParams)
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === '') params.delete(key)
      else params.set(key, String(value))
    }
    const search = params.toString()
    return search.length > 0 ? `/admin/produkte?${search}` : '/admin/produkte'
  }

  function sortHref(ascending: SortKey, descending: SortKey): string {
    const next = sort === ascending ? descending : ascending
    return href({ sortierung: next === DEFAULT_SORT ? null : next, seite: null })
  }

  const filtered = query.length > 0 || categoryId.length > 0 || status.length > 0

  return (
    <div>
      <AdminPageHeader
        title="Produkte"
        description="Sortiment pflegen: Preise, Bestände, Sichtbarkeit und Suchmaschinenangaben."
        count={total}
        countLabel={total === 1 ? 'Produkt' : 'Produkte'}
        actions={
          canWrite ? (
            <ButtonLink href="/admin/produkte/neu" size="sm">
              <Plus className="size-4" aria-hidden="true" />
              Produkt anlegen
            </ButtonLink>
          ) : undefined
        }
      />

      <AdminFilterBar
        searchPlaceholder="Name, SKU oder Artikelnummer …"
        selects={[
          {
            name: 'kategorie',
            label: 'Kategorie',
            allLabel: 'Alle Kategorien',
            options: categories.map((category) => ({ value: category.id, label: category.name })),
          },
          { name: 'status', label: 'Status', allLabel: 'Alle Status', options: STATUS_OPTIONS },
        ]}
      />

      {products.length === 0 ? (
        catalogSize === 0 ? (
          <EmptyState
            icon={<Package className="size-5" aria-hidden="true" />}
            title="Noch keine Produkte angelegt"
            description="Legen Sie den ersten Artikel an. Sobald er aktiv und sichtbar ist, erscheint er im Shop."
            action={canWrite ? { label: 'Produkt anlegen', href: '/admin/produkte/neu' } : undefined}
          />
        ) : (
          <EmptyState
            icon={<PackageSearch className="size-5" aria-hidden="true" />}
            title="Keine Treffer"
            description="Zu dieser Suche und diesen Filtern gibt es kein Produkt. Ändern Sie die Filter oder setzen Sie sie zurück."
            action={filtered ? { label: 'Filter zurücksetzen', href: '/admin/produkte' } : undefined}
          />
        )
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[68rem]">
              <caption className="sr-only">
                Produkte, Seite {page} von {totalPages}
              </caption>
              <Thead>
                <Tr>
                  <Th className="w-16">
                    <span className="sr-only">Bild</span>
                  </Th>
                  <SortableTh
                    label="Produkt"
                    href={sortHref('name-asc', 'name-desc')}
                    active={sort === 'name-asc' || sort === 'name-desc'}
                    direction={sort === 'name-desc' ? 'desc' : 'asc'}
                  />
                  <Th>Kategorie</Th>
                  <SortableTh
                    label="Preis"
                    align="right"
                    href={sortHref('preis-asc', 'preis-desc')}
                    active={sort === 'preis-asc' || sort === 'preis-desc'}
                    direction={sort === 'preis-desc' ? 'desc' : 'asc'}
                  />
                  <SortableTh
                    label="Bestand"
                    href={sortHref('bestand-asc', 'bestand-desc')}
                    active={sort === 'bestand-asc' || sort === 'bestand-desc'}
                    direction={sort === 'bestand-desc' ? 'desc' : 'asc'}
                  />
                  <Th>Sichtbarkeit</Th>
                  <Th>Bestseller</Th>
                  <Th align="right">Aktionen</Th>
                </Tr>
              </Thead>
              <Tbody>
                {products.map((product) => {
                  const image = product.images[0]
                  const promotion = selectPromotion(product.promotions, product.priceCents, now)
                  return (
                    <Tr key={product.id}>
                      <Td>
                        <span className="flex size-11 items-center justify-center overflow-hidden rounded-md bg-paper-sunken">
                          {image ? (
                            <Image
                              src={image.url}
                              alt={image.alt}
                              width={44}
                              height={44}
                              unoptimized
                              className="size-full object-cover"
                            />
                          ) : (
                            <Package className="size-4 text-ink-faint" aria-hidden="true" />
                          )}
                        </span>
                      </Td>

                      <Td>
                        <Link
                          href={`/admin/produkte/${product.id}`}
                          className="font-medium text-ink hover:text-[var(--accent)]"
                        >
                          {product.name}
                        </Link>
                        <span className="tabular mt-0.5 block text-xs text-ink-faint">
                          {product.sku} · {product.articleNumber}
                        </span>
                      </Td>

                      <Td className="text-sm">{product.category.name}</Td>

                      <Td align="right">
                        {promotion ? (
                          <>
                            <span className="tabular block font-semibold text-[var(--accent)]">
                              {formatPrice(promotion.priceCents)}
                            </span>
                            <span className="tabular block text-xs text-ink-faint line-through">
                              {formatPrice(product.priceCents)}
                            </span>
                          </>
                        ) : (
                          <span className="tabular font-medium">{formatPrice(product.priceCents)}</span>
                        )}
                      </Td>

                      <Td>
                        <StockBadge stock={product.stock} threshold={product.lowStockThreshold} />
                        {product.allowBackorder && product.stock <= 0 && (
                          <span className="mt-0.5 block text-xs text-ink-faint">Lieferbar ohne Bestand</span>
                        )}
                      </Td>

                      <Td>
                        <span className="flex flex-wrap items-center gap-1">
                          {product.active ? (
                            <Badge tone="success">Aktiv</Badge>
                          ) : (
                            <Badge tone="neutral">Inaktiv</Badge>
                          )}
                          {product.active && !product.visible && (
                            <Badge tone="warning">Nicht gelistet</Badge>
                          )}
                        </span>
                      </Td>

                      <Td>
                        {product.bestseller ? (
                          <Badge tone="steel">Bestseller</Badge>
                        ) : (
                          <span className="text-ink-faint" aria-label="Kein Bestseller">
                            —
                          </span>
                        )}
                      </Td>

                      <Td align="right">
                        <ProductRowActions
                          productId={product.id}
                          productName={product.name}
                          active={product.active}
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
            {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + products.length} von {total}{' '}
            {total === 1 ? 'Produkt' : 'Produkten'}
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
