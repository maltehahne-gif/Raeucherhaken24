import Link from 'next/link'
import { Check, X } from 'lucide-react'
import { MATERIAL_LABELS } from '@/lib/domain/enums'
import { buildFilterHref, toggleValue, type CatalogFilters, type FacetOption } from '@/lib/server/product-query'
import { formatPrice } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

/**
 * Filter als Liste echter Links.
 *
 * Bewusst ohne Client-JavaScript: Jeder Filter ist eine URL. Dadurch
 * funktionieren Zurueck-Taste, Mittelklick, Teilen und Vorlesen ohne
 * Zusatzaufwand, und der Katalog bleibt vollstaendig serverseitig gerendert.
 */
export function FilterPanel({
  basePath,
  filters,
  facets,
  priceRange,
  className,
}: {
  basePath: string
  filters: CatalogFilters
  facets: { materials: FacetOption[]; usages: FacetOption[] }
  priceRange: { minCents: number; maxCents: number }
  className?: string
}) {
  const hasActive =
    filters.materials.length > 0 ||
    filters.usages.length > 0 ||
    filters.minPriceCents !== null ||
    filters.maxPriceCents !== null ||
    filters.inStockOnly ||
    filters.onSaleOnly

  return (
    <div className={cn('space-y-7', className)}>
      {hasActive && (
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-ink uppercase">Aktive Filter</h3>
            <Link
              href={buildFilterHref(basePath, filters, {
                materials: [],
                usages: [],
                minPriceCents: null,
                maxPriceCents: null,
                inStockOnly: false,
                onSaleOnly: false,
              })}
              className="text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-[var(--accent)]"
            >
              Alle zurücksetzen
            </Link>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {filters.materials.map((value) => (
              <FilterChip
                key={`m-${value}`}
                label={MATERIAL_LABELS[value] ?? value}
                href={buildFilterHref(basePath, filters, {
                  materials: toggleValue(filters.materials, value),
                })}
              />
            ))}
            {filters.usages.map((value) => (
              <FilterChip
                key={`u-${value}`}
                label={value}
                href={buildFilterHref(basePath, filters, { usages: toggleValue(filters.usages, value) })}
              />
            ))}
            {(filters.minPriceCents !== null || filters.maxPriceCents !== null) && (
              <FilterChip
                label={priceLabel(filters)}
                href={buildFilterHref(basePath, filters, { minPriceCents: null, maxPriceCents: null })}
              />
            )}
            {filters.inStockOnly && (
              <FilterChip
                label="Sofort lieferbar"
                href={buildFilterHref(basePath, filters, { inStockOnly: false })}
              />
            )}
            {filters.onSaleOnly && (
              <FilterChip label="Im Angebot" href={buildFilterHref(basePath, filters, { onSaleOnly: false })} />
            )}
          </ul>
        </div>
      )}

      <FilterGroup title="Verfügbarkeit">
        <FilterRow
          label="Sofort lieferbar"
          checked={filters.inStockOnly}
          href={buildFilterHref(basePath, filters, { inStockOnly: !filters.inStockOnly })}
        />
        <FilterRow
          label="Im Angebot"
          checked={filters.onSaleOnly}
          href={buildFilterHref(basePath, filters, { onSaleOnly: !filters.onSaleOnly })}
        />
      </FilterGroup>

      {facets.materials.length > 1 && (
        <FilterGroup title="Material">
          {facets.materials.map((facet) => (
            <FilterRow
              key={facet.value}
              label={MATERIAL_LABELS[facet.value] ?? facet.value}
              count={facet.count}
              checked={filters.materials.includes(facet.value)}
              href={buildFilterHref(basePath, filters, {
                materials: toggleValue(filters.materials, facet.value),
              })}
            />
          ))}
        </FilterGroup>
      )}

      {facets.usages.length > 1 && (
        <FilterGroup title="Verwendung">
          {facets.usages.map((facet) => (
            <FilterRow
              key={facet.value}
              label={facet.value}
              count={facet.count}
              checked={filters.usages.includes(facet.value)}
              href={buildFilterHref(basePath, filters, { usages: toggleValue(filters.usages, facet.value) })}
            />
          ))}
        </FilterGroup>
      )}

      <PriceFilter basePath={basePath} filters={filters} priceRange={priceRange} />
    </div>
  )
}

function priceLabel(filters: CatalogFilters): string {
  if (filters.minPriceCents !== null && filters.maxPriceCents !== null) {
    return `${formatPrice(filters.minPriceCents)} – ${formatPrice(filters.maxPriceCents)}`
  }
  if (filters.minPriceCents !== null) return `ab ${formatPrice(filters.minPriceCents)}`
  return `bis ${formatPrice(filters.maxPriceCents ?? 0)}`
}

function FilterChip({ label, href }: { label: string; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] py-1 pr-2 pl-2.5 text-xs font-medium text-[var(--accent-hover)] ring-1 ring-inset ring-[var(--accent-border)] transition-colors hover:bg-[var(--accent-border)]"
      >
        {label}
        <X className="size-3" aria-hidden="true" />
        <span className="sr-only">Filter entfernen</span>
      </Link>
    </li>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold tracking-wide text-ink uppercase">{title}</legend>
      <ul className="space-y-0.5">{children}</ul>
    </fieldset>
  )
}

function FilterRow({
  label,
  href,
  checked,
  count,
}: {
  label: string
  href: string
  checked: boolean
  count?: number
}) {
  return (
    <li>
      <Link
        href={href}
        aria-pressed={checked}
        className={cn(
          'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
          checked ? 'text-ink' : 'text-ink-soft hover:bg-paper-sunken',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-4.5 shrink-0 items-center justify-center rounded-xs border transition-colors',
            checked
              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
              : 'border-[var(--border-strong)]',
          )}
        >
          {checked && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && <span className="tabular shrink-0 text-xs text-ink-faint">{count}</span>}
      </Link>
    </li>
  )
}

/** Preisfilter als Formular — funktioniert per GET ohne JavaScript. */
function PriceFilter({
  basePath,
  filters,
  priceRange,
}: {
  basePath: string
  filters: CatalogFilters
  priceRange: { minCents: number; maxCents: number }
}) {
  if (priceRange.maxCents <= priceRange.minCents) return null

  return (
    <form action={basePath} method="get" className="space-y-2.5">
      <fieldset>
        <legend className="mb-2 text-xs font-semibold tracking-wide text-ink uppercase">Preis</legend>
        <div className="flex items-center gap-2">
          <label className="flex-1">
            <span className="sr-only">Mindestpreis in Euro</span>
            <input
              type="number"
              name="preis_min"
              min={0}
              step="0.01"
              placeholder={(priceRange.minCents / 100).toFixed(2)}
              defaultValue={filters.minPriceCents !== null ? (filters.minPriceCents / 100).toFixed(2) : ''}
              className="tabular h-10 w-full rounded-md border border-[var(--border-default)] px-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>
          <span className="text-ink-faint" aria-hidden="true">
            –
          </span>
          <label className="flex-1">
            <span className="sr-only">Höchstpreis in Euro</span>
            <input
              type="number"
              name="preis_max"
              min={0}
              step="0.01"
              placeholder={(priceRange.maxCents / 100).toFixed(2)}
              defaultValue={filters.maxPriceCents !== null ? (filters.maxPriceCents / 100).toFixed(2) : ''}
              className="tabular h-10 w-full rounded-md border border-[var(--border-default)] px-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </label>
        </div>
      </fieldset>

      {/* Bestehende Filter beim Absenden erhalten */}
      {filters.query && <input type="hidden" name="q" value={filters.query} />}
      {filters.materials.length > 0 && (
        <input type="hidden" name="material" value={filters.materials.join(',')} />
      )}
      {filters.usages.length > 0 && <input type="hidden" name="verwendung" value={filters.usages.join(',')} />}
      {filters.inStockOnly && <input type="hidden" name="lieferbar" value="1" />}
      {filters.onSaleOnly && <input type="hidden" name="aktion" value="1" />}
      {filters.sort !== 'beliebtheit' && <input type="hidden" name="sort" value={filters.sort} />}

      <button
        type="submit"
        className="h-10 w-full rounded-md border border-[var(--border-default)] text-sm font-medium text-ink-soft transition-colors hover:border-[var(--border-strong)] hover:bg-paper-sunken"
      >
        Preis anwenden
      </button>
    </form>
  )
}
