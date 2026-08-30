import { cookies, headers } from 'next/headers'
import { generateToken, safeEqual } from '@/lib/server/crypto'

/**
 * CSRF-Schutz nach dem Double-Submit-Verfahren, ergaenzt um eine
 * Origin-/Referer-Pruefung.
 *
 * Der Token liegt in einem nicht-HttpOnly-Cookie (damit JavaScript ihn in den
 * Header schreiben kann) und muss bei jeder zustandsaendernden Anfrage im
 * Header `x-csrf-token` mitgeschickt werden. Ein fremder Origin kann den
 * Cookie-Wert nicht lesen und den Header damit nicht korrekt setzen.
 */
export const CSRF_COOKIE = 'rh24_csrf'
export const CSRF_HEADER = 'x-csrf-token'

/** Liest den vorhandenen Token oder erzeugt einen neuen (Server Component). */
export async function ensureCsrfToken(): Promise<string> {
  const store = await cookies()
  const existing = store.get(CSRF_COOKIE)?.value
  if (existing && existing.length >= 32) return existing

  const token = generateToken(32)
  store.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return token
}

export async function getCsrfToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(CSRF_COOKIE)?.value ?? null
}

export interface CsrfCheck {
  ok: boolean
  reason?: string
}

/**
 * Prueft eine zustandsaendernde Anfrage.
 * Beide Bedingungen muessen erfuellt sein: gleicher Origin und gueltiger Token.
 */
export async function verifyCsrf(request: Request): Promise<CsrfCheck> {
  const h = await headers()
  const origin = request.headers.get('origin') ?? h.get('origin')
  const host = h.get('host')

  if (origin) {
    let originHost: string
    try {
      originHost = new URL(origin).host
    } catch {
      return { ok: false, reason: 'Ungültige Herkunft der Anfrage.' }
    }
    if (host && originHost !== host) {
      return { ok: false, reason: 'Die Anfrage stammt von einer fremden Domain.' }
    }
  } else {
    // Ohne Origin-Header pruefen wir den Referer als Rueckfallebene.
    const referer = h.get('referer')
    if (referer) {
      try {
        if (host && new URL(referer).host !== host) {
          return { ok: false, reason: 'Die Anfrage stammt von einer fremden Domain.' }
        }
      } catch {
        return { ok: false, reason: 'Ungültige Herkunft der Anfrage.' }
      }
    }
  }

  const store = await cookies()
  const cookieToken = store.get(CSRF_COOKIE)?.value
  const headerToken = request.headers.get(CSRF_HEADER) ?? h.get(CSRF_HEADER)

  if (!cookieToken || !headerToken) {
    return { ok: false, reason: 'Sicherheitstoken fehlt. Bitte laden Sie die Seite neu.' }
  }
  if (!safeEqual(cookieToken, headerToken)) {
    return { ok: false, reason: 'Sicherheitstoken ungültig. Bitte laden Sie die Seite neu.' }
  }
  return { ok: true }
}
