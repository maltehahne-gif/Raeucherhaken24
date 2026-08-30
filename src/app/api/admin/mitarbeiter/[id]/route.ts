import { prisma } from '@/lib/db'
import { destroyAllSessionsForUser, requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { hashPassword } from '@/lib/server/crypto'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'
import {
  userActivationSchema,
  userSessionRevokeSchema,
  userUpdateSchema,
} from '@/lib/validation/user'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Aenderungen an einem Mitarbeiterkonto.
 *
 * Drei Faelle teilen sich diese Route: der Schnellschalter aus der Liste
 * (`intent: 'activation'`), die erzwungene Abmeldung (`intent: 'sessions'`)
 * und das vollstaendige Formular. Die schmalen Schemata werden zuerst
 * geprueft, weil sie eindeutig sind.
 *
 * Vier Regeln gelten unabhaengig davon, was die Oberflaeche anbietet:
 *  1. Niemand deaktiviert oder loescht das eigene Konto.
 *  2. Niemand aendert die eigene Rolle (kein Selbst-Hochstufen).
 *  3. Deaktivierung und Rollenwechsel beenden alle Sitzungen des Kontos —
 *     sonst behielte eine offene Sitzung ihre alten Rechte bis zum Ablauf.
 *  4. Das letzte aktive Konto mit `users:write` bleibt bestehen, sonst
 *     koennte niemand mehr Konten verwalten.
 */

/** Berechtigung, ohne die sich der Betrieb selbst aussperren wuerde. */
const LOCKOUT_PERMISSION = 'users:write'

/**
 * Zaehlt aktive Konten mit einer Berechtigung — ohne das gerade bearbeitete.
 * Ergibt sich hier 0, waere die Aenderung eine Selbstaussperrung.
 */
async function countOtherActiveHolders(permission: string, exceptUserId: string): Promise<number> {
  return prisma.user.count({
    where: {
      active: true,
      id: { not: exceptUserId },
      role: { permissions: { some: { permission: { key: permission } } } },
    },
  })
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('users:write')
    const { id } = await context.params

    const existing = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        active: true,
        roleId: true,
        role: {
          select: {
            key: true,
            name: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    })
    if (!existing) return jsonError('Dieses Mitarbeiterkonto wurde nicht gefunden.', 404)

    const isSelf = existing.id === session.user.id
    const fullName = `${existing.firstName} ${existing.lastName}`
    const holdsLockoutPermission = existing.role.permissions.some(
      (entry) => entry.permission.key === LOCKOUT_PERMISSION,
    )
    const body = await readJson(request)
    const ip = await getClientIp()

    // --- 1. Schnellschalter aus der Liste ---------------------------------
    const activation = userActivationSchema.safeParse(body)
    if (activation.success) {
      const next = activation.data.active

      if (next === existing.active) {
        return jsonOk({ id, active: next, message: 'Der Status war bereits so gesetzt.' })
      }

      if (!next && isSelf) {
        return jsonError(
          'Ihr eigenes Konto können Sie nicht deaktivieren. Bitten Sie eine zweite Person mit der Berechtigung „Mitarbeitende verwalten“ darum.',
          409,
          { code: 'self_deactivation' },
        )
      }

      if (!next && holdsLockoutPermission && (await countOtherActiveHolders(LOCKOUT_PERMISSION, id)) === 0) {
        return jsonError(
          `${fullName} ist das letzte aktive Konto, das Mitarbeitende verwalten darf. Legen Sie zuerst ein weiteres Konto mit dieser Berechtigung an — sonst sperrt sich der Betrieb aus.`,
          409,
          { code: 'last_administrator' },
        )
      }

      await prisma.user.update({ where: { id }, data: { active: next } })
      // Ein deaktiviertes Konto darf keine offene Sitzung behalten.
      if (!next) await destroyAllSessionsForUser(id)

      await writeAuditLog({
        userId: session.user.id,
        action: next ? 'user.activated' : 'user.deactivated',
        entity: 'User',
        entityId: id,
        detail: { email: existing.email },
        ip,
      })

      return jsonOk({
        id,
        active: next,
        message: next
          ? `${fullName} kann sich wieder anmelden.`
          : `${fullName} ist deaktiviert; alle offenen Sitzungen wurden beendet.`,
      })
    }

    // --- 2. Erzwungene Abmeldung ------------------------------------------
    const revoke = userSessionRevokeSchema.safeParse(body)
    if (revoke.success) {
      if (isSelf) {
        return jsonError(
          'Ihre eigene Sitzung beenden Sie über „Abmelden“ in der Seitenleiste.',
          409,
          { code: 'self_logout' },
        )
      }

      const open = await prisma.session.count({ where: { userId: id } })
      if (open === 0) {
        return jsonOk({ id, revoked: 0, message: `Für ${fullName} war keine Sitzung offen.` })
      }

      await destroyAllSessionsForUser(id)
      await writeAuditLog({
        userId: session.user.id,
        action: 'user.sessions_revoked',
        entity: 'User',
        entityId: id,
        detail: { email: existing.email, sessions: open },
        ip,
      })

      return jsonOk({
        id,
        revoked: open,
        message:
          open === 1
            ? `Die offene Sitzung von ${fullName} wurde beendet.`
            : `${open} offene Sitzungen von ${fullName} wurden beendet.`,
      })
    }

    // --- 3. Vollständiges Formular ----------------------------------------
    const data = userUpdateSchema.parse(body)

    const [conflict, role] = await Promise.all([
      prisma.user.findFirst({ where: { email: data.email, NOT: { id } }, select: { id: true } }),
      prisma.role.findUnique({ where: { id: data.roleId }, select: { id: true, key: true, name: true } }),
    ])

    if (conflict) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
        fieldErrors: { email: 'Diese E-Mail-Adresse wird bereits von einem anderen Konto genutzt.' },
      })
    }
    if (!role) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, {
        fieldErrors: { roleId: 'Diese Rolle gibt es nicht mehr. Bitte wählen Sie eine andere.' },
      })
    }

    const roleChanged = role.id !== existing.roleId
    const deactivating = existing.active && !data.active

    if (isSelf && roleChanged) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 403, {
        fieldErrors: {
          roleId:
            'Die eigene Rolle können Sie nicht ändern. Diese Sperre verhindert, dass sich jemand selbst zusätzliche Rechte gibt.',
        },
      })
    }
    if (isSelf && !data.active) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 403, {
        fieldErrors: {
          active:
            'Ihr eigenes Konto können Sie nicht deaktivieren. Bitten Sie eine zweite Person mit der Berechtigung „Mitarbeitende verwalten“ darum.',
        },
      })
    }

    // Verliert das Konto die Verwaltungsberechtigung — durch Deaktivierung
    // oder durch eine Rolle ohne dieses Recht — muss ein anderes Konto sie
    // noch besitzen.
    if (holdsLockoutPermission && (deactivating || roleChanged)) {
      const newRolePermissions = roleChanged
        ? await prisma.rolePermission.count({
            where: { roleId: role.id, permission: { key: LOCKOUT_PERMISSION } },
          })
        : 1
      const stillHolds = data.active && newRolePermissions > 0

      if (!stillHolds && (await countOtherActiveHolders(LOCKOUT_PERMISSION, id)) === 0) {
        return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
          fieldErrors: {
            [deactivating ? 'active' : 'roleId']: `${fullName} ist das letzte aktive Konto, das Mitarbeitende verwalten darf. Ohne dieses Recht könnte niemand mehr Konten anlegen oder Rollen zuweisen.`,
          },
        })
      }
    }

    const passwordChanged = data.password.length > 0

    await prisma.user.update({
      where: { id },
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        roleId: role.id,
        active: data.active,
        ...(passwordChanged ? { passwordHash: await hashPassword(data.password) } : {}),
      },
    })

    // Rollenwechsel und Deaktivierung wirken erst, wenn keine alte Sitzung
    // mehr laeuft. Beim eigenen Passwortwechsel bleibt die aktuelle Sitzung
    // bestehen — sonst wuerde sich der Bearbeiter selbst aussperren.
    const sessionsEnded = roleChanged || deactivating || (passwordChanged && !isSelf)
    if (sessionsEnded) await destroyAllSessionsForUser(id)

    const changes: string[] = []
    if (data.email !== existing.email) changes.push('email')
    if (data.firstName !== existing.firstName || data.lastName !== existing.lastName) changes.push('name')
    if (roleChanged) changes.push('role')
    if (data.active !== existing.active) changes.push('active')

    if (changes.length > 0) {
      await writeAuditLog({
        userId: session.user.id,
        action: 'user.updated',
        entity: 'User',
        entityId: id,
        detail: {
          email: data.email,
          changed: changes,
          role: role.key,
          previousRole: roleChanged ? existing.role.key : undefined,
          active: data.active,
        },
        ip,
      })
    }
    if (passwordChanged) {
      await writeAuditLog({
        userId: session.user.id,
        action: 'user.password_changed',
        entity: 'User',
        entityId: id,
        detail: { email: data.email, self: isSelf },
        ip,
      })
    }

    const notes: string[] = []
    if (passwordChanged) notes.push('Das neue Passwort gilt ab sofort.')
    if (sessionsEnded) notes.push(`Alle offenen Sitzungen von ${fullName} wurden beendet.`)
    else if (passwordChanged && isSelf) notes.push('Ihre eigene Sitzung bleibt bestehen.')

    return jsonOk({
      id,
      message:
        changes.length === 0 && !passwordChanged
          ? 'Es gab nichts zu speichern — die Angaben waren unverändert.'
          : ['Die Änderungen wurden gespeichert.', ...notes].join(' '),
    })
  } catch (error) {
    return handleRouteError(error, 'admin:mitarbeiter:patch')
  }
}

/**
 * Loeschen eines Mitarbeiterkontos.
 *
 * Das Konto verschwindet vollstaendig; die Protokolleintraege bleiben
 * erhalten, verlieren aber ihre Zuordnung zur Person (der Fremdschluessel ist
 * auf SetNull gesetzt). Wer die Nachvollziehbarkeit braucht, deaktiviert das
 * Konto stattdessen — darauf weist die Oberflaeche vor dem Loeschen hin.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('users:write')
    const { id } = await context.params

    const existing = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: {
          select: { key: true, permissions: { select: { permission: { select: { key: true } } } } },
        },
      },
    })
    if (!existing) return jsonError('Dieses Mitarbeiterkonto wurde nicht gefunden.', 404)

    if (existing.id === session.user.id) {
      return jsonError(
        'Ihr eigenes Konto können Sie nicht löschen. Bitten Sie eine zweite Person mit der Berechtigung „Mitarbeitende verwalten“ darum.',
        409,
        { code: 'self_deletion' },
      )
    }

    const holdsLockoutPermission = existing.role.permissions.some(
      (entry) => entry.permission.key === LOCKOUT_PERMISSION,
    )
    if (holdsLockoutPermission && (await countOtherActiveHolders(LOCKOUT_PERMISSION, id)) === 0) {
      return jsonError(
        `${existing.firstName} ${existing.lastName} ist das letzte aktive Konto, das Mitarbeitende verwalten darf, und kann deshalb nicht gelöscht werden.`,
        409,
        { code: 'last_administrator' },
      )
    }

    await prisma.user.delete({ where: { id } })

    await writeAuditLog({
      userId: session.user.id,
      action: 'user.deleted',
      entity: 'User',
      entityId: id,
      detail: {
        email: existing.email,
        name: `${existing.firstName} ${existing.lastName}`,
        role: existing.role.key,
      },
      ip: await getClientIp(),
    })

    return jsonOk({
      redirectTo: '/admin/mitarbeiter',
      message: `Das Konto von ${existing.firstName} ${existing.lastName} wurde gelöscht.`,
    })
  } catch (error) {
    return handleRouteError(error, 'admin:mitarbeiter:delete')
  }
}
