import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'
import { couponActivationSchema, couponSchema } from '@/lib/validation/coupon'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Aenderungen an einem Gutschein.
 *
 * Zwei Faelle teilen sich diese Route: der Schnellschalter aus der Liste
 * (nur `active`) und das vollstaendige Formular. Der Schnellschalter wird
 * zuerst geprueft, weil er das engere Schema hat.
 *
 * Bereits vergebene Einloesungen bleiben unberuehrt: Sie sind Bestandteil
 * abgeschlossener Bestellungen und duerfen sich nicht nachtraeglich aendern.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('coupons:write')
    const { id } = await context.params

    const existing = await prisma.coupon.findUnique({
      where: { id },
      select: { id: true, code: true, active: true, usageCount: true },
    })
    if (!existing) return jsonError('Dieser Gutschein wurde nicht gefunden.', 404)

    const body = await readJson(request)
    const ip = await getClientIp()

    const activation = couponActivationSchema.safeParse(body)
    if (activation.success) {
      if (activation.data.active !== existing.active) {
        await prisma.coupon.update({ where: { id }, data: { active: activation.data.active } })
        await writeAuditLog({
          userId: session.user.id,
          action: activation.data.active ? 'coupon.activated' : 'coupon.deactivated',
          entity: 'Coupon',
          entityId: id,
          detail: { code: existing.code },
          ip,
        })
      }
      return jsonOk({
        id,
        active: activation.data.active,
        message: activation.data.active
          ? `„${existing.code}“ ist wieder einlösbar.`
          : `„${existing.code}“ ist deaktiviert und wird im Shop abgelehnt.`,
      })
    }

    const data = couponSchema.parse(body)

    const conflict = await prisma.coupon.findFirst({
      where: { code: data.code, NOT: { id } },
      select: { id: true },
    })
    if (conflict) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
        fieldErrors: { code: 'Dieser Gutscheincode ist bereits vergeben.' },
      })
    }

    // Das Nutzungslimit darf nicht unter die bereits erfolgten Einloesungen
    // fallen — sonst stuende in der Liste "7 von 5".
    if (data.usageLimit > 0 && data.usageLimit < existing.usageCount) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, {
        fieldErrors: {
          usageLimit: `Dieser Gutschein wurde bereits ${existing.usageCount}-mal eingelöst. Das Limit kann nicht darunter liegen.`,
        },
      })
    }

    await prisma.coupon.update({
      where: { id },
      data: {
        code: data.code,
        description: data.description,
        type: data.type,
        value: data.value,
        minOrderValueCents: data.minOrderValueCents,
        maxDiscountCents: data.maxDiscountCents,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        usageLimit: data.usageLimit,
        perCustomerLimit: data.perCustomerLimit,
        active: data.active,
      },
    })

    await writeAuditLog({
      userId: session.user.id,
      action: 'coupon.updated',
      entity: 'Coupon',
      entityId: id,
      detail: {
        code: data.code,
        previousCode: existing.code,
        type: data.type,
        value: data.value,
        usageLimit: data.usageLimit,
        active: data.active,
      },
      ip,
    })

    return jsonOk({
      id,
      redirectTo: `/admin/gutscheine/${id}`,
      message: 'Die Änderungen wurden gespeichert.',
    })
  } catch (error) {
    return handleRouteError(error, 'admin:gutscheine:patch')
  }
}

/**
 * Loeschen eines Gutscheins.
 *
 * Eingeloeste Gutscheine bleiben erhalten: Ihre Einloesungen haengen an
 * Bestellungen und begruenden dort den Rabattbetrag. Statt zu loeschen wird
 * ein solcher Gutschein deaktiviert.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('coupons:write')
    const { id } = await context.params

    const existing = await prisma.coupon.findUnique({
      where: { id },
      select: { id: true, code: true },
    })
    if (!existing) return jsonError('Dieser Gutschein wurde nicht gefunden.', 404)

    const redemptions = await prisma.couponRedemption.count({ where: { couponId: id } })
    if (redemptions > 0) {
      return jsonError(
        `„${existing.code}“ wurde ${redemptions}-mal eingelöst und kann deshalb nicht gelöscht werden. ` +
          'Deaktivieren Sie den Gutschein stattdessen — er wird dann abgelehnt, und die Rabatte der bestehenden Bestellungen bleiben nachvollziehbar.',
        409,
        { code: 'has_redemptions' },
      )
    }

    await prisma.coupon.delete({ where: { id } })

    await writeAuditLog({
      userId: session.user.id,
      action: 'coupon.deleted',
      entity: 'Coupon',
      entityId: id,
      detail: { code: existing.code },
      ip: await getClientIp(),
    })

    return jsonOk({
      redirectTo: '/admin/gutscheine',
      message: `Der Gutschein „${existing.code}“ wurde gelöscht.`,
    })
  } catch (error) {
    return handleRouteError(error, 'admin:gutscheine:delete')
  }
}
