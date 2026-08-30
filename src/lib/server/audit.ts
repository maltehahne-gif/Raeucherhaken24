import { prisma } from '@/lib/db'
import { hashIp } from '@/lib/server/crypto'

/**
 * Revisionssicheres Protokoll aller sicherheitsrelevanten Admin-Aktionen.
 * Fehler beim Protokollieren duerfen die Fachaktion nie zum Scheitern bringen.
 */
export async function writeAuditLog(entry: {
  userId?: string | null
  action: string
  entity: string
  entityId?: string | null
  detail?: unknown
  ip?: string | null
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        detail: entry.detail === undefined ? null : JSON.stringify(entry.detail).slice(0, 4000),
        ipHash: entry.ip ? hashIp(entry.ip) : null,
      },
    })
  } catch (error) {
    console.error('[audit]', error)
  }
}
