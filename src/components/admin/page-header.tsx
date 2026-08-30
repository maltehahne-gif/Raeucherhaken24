import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Kopfbereich einer Verwaltungsseite.
 * Einheitlich über alle Bereiche, damit Titel, Zähler und Aktionen immer an
 * derselben Stelle stehen.
 */
export function AdminPageHeader({
  title,
  description,
  count,
  countLabel,
  actions,
  backHref,
  backLabel,
  className,
}: {
  title: string
  description?: string
  count?: number
  countLabel?: string
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
  className?: string
}) {
  return (
    <div className={cn('mb-6', className)}>
      {backHref && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {backLabel ?? 'Zurück'}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            {title}
            {count !== undefined && (
              <span className="tabular ml-3 text-lg font-normal text-ink-faint">
                {count.toLocaleString('de-DE')}
                {countLabel ? ` ${countLabel}` : ''}
              </span>
            )}
          </h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
