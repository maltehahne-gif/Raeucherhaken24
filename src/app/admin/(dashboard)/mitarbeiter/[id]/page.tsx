import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ScrollText } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { permissionsByGroup } from '@/lib/server/permissions'
import { formatDateTime, formatRelative } from '@/lib/utils/text'
import { AdminPageHeader } from '@/components/admin/page-header'
import { UserForm, type UserFormValues } from '@/components/admin/user-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  })
  return {
    title: user ? `${user.firstName} ${user.lastName}` : 'Konto nicht gefunden',
    robots: { index: false, follow: false },
  }
}

/**
 * Ein Mitarbeiterkonto bearbeiten.
 *
 * Ueber dem Formular steht, was das Konto derzeit darf und wie oft es benutzt
 * wird — beides ist noetig, um ueber Rolle und Zugang zu entscheiden. Ohne die
 * Berechtigung `users:write` bleibt die Seite eine reine Auskunft.
 */
export default async function UserDetailPage({ params }: PageProps) {
  const session = await requirePermission('users:read')
  const canWrite = session.user.permissions.includes('users:write')
  const canReadAudit = session.user.permissions.includes('audit:read')
  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      active: true,
      roleId: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  })
  if (!user) notFound()

  const [roles, openSessions, auditCount] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, description: true } }),
    prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
    prisma.auditLog.count({ where: { userId: user.id } }),
  ])

  const isSelf = user.id === session.user.id
  const fullName = `${user.firstName} ${user.lastName}`
  const granted = new Set(user.role.permissions.map((entry) => entry.permission.key))
  const grantedGroups = permissionsByGroup()
    .map((group) => ({
      group: group.group,
      items: group.items.filter((item) => granted.has(item.key)),
    }))
    .filter((group) => group.items.length > 0)

  const initialValues: UserFormValues = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    roleId: user.roleId,
    active: user.active,
    password: '',
    passwordConfirm: '',
  }

  return (
    <div>
      <AdminPageHeader
        title={fullName}
        description={user.email}
        backHref="/admin/mitarbeiter"
        backLabel="Zurück zur Mitarbeiterliste"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {user.active ? <Badge tone="success">Aktiv</Badge> : <Badge tone="steel">Deaktiviert</Badge>}
            {isSelf && <Badge tone="outline">Ihr Konto</Badge>}
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FactTile label="Rolle" value={user.role.name} note={user.role.description ?? undefined} />
        <FactTile
          label="Letzte Anmeldung"
          value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'noch nie'}
          note={user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Das Konto wurde bisher nicht genutzt.'}
        />
        <FactTile
          label="Offene Sitzungen"
          value={openSessions === 1 ? '1 Sitzung' : `${openSessions} Sitzungen`}
          note={
            openSessions === 0
              ? 'Derzeit ist niemand mit diesem Konto angemeldet.'
              : 'Eine Sitzung läuft nach acht Stunden ohne Nutzung ab.'
          }
        />
        <FactTile
          label="Angelegt"
          value={formatDateTime(user.createdAt)}
          note={`zuletzt geändert ${formatRelative(user.updatedAt)}`}
        />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle as="h2">Was dieses Konto darf</CardTitle>
            <CardDescription>
              Ergibt sich vollständig aus der Rolle „{user.role.name}“. Einzelrechte je Person gibt es
              bewusst nicht — Rechte werden über Rollen gepflegt.
            </CardDescription>
          </div>
          {canReadAudit && auditCount > 0 && (
            <Link
              href={`/admin/protokoll?bearbeiter=${user.id}`}
              className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-[var(--accent)]"
            >
              <ScrollText className="size-4" aria-hidden="true" />
              {auditCount} {auditCount === 1 ? 'Protokolleintrag' : 'Protokolleinträge'}
            </Link>
          )}
        </CardHeader>
        <CardBody>
          {grantedGroups.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Dieser Rolle ist derzeit kein Recht zugeordnet. Das Konto kann sich anmelden, sieht aber
              keinen Bereich der Verwaltung.
            </p>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {grantedGroups.map((group) => (
                <div key={group.group}>
                  <dt className="text-2xs font-semibold tracking-wider text-ink-muted uppercase">
                    {group.group}
                  </dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <Badge key={item.key} tone="outline">
                        {item.name}
                      </Badge>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CardBody>
      </Card>

      {canWrite ? (
        <UserForm
          mode="edit"
          userId={user.id}
          initialValues={initialValues}
          roles={roles}
          isSelf={isSelf}
          openSessions={openSessions}
        />
      ) : (
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle as="h2">Bearbeiten nicht möglich</CardTitle>
              <CardDescription>
                Zum Ändern von Konten wird die Berechtigung „Mitarbeitende verwalten“ benötigt. Wenden
                Sie sich an eine Person mit dieser Berechtigung.
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyFact label="Vorname" value={user.firstName} />
              <ReadOnlyFact label="Nachname" value={user.lastName} />
              <ReadOnlyFact label="E-Mail-Adresse" value={user.email} />
              <ReadOnlyFact label="Rolle" value={user.role.name} />
              <ReadOnlyFact label="Status" value={user.active ? 'Aktiv' : 'Deaktiviert'} />
            </dl>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function FactTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-lg leading-snug font-semibold text-ink">{value}</p>
      {note && <p className="mt-1 text-xs leading-relaxed text-ink-faint">{note}</p>}
    </div>
  )
}

function ReadOnlyFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  )
}
