import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { ZodError } from 'zod'

/**
 * Einheitliche HTTP-Antworten fuer alle Route Handler.
 *
 * Nach aussen gelangen ausschliesslich verstaendliche deutsche Meldungen.
 * Technische Details (Stacktraces, SQL-Fehler) werden serverseitig geloggt,
 * niemals an Endnutzer ausgeliefert.
 */

export interface ApiErrorBody {
  error: string
  /** Feldbezogene Fehler fuer Formulare: { feldname: "Meldung" } */
  fieldErrors?: Record<string, string>
  code?: string
}

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init })
}

export function jsonCreated<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 })
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Omit<ApiErrorBody, 'error'>,
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export function jsonUnauthorized(message = 'Bitte melden Sie sich an.'): NextResponse {
  return jsonError(message, 401)
}

export function jsonForbidden(message = 'Für diese Aktion fehlt Ihnen die Berechtigung.'): NextResponse {
  return jsonError(message, 403)
}

export function jsonNotFound(message = 'Nicht gefunden.'): NextResponse {
  return jsonError(message, 404)
}

export function jsonRateLimited(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}

/** Wandelt Zod-Fehler in feldbezogene deutsche Formularfehler. */
export function zodErrorResponse(error: ZodError): NextResponse {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
  }
  return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, { fieldErrors })
}

/**
 * Einheitliche Fehlerbehandlung fuer Route Handler.
 * Loggt serverseitig und gibt nach aussen eine neutrale Meldung.
 */
export function handleRouteError(error: unknown, context: string): NextResponse {
  if (error instanceof ZodError) return zodErrorResponse(error)
  if (error instanceof AppError) {
    return jsonError(error.message, error.status, { code: error.code })
  }
  console.error(`[${context}]`, error)
  return jsonError('Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.', 500)
}

/** Fachlicher Fehler mit einer Meldung, die dem Endnutzer gezeigt werden darf. */
export class AppError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
  }
}

/** Client-IP aus den Proxy-Headern; faellt auf einen Platzhalter zurueck. */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return h.get('x-real-ip') ?? '0.0.0.0'
}

/** Liest den JSON-Body defensiv; liefert null bei ungueltigem JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return null
    return await request.json()
  } catch {
    return null
  }
}
