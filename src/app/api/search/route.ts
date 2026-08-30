import { headers } from 'next/headers'
import { hashIp } from '@/lib/server/crypto'
import { logSearchQuery, searchProducts } from '@/lib/server/search'
import { checkRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit'
import { formatPrice } from '@/lib/money'
import { handleRouteError, jsonOk, jsonRateLimited } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

/**
 * Suggest-Endpunkt fuer die Sofortsuche (Cmd/Strg + K).
 * Liefert bewusst nur die Felder, die das Overlay wirklich anzeigt.
 */
export async function GET(request: Request) {
  try {
    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
    const limit = checkRateLimit(`search:${hashIp(ip)}`, RATE_LIMITS.search.limit, RATE_LIMITS.search.windowMs)
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds)

    const query = new URL(request.url).searchParams.get('q')?.slice(0, 120) ?? ''
    if (query.trim().length < 2) {
      return jsonOk({ items: [], total: 0, suggestions: [], query })
    }

    const result = await searchProducts(query, { limit: 8 })
    void logSearchQuery(query, result.total)

    return jsonOk({
      query,
      total: result.total,
      suggestions: result.suggestions,
      items: result.items.map((item) => ({
        slug: item.slug,
        name: item.name,
        categoryName: item.categoryName,
        priceLabel: formatPrice(item.priceCents),
        imageUrl: item.imageUrl,
        inStock: item.stock > 0,
      })),
    })
  } catch (error) {
    return handleRouteError(error, 'search:get')
  }
}
