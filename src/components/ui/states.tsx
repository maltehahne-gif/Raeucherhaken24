import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { Button, ButtonLink } from '@/components/ui/button'

/** Leerzustand mit klarer Handlungsempfehlung statt blanker Flaeche. */
export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; href: string } | { label: string; onClick: () => void }
  secondaryAction?: { label: string; href: string }
  className?: string
  compact?: boolean
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-paper-sunken/50 text-center',
        compact ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--surface-raised)] text-ink-faint shadow-[var(--shadow-subtle)]">
          {icon}
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action &&
            ('href' in action ? (
              <ButtonLink href={action.href} size="sm">
                {action.label}
              </ButtonLink>
            ) : (
              <Button size="sm" onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
          {secondaryAction && (
            <Link
              href={secondaryAction.href}
              className="text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              {secondaryAction.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden="true" />
}

/** Ladeplatzhalter fuer Produktraster — verhindert Layout-Sprünge. */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-square w-full rounded-lg" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-1 h-5 w-24" />
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Produkte werden geladen"
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-px" aria-busy="true" aria-label="Daten werden geladen">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-1/3' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Fehlerzustand mit Wiederholmoeglichkeit. */
export function ErrorState({
  title = 'Das hat leider nicht geklappt',
  description = 'Bitte versuchen Sie es erneut. Falls das Problem bestehen bleibt, melden Sie sich gerne bei uns.',
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-danger-100 bg-danger-50/60 px-6 py-12 text-center',
        className,
      )}
    >
      <h3 className="font-display text-lg font-semibold text-danger-700">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-6" onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </div>
  )
}
