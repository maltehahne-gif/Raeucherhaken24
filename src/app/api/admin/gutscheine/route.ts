import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonCreated, jsonError, readJson } from '@/lib/server/http'
import { couponSchema } from '@/lib/validation/coupon'

export const dynamic = 'force-dynamic'

/**
 * Anlage eines Gutscheins.
 *
 * Der Code ist die fachliche Kennung und wird vor dem Schreiben auf
 * Eindeutigkeit geprueft, damit der Bearbeiter eine Meldung am Feld bekommt
 * statt eines Datenbankfehlers. Der Unique-Index der Datenbank bleibt die
 * eigentliche Zusicherung — diese Pruefung ist Bedienkomfort.
 */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('coupons:write')
    const data = couponSchema.parse(await readJson(request))

    const existing = await prisma.coupon.findUnique({ where: { code: data.code }, select: { id: true } })
    if (existing) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
        fieldErrors: { code: 'Dieser Gutscheincode ist bereits vergeben.' },
      })
    }

    const coupon = await prisma.coupon.create({
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
      select: { id: true, code: true },
    })

    await writeAuditLog({
      userId: session.user.id,
      action: 'coupon.created',
      entity: 'Coupon',
      entityId: coupon.id,
      detail: {
        code: coupon.code,
        type: data.type,
        value: data.value,
        usageLimit: data.usageLimit,
        active: data.active,
      },
      ip: await getClientIp(),
    })

    return jsonCreated({
      id: coupon.id,
      redirectTo: `/admin/gutscheine/${coupon.id}`,
      message: `Der Gutschein „${coupon.code}“ wurde angelegt.`,
    })
  } catch (error) {
    return handleRouteError(error, 'admin:gutscheine:post')
  }
}
