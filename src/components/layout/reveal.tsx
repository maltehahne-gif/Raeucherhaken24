'use client'

import { useScrollReveal } from '@/lib/client/hooks'

/**
 * Aktiviert die Scroll-Einblendungen.
 * Rendert selbst nichts — der Effekt haengt allein an den data-reveal-Attributen
 * im Markup, damit Server Components ihn ohne Client-Wrapper nutzen koennen.
 */
export function RevealOnScroll() {
  useScrollReveal()
  return null
}
