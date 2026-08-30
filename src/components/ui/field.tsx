'use client'

import { createContext, forwardRef, useContext, useId } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Formularfelder.
 *
 * `Field` verbindet Label, Hilfetext und Fehlermeldung ueber IDs mit dem
 * Eingabeelement, damit Screenreader den Zusammenhang vorlesen. Fehler werden
 * zusaetzlich als `aria-invalid` und ueber eine Live-Region gemeldet.
 */

interface FieldContextValue {
  id: string
  descriptionId: string
  errorId: string
  hasError: boolean
  required: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext)
}

export interface FieldProps {
  label: string
  /** Erklaerender Text unter dem Label. */
  description?: string
  error?: string | null
  required?: boolean
  /** Label optisch ausblenden, aber fuer Screenreader behalten. */
  hideLabel?: boolean
  className?: string
  children: React.ReactNode
  /** Zusatz rechts neben dem Label, z. B. "Optional" oder ein Hinweis. */
  hint?: React.ReactNode
}

export function Field({
  label,
  description,
  error,
  required = false,
  hideLabel = false,
  className,
  children,
  hint,
}: FieldProps) {
  const id = useId()
  const value: FieldContextValue = {
    id: `${id}-input`,
    descriptionId: `${id}-desc`,
    errorId: `${id}-err`,
    hasError: Boolean(error),
    required,
  }

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <div className={cn('flex items-baseline justify-between gap-3', hideLabel && 'sr-only')}>
          <label htmlFor={value.id} className="text-sm font-medium text-ink">
            {label}
            {required && (
              <span className="ml-0.5 text-[var(--accent)]" aria-hidden="true">
                *
              </span>
            )}
          </label>
          {hint && <span className="text-xs text-ink-faint">{hint}</span>}
        </div>
        {description && (
          <p id={value.descriptionId} className="text-xs leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
        {children}
        {error && (
          <p
            id={value.errorId}
            role="alert"
            className="flex items-start gap-1.5 text-xs font-medium text-danger-700"
          >
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

const controlBase =
  'w-full rounded-md border bg-[var(--surface-raised)] text-ink placeholder:text-ink-faint ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'disabled:cursor-not-allowed disabled:bg-paper-sunken disabled:text-ink-faint ' +
  'read-only:bg-paper-sunken'

function controlState(hasError: boolean): string {
  return hasError
    ? 'border-danger-500 focus:border-danger-500 focus:ring-2 focus:ring-danger-100'
    : 'border-[var(--border-default)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]'
}

function ariaProps(ctx: FieldContextValue | null, ownError?: boolean) {
  if (!ctx) return {}
  const describedBy = [ctx.hasError ? ctx.errorId : null].filter(Boolean).join(' ')
  return {
    id: ctx.id,
    'aria-invalid': ctx.hasError || ownError || undefined,
    'aria-describedby': describedBy || undefined,
    'aria-required': ctx.required || undefined,
  }
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Symbol links im Feld. */
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leading, trailing, ...props },
  ref,
) {
  const ctx = useFieldContext()
  const input = (
    <input
      ref={ref}
      className={cn(
        controlBase,
        controlState(ctx?.hasError ?? false),
        'h-11 px-3.5 text-sm outline-none',
        leading && 'pl-10',
        trailing && 'pr-10',
        className,
      )}
      {...ariaProps(ctx)}
      {...props}
    />
  )

  if (!leading && !trailing) return input
  return (
    <div className="relative">
      {leading && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-ink-faint">
          {leading}
        </span>
      )}
      {input}
      {trailing && (
        <span className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-faint">
          {trailing}
        </span>
      )}
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    const ctx = useFieldContext()
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          controlBase,
          controlState(ctx?.hasError ?? false),
          'resize-y px-3.5 py-2.5 text-sm leading-relaxed outline-none',
          className,
        )}
        {...ariaProps(ctx)}
        {...props}
      />
    )
  },
)

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    const ctx = useFieldContext()
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            controlBase,
            controlState(ctx?.hasError ?? false),
            'h-11 appearance-none px-3.5 pr-10 text-sm outline-none',
            className,
          )}
          {...ariaProps(ctx)}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-muted"
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  },
)

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode
  description?: string
  error?: string | null
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, error, id, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${generatedId}-err`
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-2.5">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'mt-0.5 size-[18px] shrink-0 cursor-pointer rounded-xs border accent-[var(--accent)]',
            error ? 'border-danger-500' : 'border-[var(--border-strong)]',
          )}
          {...props}
        />
        <label htmlFor={inputId} className="cursor-pointer text-sm leading-snug text-ink-soft">
          {label}
          {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
        </label>
      </div>
      {error && (
        <p id={errorId} role="alert" className="ml-7 text-xs font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  )
})

/** Auswahl als klickbare Karten — fuer Konfigurator und Kaufberater. */
export interface OptionCardProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: string
  description?: string
  /** Zusatzangabe rechts, z. B. ein Aufpreis. */
  meta?: string
  inputType?: 'radio' | 'checkbox'
}

export const OptionCard = forwardRef<HTMLInputElement, OptionCardProps>(function OptionCard(
  { className, label, description, meta, inputType = 'radio', id, disabled, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-all duration-200',
        '[transition-timing-function:var(--ease-out-soft)]',
        'border-[var(--border-default)] bg-[var(--surface-raised)]',
        'hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-subtle)]',
        'has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)] has-[:checked]:shadow-[var(--shadow-subtle)]',
        'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type={inputType}
        disabled={disabled}
        className={cn(
          'mt-0.5 size-[18px] shrink-0 accent-[var(--accent)]',
          inputType === 'radio' ? 'rounded-full' : 'rounded-xs',
        )}
        {...props}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-sm font-medium text-ink">{label}</span>
          {meta && <span className="tabular text-xs font-medium text-ink-muted">{meta}</span>}
        </span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{description}</span>}
      </span>
    </label>
  )
})

/** Kleiner Hinweistext unter einer Feldgruppe. */
export function FormHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs leading-relaxed text-ink-muted', className)} {...props} />
}

/** Sammelmeldung ueber einem Formular. */
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
