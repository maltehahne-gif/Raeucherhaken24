import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'
import { PERMISSION_KEYS, isPermissionKey } from '@/lib/server/permissions'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Rechtevergabe je Rolle.
 *
 * Die Rolle „Inhaber“ ist serverseitig gesperrt: Sie behaelt immer alle
 * Rechte. Ohne diese Sperre koennte eine unbedachte Aenderung den letzten Weg
 * zurueck in die Rollenverwaltung verschliessen. Zusaetzlich wird geprueft,
 * dass nach der Aenderung weiterhin mindestens ein aktives Konto die
 * Verwaltungsrechte besitzt.
 */

/** Rechte, ohne die niemand mehr Konten oder Rollen pflegen koennte. */
const LOCKOUT_PERMISSIONS = ['users:write', 'roles:write'] as const

const LOCKOUT_LABELS: Record<(typeof LOCKOUT_PERMISSIONS)[number], string> = {
  'users:write': 'Mitarbeitende verwalten',
  'roles:write': 'Rollen und Rechte verwalten',
}

const rolePermissionsSchema = z.object({
  permissions: z
    .array(z.string())
    .max(PERMISSION_KEYS.length, 'Es wurden mehr Rechte übermittelt, als es gibt.')
    .transform((values) => [...new Set(values.map((value) => value.trim()))])
    .superRefine((values, ctx) => {
      for (const value of values) {
        if (!isPermissionKey(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Die Berechtigung „${value}“ ist unbekannt. Bitte laden Sie die Seite neu.`,
          })
          return
        }
      }
    }),
})

/** Zaehlt aktive Konten, die eine Berechtigung ueber eine andere Rolle halten. */
async function countActiveHoldersOutsideRole(permission: string, roleId: string): Promise<number> {
  return prisma.user.count({
    where: {
      active: true,
      roleId: { not: roleId },
      role: { permissions: { some: { permission: { key: permission } } } },
    },
  })
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('roles:write')
    const { id } = await context.params

    const role = await prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        key: true,
        name: true,
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    })
    if (!role) return jsonError('Diese Rolle wurde nicht gefunden.', 404)

    if (role.key === 'owner') {
      return jsonError(
        'Die Rolle „Inhaber“ behält immer alle Rechte. Diese Sperre stellt sicher, dass mindestens eine Rolle jederzeit vollen Zugriff hat.',
        409,
        { code: 'owner_locked' },
      )
    }

    const data = rolePermissionsSchema.parse(await readJson(request))
    const next = new Set(data.permissions)
    const current = new Set(role.permissions.map((entry) => entry.permission.key))

    const added = [...next].filter((key) => !current.has(key))
    const removed = [...current].filter((key) => !next.has(key))

    if (added.length === 0 && removed.length === 0) {
      return jsonOk({
        id,
        permissions: [...current],
        message: `An den Rechten der Rolle „${role.name}“ hat sich nichts geändert.`,
      })
    }

    // Aussperrschutz: ein entzogenes Verwaltungsrecht muss anderswo bestehen bleiben.
    for (const permission of LOCKOUT_PERMISSIONS) {
      if (!removed.includes(permission)) continue
      const holdersBefore = await prisma.user.count({
        where: { active: true, role: { permissions: { some: { permission: { key: permission } } } } },
      })
      if (holdersBefore === 0) continue
      const holdersAfter = await countActiveHoldersOutsideRole(permission, role.id)
      if (holdersAfter === 0) {
        return jsonError(
          `„${role.name}“ ist die einzige Rolle, über die ein aktives Konto das Recht „${LOCKOUT_LABELS[permission]}“ besitzt. Ohne dieses Recht käme niemand mehr in diese Verwaltung.`,
          409,
          { code: 'last_administrator' },
        )
      }
    }

    const permissionRows = await prisma.permission.findMany({
      where: { key: { in: [...next] } },
      select: { id: true, key: true },
    })
    if (permissionRows.length !== next.size) {
      return jsonError(
        'Mindestens eine der gewählten Berechtigungen ist im System nicht hinterlegt. Bitte laden Sie die Seite neu.',
        422,
        { code: 'unknown_permission' },
      )
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      ...(permissionRows.length > 0
        ? [
            prisma.rolePermission.createMany({
              data: permissionRows.map((permission) => ({
                roleId: role.id,
                permissionId: permission.id,
              })),
            }),
          ]
        : []),
    ])

    await writeAuditLog({
      userId: session.user.id,
      action: 'role.permissions_changed',
      entity: 'Role',
      entityId: role.id,
      detail: { role: role.key, added, removed },
      ip: await getClientIp(),
    })

    const parts: string[] = []
    if (added.length > 0) parts.push(`${added.length} ${added.length === 1 ? 'Recht' : 'Rechte'} erteilt`)
    if (removed.length > 0) parts.push(`${removed.length} ${removed.length === 1 ? 'Recht' : 'Rechte'} entzogen`)

    return jsonOk({
      id,
      permissions: [...next],
      message:
        `„${role.name}“: ${parts.join(', ')}. ` +
        (role._count.users > 0
          ? `Die Änderung gilt sofort für ${role._count.users} ${role._count.users === 1 ? 'Konto' : 'Konten'}.`
          : 'Der Rolle ist derzeit kein Konto zugeordnet.'),
    })
  } catch (error) {
    return handleRouteError(error, 'admin:rollen:patch')
  }
}

/**
 * Loeschen einer Rolle.
 *
 * Systemrollen bleiben bestehen: Sie sind die Grundlage der Ersteinrichtung
 * und werden vom Seed erwartet. Eine Rolle mit zugeordneten Konten wird
 * ebenfalls nicht geloescht — die Konten haetten sonst keine Rechtebasis
 * mehr (der Fremdschluessel steht auf Restrict).
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('roles:write')
    const { id } = await context.params

    const role = await prisma.role.findUnique({
      where: { id },
      select: { id: true, key: true, name: true, system: true, _count: { select: { users: true } } },
    })
    if (!role) return jsonError('Diese Rolle wurde nicht gefunden.', 404)

    if (role.system) {
      return jsonError(
        `„${role.name}“ ist eine Systemrolle und kann nicht gelöscht werden. Entziehen Sie ihr stattdessen die Rechte, die sie nicht haben soll.`,
        409,
        { code: 'system_role' },
      )
    }
    if (role._count.users > 0) {
      return jsonError(
        `„${role.name}“ ist ${role._count.users} ${role._count.users === 1 ? 'Konto' : 'Konten'} zugewiesen. Weisen Sie diesen Konten zuerst eine andere Rolle zu.`,
        409,
        { code: 'role_in_use' },
      )
    }

    await prisma.role.delete({ where: { id } })

    await writeAuditLog({
      userId: session.user.id,
      action: 'role.deleted',
      entity: 'Role',
      entityId: id,
      detail: { role: role.key, name: role.name },
      ip: await getClientIp(),
    })

    return jsonOk({
      redirectTo: '/admin/mitarbeiter/rollen',
      message: `Die Rolle „${role.name}“ wurde gelöscht.`,
    })
  } catch (error) {
    return handleRouteError(error, 'admin:rollen:delete')
  }
}
