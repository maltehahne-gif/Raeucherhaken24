import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Seitennavigation als echte Links, damit sie ohne JavaScript funktioniert,
 * per Mittelklick in einem neuen Tab geoeffnet und von Suchmaschinen
 * gecrawlt werden kann.
 */
export interface PaginationProps {
  page: number
  totalPages: number
  /** Erzeugt die URL fuer eine Seite (behaelt bestehende Filter bei). */
  buildHref: (page: number) => string
  className?: string
}

function pageWindow(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  let previous = 0
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push('gap')
    out.push(p)
    previous = p
  }
  return out
}

export function Pagination({ page, totalPages, buildHref, className }: PaginationProps) {
  if (totalPages <= 1) return null
  const items = pageWindow(page, totalPages)

  const linkClass =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors'

  return (
    <nav aria-label="Seitennavigation" className={cn('flex items-center justify-center gap-1', className)}>
      {page > 1 ? (
        <Link
          href={buildHref(page - 1)}
          rel="prev"
          className={cn(linkClass, 'gap-1 text-ink-soft hover:bg-paper-sunken')}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Zurück</span>
        </Link>
      ) : (
        <span className={cn(linkClass, 'gap-1 text-ink-faint')} aria-disabled="true">
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Zurück</span>
        </span>
      )}

      {items.map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="px-1.5 text-ink-faint" aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={buildHref(item)}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Seite ${item}`}
            className={cn(
              linkClass,
              'tabular',
              item === page
                ? 'bg-steel-800 text-steel-50'
                : 'text-ink-soft hover:bg-paper-sunken',
            )}
          >
            {item}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link
          href={buildHref(page + 1)}
          rel="next"
          className={cn(linkClass, 'gap-1 text-ink-soft hover:bg-paper-sunken')}
        >
          <span className="hidden sm:inline">Weiter</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className={cn(linkClass, 'gap-1 text-ink-faint')} aria-disabled="true">
          <span className="hidden sm:inline">Weiter</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  )
}
