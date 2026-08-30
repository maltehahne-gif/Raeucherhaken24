'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Aufklappbarer Abschnitt.
 *
 * Bewusst mit <button aria-expanded> statt <details>, weil damit die
 * Oeffnungsanimation und der Zustand von aussen steuerbar bleiben.
 * Der Inhalt bleibt im DOM, damit die Browsersuche ihn findet, wenn geoeffnet.
 */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  meta,
  className,
  headingLevel: Heading = 'h3',
}: {
  title: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  meta?: React.ReactNode
  className?: string
  headingLevel?: 'h2' | 'h3' | 'h4'
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()

  return (
    <div className={cn('border-b border-[var(--border-subtle)] last:border-b-0', className)}>
      <Heading className="m-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-[var(--accent)]"
        >
          <span className="font-display text-base font-semibold">{title}</span>
          <span className="flex shrink-0 items-center gap-3">
            {meta}
            <ChevronDown
              className={cn(
                'size-4.5 text-ink-muted transition-transform duration-300 [transition-timing-function:var(--ease-out-soft)]',
                open && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </span>
        </button>
      </Heading>
      <div
        id={id}
        hidden={!open}
        className={cn('pb-5 text-sm leading-relaxed text-ink-soft', open && 'animate-fade-in')}
      >
        {children}
      </div>
    </div>
  )
}
