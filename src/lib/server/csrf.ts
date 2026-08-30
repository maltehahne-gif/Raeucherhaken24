import { cookies, headers } from 'next/headers'
import { safeEqual } from '@/lib/server/crypto'

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

/**
 * Liest das CSRF-Token fuer die Ausgabe im Markup.
 *
 * Erzeugt wird das Token in der Middleware (src/middleware.ts) — Server
 * Components duerfen in Next.js keine Cookies schreiben. Kommt hier
 * ausnahmsweise nichts an (etwa weil die Middleware fuer den Pfad nicht
 * greift), liefert die Funktion einen leeren String; die Pruefung im Server
 * lehnt die Anfrage dann sauber ab, statt sie unbemerkt durchzulassen.
 */
export async function ensureCsrfToken(): Promise<string> {
  const store = await cookies()
  return store.get(CSRF_COOKIE)?.value ?? ''
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
