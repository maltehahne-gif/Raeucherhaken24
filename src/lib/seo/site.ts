/**
 * Stammdaten der Website fuer Metadaten, strukturierte Daten und Sitemap.
 *
 * Bewusst KEINE erfundenen Firmendaten: Anschrift, Handelsregister und
 * Umsatzsteuer-ID sind rechtlich verbindliche Angaben und muessen vom Betreiber
 * ergaenzt werden (siehe /impressum). Was hier steht, sind ausschliesslich
 * technische Angaben und Platzhalter, die als solche gekennzeichnet sind.
 */

export const SITE = {
  name: 'Räucherhaken24',
  shortName: 'Räucherhaken24',
  tagline: 'Räucherbedarf für Handwerk und Anspruch',
  description:
    'Räucherhaken aus Edelstahl, Räuchermehl, Räucherlaugen und Naturgewürze für Fischräucherei, Fleischverarbeitung und ambitionierte Selbstversorger.',
  locale: 'de_DE',
  language: 'de',
  currency: 'EUR',
  /** Wird ausschliesslich aus der Umgebung gelesen — nie hart verdrahtet. */
  get url(): string {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  },
  contact: {
    email: process.env.MAIL_SUPPORT ?? 'service@raeucherhaken24.example',
  },
} as const

/** Baut eine absolute URL aus einem Pfad. */
export function absoluteUrl(path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${SITE.url}${normalized === '/' ? '' : normalized}`
}
