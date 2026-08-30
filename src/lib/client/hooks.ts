'use client'

import { useEffect, useRef, useState } from 'react'

/** Verzoegert einen Wert — z. B. um die Suche nicht bei jedem Tastendruck auszuloesen. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/**
 * Liest und schreibt einen Wert im localStorage.
 * Faellt lautlos auf den Standardwert zurueck, wenn der Speicher nicht
 * verfuegbar ist (privater Modus, blockierte Cookies).
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [stored, setStored] = useState<T>(initialValue)
  const loaded = useRef(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) setStored(JSON.parse(raw) as T)
    } catch {
      // Speicher nicht verfuegbar — Standardwert bleibt bestehen.
    }
    loaded.current = true
  }, [key])

  function update(value: T) {
    setStored(value)
    if (!loaded.current) return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Schreiben fehlgeschlagen — der Zustand bleibt zumindest in dieser Sitzung erhalten.
    }
  }

  return [stored, update]
}

/** true, sobald die Komponente im Browser haengt — verhindert Hydration-Fehler. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

/**
 * Blendet Elemente beim Scrollen ein.
 * Respektiert `prefers-reduced-motion` und zeigt Inhalte dann sofort.
 */
export function useScrollReveal(): void {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal=""]')

    if (reduced || typeof IntersectionObserver === 'undefined') {
      elements.forEach((el) => el.setAttribute('data-reveal', 'shown'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-reveal', 'shown')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

/** Registriert eine globale Tastenkombination (z. B. Strg/Cmd + K). */
export function useHotkey(
  key: string,
  handler: () => void,
  options: { meta?: boolean; enabled?: boolean } = {},
): void {
  const { meta = true, enabled = true } = options
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== key.toLowerCase()) return
      if (meta && !(event.metaKey || event.ctrlKey)) return
      if (!meta && (event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      handlerRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, meta, enabled])
}
