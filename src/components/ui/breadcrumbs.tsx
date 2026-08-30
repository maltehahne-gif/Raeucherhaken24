import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface Crumb {
  label: string
  href?: string
}

/**
 * Brotkrumennavigation. Die zugehoerigen strukturierten Daten werden separat
 * in src/lib/seo/structured-data.ts erzeugt, damit Markup und Daten aus
 * derselben Quelle stammen.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Brotkrumennavigation" className={cn('min-w-0', className)}>
      <ol className="scroll-area flex items-center gap-1 overflow-x-auto text-xs whitespace-nowrap text-ink-muted">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-xs px-0.5 transition-colors hover:text-ink hover:underline hover:underline-offset-2"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn('px-0.5', isLast && 'font-medium text-ink')} aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
