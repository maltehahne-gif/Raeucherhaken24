import { prisma } from '@/lib/db'
import { verifyCsrf } from '@/lib/server/csrf'
import { buildCartView, emptyCartView, getCartToken } from '@/lib/server/cart'
import { validateCoupon } from '@/lib/server/coupons'
import { applyCouponSchema } from '@/lib/validation/checkout'
import { handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

/**
 * Gutschein auf den Warenkorb anwenden.
 *
 * Der Code wird hier vollstaendig serverseitig geprueft. Der Browser erhaelt
 * nur das Ergebnis; die Rabatthoehe entsteht ausschliesslich in der
 * Pricing Engine.
 */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const token = await getCartToken()
    if (!token) return jsonError('Ihr Warenkorb ist leer.', 400)

    const { code } = applyCouponSchema.parse(await readJson(request))
    const cart = await prisma.cart.findUnique({ where: { token }, select: { id: true } })
    if (!cart) return jsonError('Ihr Warenkorb ist leer.', 400)

    // Warenwert fuer die Mindestbestellwert-Pruefung ermitteln.
    const view = await buildCartView(token)
    if (view.lines.length === 0) return jsonError('Ihr Warenkorb ist leer.', 400)

    const validation = await validateCoupon(code, { subtotalCents: view.pricing.subtotalCents })
    if (!validation.ok) {
      return jsonError(validation.message ?? 'Dieser Gutschein ist nicht gültig.', 422, {
        code: validation.error,
      })
    }

    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: validation.coupon!.code } })
    return jsonOk(await buildCartView(token))
  } catch (error) {
    return handleRouteError(error, 'cart:coupon:post')
  }
}

/** Gutschein wieder entfernen. */
export async function DELETE(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const token = await getCartToken()
    if (!token) return jsonOk(emptyCartView())

    await prisma.cart.updateMany({ where: { token }, data: { couponCode: null } })
    return jsonOk(await buildCartView(token))
  } catch (error) {
    return handleRouteError(error, 'cart:coupon:delete')
  }
}
