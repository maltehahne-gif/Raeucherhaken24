'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/** Sternebewertung als Anzeige (schreibgeschuetzt). */
export function RatingStars({
  value,
  count,
  size = 'sm',
  className,
  showValue = false,
}: {
  value: number
  count?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
  showValue?: boolean
}) {
  const sizeClass = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' }[size]
  const rounded = Math.round(value * 2) / 2

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = rounded >= star
          const half = !filled && rounded >= star - 0.5
          return (
            <span key={star} className="relative">
              <Star className={cn(sizeClass, 'text-steel-200')} fill="currentColor" strokeWidth={0} />
              {(filled || half) && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: half ? '50%' : '100%' }}
                >
                  <Star
                    className={cn(sizeClass, 'text-[var(--accent)]')}
                    fill="currentColor"
                    strokeWidth={0}
                  />
                </span>
              )}
            </span>
          )
        })}
      </span>
      <span className="sr-only">
        {value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} von 5 Sternen
        {typeof count === 'number' ? `, ${count} Bewertungen` : ''}
      </span>
      {showValue && (
        <span className="tabular text-xs font-medium text-ink-soft" aria-hidden="true">
          {value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        </span>
      )}
      {typeof count === 'number' && (
        <span className="text-xs text-ink-faint" aria-hidden="true">
          ({count})
        </span>
      )}
    </span>
  )
}

/** Interaktive Sternebewertung als echte Radiogruppe (tastaturbedienbar). */
export function RatingInput({
  name,
  value,
  onChange,
  disabled = false,
  className,
}: {
  name: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}) {
  const [hover, setHover] = useState(0)
  const display = hover || value

  return (
    <fieldset className={cn('flex items-center gap-1', className)} disabled={disabled}>
      <legend className="sr-only">Bewertung abgeben</legend>
      {[1, 2, 3, 4, 5].map((star) => (
        <label
          key={star}
          className="cursor-pointer rounded p-0.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]"
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
        >
          <input
            type="radio"
            name={name}
            value={star}
            checked={value === star}
            onChange={() => onChange(star)}
            className="sr-only"
          />
          <Star
            className={cn(
              'size-6 transition-transform duration-150 hover:scale-110',
              display >= star ? 'text-[var(--accent)]' : 'text-steel-200',
            )}
            fill="currentColor"
            strokeWidth={0}
            aria-hidden="true"
          />
          <span className="sr-only">{star} von 5 Sternen</span>
        </label>
      ))}
    </fieldset>
  )
}
