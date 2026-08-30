import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { AdminPageHeader } from '@/components/admin/page-header'
import { EMPTY_USER_FORM_VALUES, UserForm } from '@/components/admin/user-form'

export const metadata: Metadata = { title: 'Konto anlegen', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Anlage eines Mitarbeiterkontos.
 *
 * Das Passwort wird hier gesetzt und danach nie wieder angezeigt — es ist nur
 * als scrypt-Hash gespeichert. Ist es verloren, wird auf dieser Oberflaeche
 * ein neues vergeben.
 */
export default async function NewUserPage() {
  await requirePermission('users:write')

  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, description: true },
  })

  return (
    <div>
      <AdminPageHeader
        title="Konto anlegen"
        description="Pflichtangaben sind mit einem Stern gekennzeichnet. Die E-Mail-Adresse ist zugleich die Anmeldekennung und muss eindeutig sein."
        backHref="/admin/mitarbeiter"
        backLabel="Zurück zur Mitarbeiterliste"
      />

      <UserForm mode="create" initialValues={EMPTY_USER_FORM_VALUES} roles={roles} />
    </div>
  )
}
