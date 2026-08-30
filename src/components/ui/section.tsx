import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/** Wiederkehrende Abschnittsueberschrift der Storefront. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
  as: As = 'h2',
  align = 'left',
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: { label: string; href: string }
  className?: string
  as?: 'h1' | 'h2' | 'h3'
  align?: 'left' | 'center'
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && (
          <p className="mb-2 text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            {eyebrow}
          </p>
        )}
        <As className={cn('font-display font-semibold', As === 'h1' ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl')}>
          {title}
        </As>
        {description && <p className="mt-3 text-base leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-[var(--accent)]"
        >
          {action.label}
          <ArrowRight
            className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 [transition-timing-function:var(--ease-out-soft)]"
            aria-hidden="true"
          />
        </Link>
      )}
    </div>
  )
}

/** Standardabstand zwischen den Sektionen der Storefront. */
export function Section({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('py-14 sm:py-20', className)} {...props}>
      {children}
    </section>
  )
}
