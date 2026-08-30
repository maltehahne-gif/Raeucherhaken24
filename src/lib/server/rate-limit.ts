import { prisma } from '@/lib/db'

/**
 * Rate-Limiting.
 *
 * Zwei Ebenen:
 *  - In-Memory-Fenster fuer haeufige, unkritische Endpunkte (Suche, Chat).
 *    Prozesslokal, ohne Datenbankzugriff, damit die Suche schnell bleibt.
 *  - Datenbankgestuetztes Fenster fuer Login und andere sicherheitskritische
 *    Endpunkte. Ueberlebt Neustarts und wirkt ueber mehrere Instanzen hinweg.
 *
 * Fuer horizontal skalierte Deployments sollte die In-Memory-Variante durch
 * Redis ersetzt werden; die Schnittstelle ist bewusst schmal gehalten.
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Sekunden bis zum naechsten erlaubten Versuch (0, wenn erlaubt). */
  retryAfterSeconds: number
}

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
let lastSweep = 0

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/** Prozesslokales Limit: `limit` Anfragen je `windowMs`. */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 }
}

/** Nur fuer Tests: setzt alle prozesslokalen Zaehler zurueck. */
export function resetRateLimits(): void {
  buckets.clear()
  lastSweep = 0
}

/**
 * Persistentes Limit fuer Loginversuche.
 * Zaehlt fehlgeschlagene Versuche je Schluessel im Zeitfenster.
 */
export async function checkLoginRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - windowMs)
  const failures = await prisma.loginAttempt.count({
    where: { key, success: false, createdAt: { gte: since } },
  })

  if (failures >= limit) {
    const oldest = await prisma.loginAttempt.findFirst({
      where: { key, success: false, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    })
    const resetAt = (oldest?.createdAt.getTime() ?? Date.now()) + windowMs
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    }
  }

  return { allowed: true, remaining: limit - failures, retryAfterSeconds: 0 }
}

export async function recordLoginAttempt(key: string, success: boolean): Promise<void> {
  await prisma.loginAttempt.create({ data: { key, success } })
  if (success) {
    // Nach erfolgreichem Login das Fenster leeren, damit ein Nutzer nicht
    // durch frueheres Vertippen gesperrt bleibt.
    await prisma.loginAttempt.deleteMany({ where: { key, success: false } })
  }
}

/** Aufraeumen alter Eintraege; wird beim Login beilaeufig aufgerufen. */
export async function pruneLoginAttempts(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - olderThanMs) } },
  })
}

/** Standardlimits an einer Stelle, damit sie ueberpruefbar bleiben. */
export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60 * 1000 },
  contact: { limit: 5, windowMs: 10 * 60 * 1000 },
  checkout: { limit: 12, windowMs: 10 * 60 * 1000 },
  search: { limit: 90, windowMs: 60 * 1000 },
  advisor: { limit: 25, windowMs: 5 * 60 * 1000 },
  upload: { limit: 20, windowMs: 10 * 60 * 1000 },
  rating: { limit: 10, windowMs: 60 * 60 * 1000 },
} as const
