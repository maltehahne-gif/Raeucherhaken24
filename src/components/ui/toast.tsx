'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Toast-Meldungen.
 *
 * Ausgabe in einer Live-Region, damit Screenreader Rueckmeldungen mitbekommen.
 * Fehler bleiben laenger stehen als Erfolgsmeldungen; kritische Meldungen
 * verschwinden nicht automatisch.
 */

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
  /** 0 = bleibt stehen, bis der Nutzer schliesst. */
  duration?: number
}

interface ToastContextValue {
  toast: (input: Omit<Toast, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast muss innerhalb von <ToastProvider> verwendet werden')
  return ctx
}

const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  success: 4_000,
  info: 5_000,
  error: 8_000,
}

let counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (input: Omit<Toast, 'id'>) => {
      counter += 1
      const id = `toast-${counter}`
      const duration = input.duration ?? DEFAULT_DURATIONS[input.tone]
      setToasts((current) => [...current.slice(-3), { ...input, id }])
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
    },
    [dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
      map.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

const icons: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const tones: Record<ToastTone, string> = {
  success: 'border-success-100 bg-success-50 text-success-700',
  error: 'border-danger-100 bg-danger-50 text-danger-700',
  info: 'border-[var(--border-default)] bg-[var(--surface-raised)] text-ink',
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <div
      role="region"
      aria-label="Benachrichtigungen"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:bottom-0 sm:items-end"
    >
      {toasts.map((toast) => {
        const Icon = icons[toast.tone]
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            className={cn(
              'animate-fade-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-[var(--shadow-raised)]',
              tones[toast.tone],
            )}
          >
            <Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs leading-relaxed opacity-85">{toast.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Meldung schließen"
              className="-mt-0.5 -mr-1 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
