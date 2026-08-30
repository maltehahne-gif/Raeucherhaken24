import { cn } from '@/lib/utils/cn'
import { formatPrice } from '@/lib/money'

/**
 * Preisdarstellung.
 *
 * Streichpreise werden semantisch als <s> ausgezeichnet und fuer Screenreader
 * eindeutig benannt, damit nicht zwei nackte Zahlen nacheinander vorgelesen
 * werden.
 */
export interface PriceProps {
  cents: number
  /** Urspruenglicher Preis; wird durchgestrichen dargestellt, wenn hoeher. */
  listCents?: number | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-2xl',
}

const listSizes = {
  sm: 'text-2xs',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-base',
}

export function Price({ cents, listCents, size = 'md', className }: PriceProps) {
  const hasDiscount = typeof listCents === 'number' && listCents > cents

  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <span
        className={cn(
          'tabular font-semibold',
          sizes[size],
          hasDiscount ? 'text-[var(--accent)]' : 'text-ink',
        )}
      >
        {formatPrice(cents)}
      </span>
      {hasDiscount && (
        <>
          <span className="sr-only">Vorher</span>
          <s className={cn('tabular text-ink-faint', listSizes[size])}>{formatPrice(listCents)}</s>
        </>
      )}
    </span>
  )
}

/** Grundpreisangabe nach Preisangabenverordnung. */
export function BasePriceLabel({ label, className }: { label: string; className?: string }) {
  return <p className={cn('tabular text-xs text-ink-faint', className)}>{label}</p>
}

/** Steuer- und Versandhinweis unter dem Preis. */
export function TaxNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-ink-faint', className)}>
      inkl. MwSt.{' '}
      <a href="/versand" className="underline underline-offset-2 hover:text-ink-muted">
        zzgl. Versand
      </a>
    </p>
  )
}
