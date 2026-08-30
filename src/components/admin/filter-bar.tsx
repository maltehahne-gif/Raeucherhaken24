'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { useDebouncedValue } from '@/lib/client/hooks'
import { cn } from '@/lib/utils/cn'

/**
 * Such- und Filterleiste der Verwaltungslisten.
 *
 * Der Zustand liegt in der URL, damit eine gefilterte Liste teilbar ist und
 * die Zurück-Taste funktioniert. Die Sucheingabe ist entprellt, damit nicht
 * bei jedem Tastendruck eine Navigation ausgelöst wird.
 */

export interface FilterSelect {
  name: string
  label: string
  options: Array<{ value: string; label: string }>
  /** Beschriftung des „alle anzeigen“-Eintrags */
  allLabel?: string
}

export function AdminFilterBar({
  searchPlaceholder = 'Suchen …',
  selects = [],
  children,
}: {
  searchPlaceholder?: string
  selects?: FilterSelect[]
  children?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const debounced = useDebouncedValue(query, 300)
  const initial = useRef(true)

  useEffect(() => {
    // Beim ersten Rendern nicht navigieren — sonst geht der Verlauf verloren.
    if (initial.current) {
      initial.current = false
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    if (debounced.trim().length > 0) params.set('q', debounced.trim())
    else params.delete('q')
    params.delete('seite')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [debounced, pathname, router, searchParams])

  function updateParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value.length > 0) params.set(name, value)
    else params.delete(name)
    params.delete('seite')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const hasFilters =
    query.trim().length > 0 || selects.some((s) => (searchParams.get(s.name) ?? '').length > 0)

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[14rem] flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] pr-3 pl-9 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      {selects.map((select) => (
        <label key={select.name} className="relative">
          <span className="sr-only">{select.label}</span>
          <select
            value={searchParams.get(select.name) ?? ''}
            onChange={(e) => updateParam(select.name, e.target.value)}
            className="h-10 appearance-none rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] pr-9 pl-3 text-sm font-medium outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          >
            <option value="">{select.allLabel ?? `${select.label}: alle`}</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
        </label>
      ))}

      {children}

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setQuery('')
            router.replace(pathname, { scroll: false })
          }}
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium',
            'text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink',
          )}
        >
          <X className="size-3.5" aria-hidden="true" />
          Zurücksetzen
        </button>
      )}
    </div>
  )
}
