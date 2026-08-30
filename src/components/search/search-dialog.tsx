'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Clock, CornerDownLeft, Package, Search, X } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { useDebouncedValue, useLocalStorage } from '@/lib/client/hooks'
import { cn } from '@/lib/utils/cn'

/**
 * Sofortsuche als Overlay (Strg/Cmd + K).
 *
 * Tastaturbedienung ist der Hauptweg: Pfeiltasten wechseln die Auswahl,
 * Enter oeffnet, Escape schliesst. Der Fokus bleibt im Overlay gefangen und
 * kehrt beim Schliessen zum ausloesenden Element zurueck.
 */

interface SearchHit {
  slug: string
  name: string
  categoryName: string
  priceLabel: string
  imageUrl: string | null
  inStock: boolean
}

interface SearchResponse {
  query: string
  total: number
  suggestions: string[]
  items: SearchHit[]
}

const HISTORY_KEY = 'rh24:search-history'
const MAX_HISTORY = 6

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [history, setHistory] = useLocalStorage<string[]>(HISTORY_KEY, [])
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const debouncedQuery = useDebouncedValue(query, 180)

  // Overlay oeffnen: Fokus setzen, Hintergrund sperren, Fokus zurueckgeben.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = overflow
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults(null)
      setActiveIndex(0)
    }
  }, [open])

  // Abfrage mit Abbruch der vorherigen Anfrage — keine veralteten Ergebnisse.
  useEffect(() => {
    if (!open) return
    const trimmed = debouncedQuery.trim()
    if (trimmed.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    void apiRequest<SearchResponse>(`/api/search?q=${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return
      setLoading(false)
      setActiveIndex(0)
      setResults(result.ok ? result.data : null)
    })

    return () => controller.abort()
  }, [debouncedQuery, open])

  function remember(term: string) {
    const trimmed = term.trim()
    if (trimmed.length < 2) return
    setHistory([trimmed, ...history.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY))
  }

  function goToProduct(hit: SearchHit) {
    remember(query)
    onClose()
    router.push(`/produkt/${hit.slug}`)
  }

  function goToResults(term: string) {
    const trimmed = term.trim()
    if (trimmed.length === 0) return
    remember(trimmed)
    onClose()
    router.push(`/suche?q=${encodeURIComponent(trimmed)}`)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const items = results?.items ?? []

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const hit = items[activeIndex]
      if (hit) goToProduct(hit)
      else goToResults(query)
      return
    }
    if (event.key === 'Tab') {
      // Fokus im Overlay halten
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  if (!open) return null

  const items = results?.items ?? []
  const showHistory = query.trim().length < 2 && history.length > 0
  const showEmpty = query.trim().length >= 2 && !loading && items.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]">
      <div className="animate-fade-in absolute inset-0 bg-steel-900/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Produktsuche"
        onKeyDown={onKeyDown}
        className="animate-scale-in relative flex max-h-[76vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-[var(--surface-raised)] shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4">
          <Search className="size-4.5 shrink-0 text-ink-faint" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Räucherhaken, Buchenmehl, Forellenlauge …"
            aria-label="Suchbegriff"
            aria-autocomplete="list"
            aria-controls="search-results"
            aria-activedescendant={items[activeIndex] ? `search-hit-${activeIndex}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
          />
          {loading && (
            <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-steel-200 border-t-[var(--accent)]" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Suche schließen"
            className="shrink-0 rounded p-1.5 text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div id="search-results" role="listbox" aria-label="Suchergebnisse" className="scroll-area min-h-0 flex-1 overflow-y-auto">
          {showHistory && (
            <div className="p-2">
              <p className="px-2.5 py-2 text-2xs font-semibold tracking-wider text-ink-faint uppercase">
                Zuletzt gesucht
              </p>
              {history.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink-soft transition-colors hover:bg-paper-sunken"
                >
                  <Clock className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                  {term}
                </button>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <ul className="p-2">
              {items.map((hit, index) => (
                <li key={hit.slug}>
                  <button
                    type="button"
                    id={`search-hit-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => goToProduct(hit)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                      index === activeIndex ? 'bg-paper-sunken' : 'hover:bg-paper-sunken/60',
                    )}
                  >
                    <span className="relative size-11 shrink-0 overflow-hidden rounded bg-paper-sunken">
                      {hit.imageUrl ? (
                        <Image src={hit.imageUrl} alt="" width={88} height={88} className="size-full object-cover" sizes="44px" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-ink-faint">
                          <Package className="size-4" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{hit.name}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {hit.categoryName}
                        {!hit.inStock && ' · derzeit ausverkauft'}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-semibold">{hit.priceLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showEmpty && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-ink">
                Zu „{query.trim()}“ haben wir nichts gefunden.
              </p>
              <p className="mt-1.5 text-sm text-ink-muted">
                Prüfen Sie die Schreibweise oder stöbern Sie in diesen Bereichen:
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {(results?.suggestions ?? []).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setQuery(suggestion)}
                    className="rounded-full border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-paper-sunken/60 px-4 py-2.5 text-2xs text-ink-faint">
          <span className="hidden items-center gap-3 sm:flex">
            <Key>↑</Key>
            <Key>↓</Key>
            <span>navigieren</span>
            <Key>
              <CornerDownLeft className="size-2.5" aria-hidden="true" />
            </Key>
            <span>öffnen</span>
            <Key>Esc</Key>
            <span>schließen</span>
          </span>
          {results && results.total > items.length && (
            <button
              type="button"
              onClick={() => goToResults(query)}
              className="ml-auto font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Alle {results.total} Treffer anzeigen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-[var(--border-default)] bg-[var(--surface-raised)] px-1 font-sans text-[0.625rem] font-medium text-ink-muted">
      {children}
    </kbd>
  )
}
