import type { MetadataRoute } from 'next'
import { absoluteUrl, SITE } from '@/lib/seo/site'

/**
 * robots.txt.
 *
 * Gesperrt sind Bereiche, die entweder personenbezogen sind (Warenkorb, Kasse,
 * Bestellstatus, Verwaltung) oder beliebig viele nahezu gleiche URLs erzeugen
 * (Suche mit Parametern).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/warenkorb', '/kasse', '/bestellung/', '/suche'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE.url,
  }
}
