import { headers } from 'next/headers'
import { hashIp } from '@/lib/server/crypto'
import { verifyCsrf } from '@/lib/server/csrf'
import { getCartToken } from '@/lib/server/cart'
import { createOrder } from '@/lib/server/orders'
import { checkoutSchema } from '@/lib/validation/checkout'
import { checkRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit'
import { handleRouteError, jsonError, jsonOk, jsonRateLimited, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

/**
 * Bestellung anlegen.
 *
 * Aus dem Browser kommen ausschliesslich Adressdaten, ein Gutscheincode und
 * ein Idempotenzschluessel. Positionen, Mengen und saemtliche Betraege
 * berechnet der Server neu aus Warenkorb und Stammdaten.
 */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
    const limit = checkRateLimit(
      `checkout:${hashIp(ip)}`,
      RATE_LIMITS.checkout.limit,
      RATE_LIMITS.checkout.windowMs,
    )
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds)

    const parsed = checkoutSchema.safeParse(await readJson(request))
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.')
        if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
      }
      // Die Spamfalle bekommt bewusst dieselbe neutrale Antwort wie ein
      // Formularfehler, damit ein Bot nicht lernt, welches Feld ihn verraet.
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, { fieldErrors })
    }

    const input = parsed.data
    const cartToken = await getCartToken()
    if (!cartToken) return jsonError('Ihr Warenkorb ist leer.', 400, { code: 'empty_cart' })

    const result = await createOrder({
      cartToken,
      idempotencyKey: input.idempotencyKey,
      couponCode: input.couponCode ?? null,
      contact: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company ?? null,
        phone: input.phone ?? null,
        street: input.street,
        postalCode: input.postalCode,
        city: input.city,
        note: input.note ?? null,
      },
    })

    return jsonOk({
      orderNumber: result.orderNumber,
      totalCents: result.totalCents,
      redirectTo: `/bestellung/${result.orderNumber}`,
    })
  } catch (error) {
    return handleRouteError(error, 'checkout:post')
  }
}
