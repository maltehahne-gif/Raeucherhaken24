import type { JsonLd } from '@/lib/seo/structured-data'

/**
 * Gibt strukturierte Daten als JSON-LD aus.
 *
 * JSON.stringify liefert bereits gueltiges JSON; zusaetzlich wird `<` maskiert,
 * damit ein in den Daten enthaltenes "</script>" das Script-Tag nicht vorzeitig
 * beenden kann.
 */
export function JsonLdScript({ data }: { data: JsonLd | JsonLd[] | null }) {
  if (!data) return null
  const payload = JSON.stringify(data).replace(/</g, '\\u003c')
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: payload }}
    />
  )
}
