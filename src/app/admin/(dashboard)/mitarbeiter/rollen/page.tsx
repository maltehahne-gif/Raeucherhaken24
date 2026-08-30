import type { Metadata } from 'next'
import Link from 'next/link'
import { Lock, Users } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { PERMISSION_KEYS, permissionsByGroup } from '@/lib/server/permissions'
import { AdminPageHeader } from '@/components/admin/page-header'
import { RolePermissionMatrix, type RoleMatrixRole } from '@/components/admin/user-form'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = { title: 'Rollen und Rechte', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Rollen und Rechte.
 *
 * Rechte haengen ausschliesslich an Rollen, nie an einzelnen Personen — so
 * bleibt nachvollziehbar, warum jemand etwas darf, und ein Rollenwechsel
 * genuegt, um Zustaendigkeiten zu uebergeben.
 *
 * Die Rolle „Inhaber“ ist gesperrt: Sie behaelt immer alle Rechte, damit der
 * Zugang zu dieser Seite nicht versehentlich verlorengeht. Die Sperre gilt
 * ebenso in der API — die Oberflaeche macht sie nur sichtbar.
 */
export default async function RolesPage() {
  await requirePermission('roles:write')

  const roleRows = await prisma.role.findMany({
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      system: true,
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  })

  const groups = permissionsByGroup().map((group) => ({
    group: group.group,
    items: group.items.map((item) => ({ key: item.key as string, name: item.name })),
  }))

  // Vom groessten zum kleinsten Rechteumfang: der Inhaber steht damit links,
  // die eingeschraenkten Rollen rechts — so liest sich die Matrix wie eine
  // Abstufung.
  const roles: RoleMatrixRole[] = roleRows
    .map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      system: role.system,
      userCount: role._count.users,
      permissions: role.permissions.map((entry) => entry.permission.key),
      locked: role.key === 'owner',
    }))
    .sort((a, b) => b.permissions.length - a.permissions.length || a.name.localeCompare(b.name, 'de-DE'))

  const totalPermissions = PERMISSION_KEYS.length

  return (
    <div>
      <AdminPageHeader
        title="Rollen und Rechte"
        description="Jede Rolle bündelt die Rechte, die eine Aufgabe braucht. Änderungen wirken sofort auf alle Konten dieser Rolle — auch auf gerade angemeldete."
        count={roles.length}
        countLabel={roles.length === 1 ? 'Rolle' : 'Rollen'}
        backHref="/admin/mitarbeiter"
        backLabel="Zurück zur Mitarbeiterliste"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => (
          <div
            key={role.id}
            className="flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-semibold text-ink">{role.name}</h2>
              {role.system && <Badge tone="neutral">Systemrolle</Badge>}
              {role.locked && (
                <Badge tone="accent">
                  <Lock className="size-3" aria-hidden="true" />
                  Gesperrt
                </Badge>
              )}
            </div>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-ink-muted">
              {role.description ?? 'Ohne Beschreibung.'}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
              <Link
                href={`/admin/mitarbeiter?rolle=${role.id}`}
                className="inline-flex items-center gap-1.5 font-medium text-ink-muted hover:text-[var(--accent)]"
              >
                <Users className="size-3.5" aria-hidden="true" />
                {role.userCount === 1 ? '1 Konto' : `${role.userCount} Konten`}
              </Link>
              <span className="tabular">
                {role.permissions.length} von {totalPermissions} Rechten
              </span>
            </p>
          </div>
        ))}
      </div>

      <div className="mb-4 rounded-xl border border-[var(--border-subtle)] bg-paper-sunken/60 px-5 py-4 text-sm leading-relaxed text-ink-soft">
        <p>
          Ein Häkchen bedeutet: Konten dieser Rolle dürfen die Aktion ausführen. Geprüft wird jedes
          Recht serverseitig bei jeder Aktion — eine ausgeblendete Schaltfläche ist kein Schutz.
        </p>
        <p className="mt-1.5 text-ink-muted">
          Die Rolle „Inhaber“ behält immer alle Rechte und lässt sich hier nicht ändern. Systemrollen
          können nicht gelöscht werden; eine Rolle ohne zugeordnete Konten lässt sich über das
          Papierkorbsymbol in der Spaltenüberschrift entfernen.
        </p>
      </div>

      <RolePermissionMatrix roles={roles} groups={groups} />
    </div>
  )
}
