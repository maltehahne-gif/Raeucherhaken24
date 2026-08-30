'use client'

import { useRouter } from 'next/navigation'
import { SORT_OPTION_LABELS, SORT_OPTIONS, type SortOption } from '@/lib/domain/enums'
import { buildFilterHref, type CatalogFilters } from '@/lib/server/product-query'

/**
 * Sortierung als echtes <select>.
 * Ohne JavaScript bleibt der Absenden-Knopf sichtbar, mit JavaScript wechselt
 * die Seite direkt bei der Auswahl.
 */
export function SortSelect({
  basePath,
  filters,
  available = SORT_OPTIONS,
}: {
  basePath: string
  filters: CatalogFilters
  available?: readonly SortOption[]
}) {
  const router = useRouter()

  return (
    <form
      action={basePath}
      method="get"
      className="flex items-center gap-2"
      onSubmit={(e) => e.preventDefault()}
    >
      <label htmlFor="sortierung" className="shrink-0 text-sm text-ink-muted">
        Sortieren
      </label>
      <div className="relative">
        <select
          id="sortierung"
          name="sort"
          defaultValue={filters.sort}
          onChange={(event) =>
            router.push(buildFilterHref(basePath, filters, { sort: event.target.value as SortOption, page: 1 }))
          }
          className="h-10 appearance-none rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] pr-9 pl-3 text-sm font-medium outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        >
          {available.map((option) => (
            <option key={option} value={option}>
              {SORT_OPTION_LABELS[option]}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <noscript>
        <button type="submit" className="h-10 rounded-md border border-[var(--border-default)] px-3 text-sm">
          Anwenden
        </button>
      </noscript>
    </form>
  )
}
