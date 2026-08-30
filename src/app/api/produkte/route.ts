import { getProductsBySlugs } from '@/lib/server/catalog'
import { handleRouteError, jsonOk } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

/**
 * Liefert Anzeigedaten zu einer Liste von Produkt-Slugs.
 * Wird fuer "zuletzt angesehen" gebraucht, weil diese Liste ausschliesslich
 * im Browser gefuehrt wird.
 */
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get('slugs') ?? ''
    const slugs = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[a-z0-9-]{1,96}$/.test(s))
      .slice(0, 12)

    if (slugs.length === 0) return jsonOk({ products: [] })
    return jsonOk({ products: await getProductsBySlugs(slugs) })
  } catch (error) {
    return handleRouteError(error, 'produkte:get')
  }
}
