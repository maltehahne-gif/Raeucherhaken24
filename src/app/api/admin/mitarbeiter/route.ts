import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { hashPassword } from '@/lib/server/crypto'
import { getClientIp, handleRouteError, jsonCreated, jsonError, readJson } from '@/lib/server/http'
import { userCreateSchema } from '@/lib/validation/user'

export const dynamic = 'force-dynamic'

/**
 * Anlage eines Mitarbeiterkontos.
 *
 * Das Passwort verlaesst diese Funktion nie im Klartext: Es wird sofort mit
 * scrypt gehasht und weder protokolliert noch zurueckgegeben. Die
 * E-Mail-Adresse ist die Anmeldekennung und wird vor dem Schreiben auf
 * Eindeutigkeit geprueft, damit der Bearbeiter eine Meldung am Feld bekommt
 * statt eines Datenbankfehlers; der Unique-Index bleibt die eigentliche
 * Zusicherung.
 */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('users:write')
    const data = userCreateSchema.parse(await readJson(request))

    const [existing, role] = await Promise.all([
      prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
      prisma.role.findUnique({ where: { id: data.roleId }, select: { id: true, key: true, name: true } }),
    ])

    if (existing) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
        fieldErrors: {
          email: 'Für diese E-Mail-Adresse besteht bereits ein Konto. Reaktivieren Sie es statt ein zweites anzulegen.',
        },
      })
    }
    if (!role) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, {
        fieldErrors: { roleId: 'Diese Rolle gibt es nicht mehr. Bitte wählen Sie eine andere.' },
      })
    }

    const user = await prisma.user.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: await hashPassword(data.password),
        roleId: role.id,
        active: data.active,
      },
      select: { id: true, firstName: true, lastName: true },
    })

    await writeAuditLog({
      userId: session.user.id,
      action: 'user.created',
      entity: 'User',
      entityId: user.id,
      detail: { email: data.email, role: role.key, active: data.active },
      ip: await getClientIp(),
    })

    return jsonCreated({
      id: user.id,
      redirectTo: `/admin/mitarbeiter/${user.id}`,
      message: data.active
        ? `Das Konto für ${user.firstName} ${user.lastName} wurde angelegt und ist sofort nutzbar.`
        : `Das Konto für ${user.firstName} ${user.lastName} wurde angelegt und ist noch deaktiviert.`,
    })
  } catch (error) {
    return handleRouteError(error, 'admin:mitarbeiter:post')
  }
}
