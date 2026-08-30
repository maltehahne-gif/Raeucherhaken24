import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/server/auth'
import { ensureCsrfToken } from '@/lib/server/csrf'
import { LoginForm } from '@/components/admin/login-form'
import { Logo } from '@/components/layout/logo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Anmeldung',
  robots: { index: false, follow: false },
}

/**
 * Anmeldeseite des Verwaltungsbereichs.
 * Bewusst ohne Storefront-Navigation, damit ein angemeldeter Zustand nicht
 * mit dem Shop verwechselt wird.
 */
export default async function AdminLoginPage() {
  const session = await getSession()
  if (session) redirect('/admin')

  await ensureCsrfToken()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper-sunken px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center" aria-label="Zur Startseite">
          <Logo className="h-8 w-auto" />
        </Link>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-card)] sm:p-8">
          <h1 className="font-display text-2xl font-semibold">Verwaltung</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Bitte melden Sie sich mit Ihrem Mitarbeiterzugang an.
          </p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
          Dieser Bereich ist Mitarbeitenden vorbehalten. Fehlgeschlagene Anmeldeversuche werden
          protokolliert und nach mehreren Versuchen zeitweise gesperrt.
        </p>
      </div>
    </main>
  )
}
