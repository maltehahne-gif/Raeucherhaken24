'use client'

import { useCallback, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { IconButton } from '@/components/ui/button'

/**
 * Modaler Dialog mit vollstaendigem Fokusmanagement:
 *  - Fokus wandert beim Oeffnen in den Dialog
 *  - Tab bleibt im Dialog gefangen (Focus Trap)
 *  - Escape schliesst
 *  - Klick auf den Hintergrund schliesst
 *  - Beim Schliessen kehrt der Fokus auf das ausloesende Element zurueck
 *  - Der Hintergrund wird fuer Screenreader per aria-hidden ausgeblendet
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Position: mittig (Standard) oder als seitliches Panel. */
  placement?: 'center' | 'right'
  /** Verhindert Schliessen per Escape/Hintergrundklick (z. B. waehrend eines Vorgangs). */
  dismissible?: boolean
  className?: string
}

const sizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  placement = 'center',
  dismissible = true,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  const requestClose = useCallback(() => {
    if (dismissible) onClose()
  }, [dismissible, onClose])

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null

    // Scroll sperren, ohne Layout-Sprung durch verschwindende Scrollleiste.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const { overflow, paddingRight } = document.body.style
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`

    const panel = panelRef.current
    const initial = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel
    // rAF, damit das Panel bereits gerendert und fokussierbar ist.
    const raf = requestAnimationFrame(() => initial?.focus())

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        requestClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      previouslyFocused.current?.focus?.()
    }
  }, [open, requestClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex',
        placement === 'center' ? 'items-end justify-center sm:items-center' : 'items-stretch justify-end',
      )}
    >
      <div
        className="animate-fade-in absolute inset-0 bg-steel-900/45 backdrop-blur-[2px]"
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col bg-[var(--surface-raised)] shadow-[var(--shadow-overlay)] outline-none',
          placement === 'center'
            ? cn('animate-scale-in rounded-t-2xl sm:rounded-xl', sizes[size])
            : 'animate-slide-in-right h-full max-w-[26rem] sm:max-w-[28rem]',
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg leading-tight font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <IconButton label="Dialog schließen" onClick={onClose} className="-mt-1 -mr-1.5 shrink-0">
              <X className="size-4.5" aria-hidden="true" />
            </IconButton>
          )}
        </header>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-paper-sunken/60 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Bestaetigungsdialog fuer loeschende bzw. nicht umkehrbare Aktionen. */
export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  destructive = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-10 items-center rounded-md border border-[var(--border-default)] px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunken disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-autofocus
            onClick={() => void onConfirm()}
            disabled={loading}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white transition-colors disabled:opacity-50',
              destructive ? 'bg-danger-500 hover:bg-danger-700' : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">{description}</p>
    </Dialog>
  )
}
