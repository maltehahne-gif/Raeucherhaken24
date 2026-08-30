import { redirect } from 'next/navigation'
import { getSession } from '@/lib/server/auth'
import { ensureCsrfToken } from '@/lib/server/csrf'
import { AdminShell } from '@/components/admin/shell'
import { ToastProvider } from '@/components/ui/toast'

export const dynamic = 'force-dynamic'

/**
 * Layout des geschützten Verwaltungsbereichs.
 *
 * Die Anmeldeseite liegt bewusst außerhalb dieser Gruppe, damit die Prüfung
 * hier ohne Ausnahmen greifen kann. Zusätzlich prüft jede schreibende Aktion
 * serverseitig ihre eigene Berechtigung — eine Route ist nie allein durch eine
 * ausgeblendete Navigation geschützt.
 */
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/admin/anmelden')

  await ensureCsrfToken()

  return (
    <ToastProvider>
      <AdminShell user={session.user}>{children}</AdminShell>
    </ToastProvider>
  )
}
