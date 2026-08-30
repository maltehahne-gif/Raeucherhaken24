import { forwardRef } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/**
 * Button in den Varianten des Design-Systems.
 * `asChild` gibt es bewusst nicht — stattdessen `ButtonLink` fuer Navigation,
 * damit ein Link im DOM auch ein <a> bleibt (Tastatur, Kontextmenue, SEO).
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'inverted'
  | 'link'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const base =
  'relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap ' +
  'transition-[background-color,color,border-color,box-shadow,transform] duration-200 ' +
  '[transition-timing-function:var(--ease-out-soft)] ' +
  'disabled:pointer-events-none disabled:opacity-50 ' +
  'active:translate-y-px select-none'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[var(--shadow-subtle)] ' +
    'hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-card)]',
  secondary:
    'bg-steel-800 text-steel-50 shadow-[var(--shadow-subtle)] hover:bg-steel-900',
  outline:
    'border border-[var(--border-default)] bg-[var(--surface-raised)] text-ink ' +
    'hover:border-[var(--border-strong)] hover:bg-paper-sunken',
  ghost: 'text-ink-soft hover:bg-paper-sunken hover:text-ink',
  danger: 'bg-danger-500 text-white shadow-[var(--shadow-subtle)] hover:bg-danger-700',
  inverted:
    'bg-[var(--surface-raised)] text-ink shadow-[var(--shadow-card)] hover:bg-paper-sunken',
  link: 'text-[var(--accent)] underline underline-offset-4 decoration-[1.5px] decoration-[var(--accent-border)] hover:decoration-[var(--accent)] px-0',
}

const sizes: Record<ButtonSize, string> = {
  // Touch-Ziele: ab sm mindestens 40 px, md 44 px hoch.
  xs: 'h-8 rounded-sm px-2.5 text-xs',
  sm: 'h-10 rounded-md px-3.5 text-sm',
  md: 'h-11 rounded-md px-5 text-sm',
  lg: 'h-13 rounded-lg px-7 text-base',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Zeigt einen Spinner und sperrt den Button. */
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, fullWidth, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading && <Spinner className="size-4 shrink-0" />}
      {children}
    </button>
  )
})

export interface ButtonLinkProps extends React.ComponentPropsWithoutRef<typeof Link> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

export function ButtonLink({
  className,
  variant = 'primary',
  size = 'md',
  fullWidth,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...props}
    />
  )
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Pflicht: Icon-Buttons brauchen einen zugaenglichen Namen. */
  label: string
}

const iconSizes: Record<ButtonSize, string> = {
  xs: 'size-8 rounded-sm',
  sm: 'size-10 rounded-md',
  md: 'size-11 rounded-md',
  lg: 'size-13 rounded-lg',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = 'ghost', size = 'sm', label, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], iconSizes[size], 'px-0', className)}
      {...props}
    />
  )
})

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
