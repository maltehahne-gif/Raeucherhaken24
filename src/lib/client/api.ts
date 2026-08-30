'use client'

/**
 * Schmaler Fetch-Wrapper fuer alle schreibenden Aufrufe aus dem Browser.
 *
 * Er setzt automatisch den CSRF-Header aus dem Cookie, behandelt
 * Netzwerkfehler und liefert Fehlermeldungen bereits in deutscher Sprache —
 * technische Details erreichen die Oberflaeche nie.
 */

export const CSRF_COOKIE = 'rh24_csrf'
export const CSRF_HEADER = 'x-csrf-token'

export interface ApiFailure {
  ok: false
  error: string
  fieldErrors?: Record<string, string>
  code?: string
  status: number
}

export interface ApiSuccess<T> {
  ok: true
  data: T
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure

function readCsrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

export async function apiRequest<T>(
  url: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && method !== 'HEAD') headers[CSRF_HEADER] = readCsrfToken()

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'Anfrage abgebrochen.', status: 0, code: 'aborted' }
    }
    return {
      ok: false,
      status: 0,
      code: 'network',
      error: 'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.',
    }
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; fieldErrors?: Record<string, string>; code?: string }
    return {
      ok: false,
      status: response.status,
      error: body.error ?? defaultErrorFor(response.status),
      fieldErrors: body.fieldErrors,
      code: body.code,
    }
  }

  return { ok: true, data: payload as T }
}

function defaultErrorFor(status: number): string {
  switch (status) {
    case 401:
      return 'Bitte melden Sie sich an.'
    case 403:
      return 'Für diese Aktion fehlt Ihnen die Berechtigung.'
    case 404:
      return 'Der angeforderte Inhalt wurde nicht gefunden.'
    case 429:
      return 'Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.'
    default:
      return 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.'
  }
}
