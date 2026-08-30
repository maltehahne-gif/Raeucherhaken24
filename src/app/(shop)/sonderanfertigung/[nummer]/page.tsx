import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, FileText, MessageSquareQuote } from 'lucide-react'
import { prisma } from '@/lib/db'
import { buildMetadata } from '@/lib/seo/metadata'
import { formatDate } from '@/lib/utils/text'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { ProjectStatusLookup } from '@/components/project/project-status'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain/enums'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Ihre Sonderanfertigung',
  description: 'Bearbeitungsstand Ihrer Anfrage für eine Sonderanfertigung.',
  path: '/sonderanfertigung',
  noIndex: true,
})

type PageProps = { params: Promise<{ nummer: string }> }

/**
 * Bestaetigung und Bearbeitungsstand einer Sonderanfertigung.
 *
 * Diese Seite ist ueber die Projektnummer erreichbar — und Projektnummern
 * sind fortlaufend, also erratbar. Oeffentlich steht deshalb nur, dass es die
 * Anfrage gibt und wo sie steht. Konstruktionsangaben, Firmenname und
 * Zielbeschreibung erscheinen erst nach Eingabe der E-Mail-Adresse, mit der
 * die Anfrage gestellt wurde (siehe ProjectStatusLookup).
 *
 * Diese Trennung ist der Grund, warum die Seite den Entwurf nicht selbst
 * laedt: Was der Server hier rendert, koennte jeder abrufen.
 */

const STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
  new: 'accent',
  in_review: 'info',
  quoted: 'info',
  accepted: 'success',
  in_production: 'success',
  delivered: 'success',
  rejected: 'neutral',
}

/** Was als Naechstes geschieht — in der Sprache des Anfragenden, nicht des Betriebs. */
const STATUS_EXPLANATIONS: Record<ProjectStatus, string> = {
  new: 'Ihre Anfrage ist eingegangen und wartet auf die technische Durchsicht.',
  in_review: 'Die Angaben werden gerade auf Machbarkeit geprüft. Offene Punkte klären wir per E-Mail.',
  quoted: 'Zu Ihrer Anfrage liegt ein Angebot vor. Es wurde an die angegebene Adresse geschickt.',
  accepted: 'Der Auftrag ist angenommen. Die Fertigung wird eingeplant.',
  in_production: 'Die Teile sind in Fertigung.',
  delivered: 'Die Sonderanfertigung wurde ausgeliefert.',
  rejected:
    'Diese Anfrage wurde nicht weiterverfolgt. Den Grund haben wir Ihnen an die angegebene Adresse geschrieben.',
}

export default async function ProjectStatusPage({ params }: PageProps) {
  const { nummer } = await params
  const projectNumber = decodeURIComponent(nummer).toUpperCase()

  // Bewusst nur die Felder, die auch ohne Nachweis gezeigt werden dürfen.
  const project = await prisma.customProject.findUnique({
    where: { projectNumber },
    select: { projectNumber: true, status: true, createdAt: true },
  })
  if (!project) notFound()

  const status = (project.status as ProjectStatus) ?? 'new'

  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <div className="no-print text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-success-50 text-success-500">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 font-display text-3xl font-semibold sm:text-4xl">
          Anfrage {project.projectNumber}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          Eingegangen am {formatDate(project.createdAt)}. Notieren Sie sich die Projektnummer — sie
          ordnet jede Rückfrage eindeutig zu.
        </p>
        <p className="mt-5">
          <Badge tone={STATUS_TONES[status]} size="md">
            {PROJECT_STATUS_LABELS[status]}
          </Badge>
        </p>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-muted">
          {STATUS_EXPLANATIONS[status]}
        </p>
      </div>

      <section className="mt-12" aria-labelledby="entwurf">
        <h2 id="entwurf" className="font-display text-xl font-semibold">
          <FileText className="mr-2 inline size-5 align-[-3px] text-ink-faint" aria-hidden="true" />
          Technischer Entwurf
        </h2>
        <p className="mt-2 mb-6 text-sm leading-relaxed text-ink-muted">
          Aus Ihren Angaben entsteht automatisch ein Datenblatt zum Ausdrucken. Es fasst Anwendung,
          Maße und Ausführung zusammen und ist die Grundlage für die technische Abstimmung.
        </p>
        <ProjectStatusLookup projectNumber={project.projectNumber} />
      </section>

      <section className="no-print mt-14 rounded-2xl border border-[var(--border-subtle)] bg-paper-sunken/60 px-6 py-6">
        <h2 className="font-display text-base font-semibold">
          <MessageSquareQuote
            className="mr-2 inline size-4 align-[-2px] text-ink-faint"
            aria-hidden="true"
          />
          Etwas nachzureichen?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Eine Skizze, ein korrigiertes Maß oder eine geänderte Stückzahl: Schreiben Sie uns unter
          Angabe der Projektnummer {project.projectNumber}.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href="/kontakt" variant="secondary">
            Zum Kontaktformular
          </ButtonLink>
          <ButtonLink href="/sonderanfertigung" variant="ghost">
            Weitere Anfrage stellen
          </ButtonLink>
        </div>
      </section>

      <p className="no-print mt-8 text-center text-sm text-ink-muted">
        Zurück zur{' '}
        <Link href="/" className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
          Startseite
        </Link>
      </p>
    </div>
  )
}
