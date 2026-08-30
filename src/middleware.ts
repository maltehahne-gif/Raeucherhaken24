import { NextResponse, type NextRequest } from 'next/server'

/**
 * Sicherheits-Header fuer jede Antwort.
 *
 * Die Content Security Policy arbeitet mit einer pro Anfrage erzeugten Nonce.
 * Next.js liest die Nonce aus dem CSP-Header der Anfrage und haengt sie an die
 * eigenen Script-Tags — dadurch kommt die Anwendung ohne 'unsafe-inline' fuer
 * Skripte aus.
 *
 * Fuer Styles ist 'unsafe-inline' derzeit noch noetig: Next.js und die
 * Font-Optimierung erzeugen Inline-Styles ohne Nonce. Das ist die uebliche
 * Einschraenkung und deutlich weniger kritisch als bei Skripten.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' erlaubt den von Next nachgeladenen Chunks das Ausfuehren,
    // ohne dass jede Datei einzeln erlaubt werden muss.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''}`.trim(),
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `manifest-src 'self'`,
    `worker-src 'self' blob:`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  response.headers.set('content-security-policy', csp)
  // frame-ancestors 'none' ersetzt X-Frame-Options in modernen Browsern;
  // der Header bleibt fuer aeltere Clients als zweite Ebene bestehen.
  response.headers.set('x-frame-options', 'DENY')
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()',
  )
  response.headers.set('cross-origin-opener-policy', 'same-origin')
  response.headers.set('x-dns-prefetch-control', 'on')

  if (!isDev) {
    response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload')
  }

  // Der Admin-Bereich darf niemals in einem Cache oder Index landen.
  if (request.nextUrl.pathname.startsWith('/admin')) {
    response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive')
    response.headers.set('cache-control', 'no-store, must-revalidate')
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Alle Pfade ausser statischen Next-Assets und Bilddateien —
     * fuer die bringt ein CSP-Header keinen Mehrwert und kostet nur Latenz.
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
