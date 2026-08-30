import { headers } from 'next/headers'
import { z } from 'zod'
import { verifyCsrf } from '@/lib/server/csrf'
import { destroySession, login } from '@/lib/server/auth'
import { writeAuditLog } from '@/lib/server/audit'
import { handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

const loginSchema = z.object({
  email: z.string().min(3).max(160),
  password: z.string().min(1).max(200),
})

/** Anmeldung im Admin-Bereich. */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const parsed = loginSchema.safeParse(await readJson(request))
    if (!parsed.success) {
      // Bewusst dieselbe Meldung wie bei falschen Zugangsdaten —
      // ein Angreifer soll aus der Antwort nichts ableiten koennen.
      return jsonError('E-Mail-Adresse oder Passwort ist nicht korrekt.', 401)
    }

    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
    const result = await login(parsed.data.email, parsed.data.password, ip)

    if (!result.ok) {
      return jsonError(result.error ?? 'Anmeldung fehlgeschlagen.', result.retryAfterSeconds ? 429 : 401)
    }

    await writeAuditLog({
      userId: result.user?.id,
      action: 'auth.login',
      entity: 'User',
      entityId: result.user?.id,
      ip,
    })

    return jsonOk({ redirectTo: '/admin' })
  } catch (error) {
    return handleRouteError(error, 'admin:auth:post')
  }
}

/** Abmeldung. */
export async function DELETE(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)
    await destroySession()
    return jsonOk({ redirectTo: '/admin/anmelden' })
  } catch (error) {
    return handleRouteError(error, 'admin:auth:delete')
  }
}
