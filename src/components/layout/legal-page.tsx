import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'

/**
 * Rahmen für die rechtlichen Seiten.
 *
 * Wichtig: Diese Anwendung liefert die technische Struktur, nicht den
 * rechtsverbindlichen Inhalt. Impressum, Datenschutzerklärung, AGB und
 * Widerrufsbelehrung müssen vom Betreiber erstellt und juristisch geprüft
 * werden. Der Hinweiskasten macht offene Stellen unübersehbar, damit sie
 * nicht versehentlich in den Produktivbetrieb gelangen.
 */
export function LegalPage({
  title,
  intro,
  children,
  lastUpdated,
}: {
  title: string
  intro?: string
  children: React.ReactNode
  lastUpdated?: string
}) {
  return (
    <div className="container-page max-w-[var(--container-prose)] py-8 sm:py-12">
      <Breadcrumbs items={[{ label: 'Start', href: '/' }, { label: title }]} className="mb-6" />
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h1>
      {intro && <p className="mt-3 text-base leading-relaxed text-ink-muted">{intro}</p>}
      <div className="mt-8 space-y-8">{children}</div>
      {lastUpdated && <p className="mt-10 text-xs text-ink-faint">Stand: {lastUpdated}</p>}
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}

/**
 * Deutlich sichtbarer Platzhalter für rechtsverbindliche Inhalte.
 * Bewusst auffällig gestaltet — er soll im Betrieb auffallen und ersetzt
 * werden, nicht übersehen.
 */
export function LegalPlaceholder({
  label,
  hint,
}: {
  label: string
  hint: string
}) {
  return (
    <div className="rounded-lg border-2 border-dashed border-warning-500 bg-warning-50 p-4">
      <p className="flex items-start gap-2 text-sm font-semibold text-warning-700">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Vom Betreiber zu ergänzen: {label}
      </p>
      <p className="mt-1.5 ml-6 text-sm leading-relaxed text-ink-soft">{hint}</p>
      <p className="mt-2 ml-6 text-xs text-ink-muted">
        Dieser Abschnitt enthält absichtlich keinen vorformulierten Text. Rechtstexte müssen auf
        den konkreten Betrieb zugeschnitten und juristisch geprüft werden.
      </p>
    </div>
  )
}

export function LegalNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-paper-sunken/70 p-4 text-sm leading-relaxed text-ink-soft">
      {children}
    </div>
  )
}

export function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="underline underline-offset-2 hover:text-[var(--accent)]">
      {children}
    </Link>
  )
}
