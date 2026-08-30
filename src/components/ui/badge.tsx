import { cn } from '@/lib/utils/cn'

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'steel'
  | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-paper-muted text-ink-soft',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-hover)] ring-1 ring-inset ring-[var(--accent-border)]',
  success: 'bg-success-50 text-success-700 ring-1 ring-inset ring-success-100',
  warning: 'bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-100',
  danger: 'bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-100',
  info: 'bg-info-50 text-info-700 ring-1 ring-inset ring-info-100',
  steel: 'bg-steel-800 text-steel-50',
  outline: 'ring-1 ring-inset ring-[var(--border-default)] text-ink-soft',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: 'sm' | 'md'
}

export function Badge({ className, tone = 'neutral', size = 'sm', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium tracking-wide whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-0.5 text-2xs' : 'px-3 py-1 text-xs',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

/** Kleiner farbiger Punkt fuer Statuslisten. */
export function StatusDot({ tone = 'neutral', className }: { tone?: BadgeTone; className?: string }) {
  const colors: Record<BadgeTone, string> = {
    neutral: 'bg-steel-400',
    accent: 'bg-[var(--accent)]',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
    info: 'bg-info-500',
    steel: 'bg-steel-700',
    outline: 'bg-steel-300',
  }
  return <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', colors[tone], className)} />
}
