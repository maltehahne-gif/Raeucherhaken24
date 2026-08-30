'use client'

import { useEffect } from 'react'

const KEY = 'rh24:recently-viewed'
const MAX = 12

/**
 * Merkt sich zuletzt angesehene Produkte im localStorage.
 *
 * Bewusst nur lokal: dafuer braucht es kein Nutzerkonto und keine
 * serverseitige Speicherung personenbezogener Daten. Faellt der Speicher aus,
 * entfaellt lediglich die Merkliste.
 */
export function RecentlyViewedTracker({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY)
      const list: string[] = raw ? (JSON.parse(raw) as string[]) : []
      const next = [slug, ...list.filter((s) => s !== slug)].slice(0, MAX)
      window.localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Speicher nicht verfuegbar — Funktion entfaellt stillschweigend.
    }
  }, [slug])

  return null
}

/** Liest die gemerkten Slugs (fuer die Anzeige auf der Startseite). */
export function readRecentlyViewed(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}
