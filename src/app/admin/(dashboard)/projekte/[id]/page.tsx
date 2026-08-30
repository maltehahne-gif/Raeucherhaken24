import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Download, Mail, Paperclip } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatNumber } from '@/lib/money'
import { formatDateTime, formatLength, formatTenthMm, formatWeight } from '@/lib/utils/text'
import { MATERIAL_LABELS, type ProjectStatus } from '@/lib/domain/enums'
import { AdminPageHeader } from '@/components/admin/page-header'
import { ProjectActions } from '@/components/admin/project-actions'
import { ProjectStatusBadge } from '@/components/admin/status-badges'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const project = await prisma.customProject.findUnique({
    where: { id },
    select: { projectNumber: true },
  })
  return {
    title: project ? `Projekt ${project.projectNumber}` : 'Sonderanfertigung',
    robots: { index: false, follow: false },
  }
}

/** Kurzbezeichnung der zulaessigen Anhangstypen (siehe src/lib/server/uploads.ts). */
const FILE_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF-Dokument',
  'image/jpeg': 'JPEG-Bild',
  'image/png': 'PNG-Bild',
  'image/webp': 'WEBP-Bild',
  'image/gif': 'GIF-Bild',
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const session = await requirePermission('projects:read')
  const { id } = await params

  const project = await prisma.customProject.findUnique({
    where: { id },
    include: { attachments: { orderBy: { createdAt: 'asc' } } },
  })

  if (!project) notFound()

  const canWrite = session.user.permissions.includes('projects:write')
  const status = project.status as ProjectStatus

  const hasDimensions =
    project.totalLengthMm !== null ||
    project.wireDiameterTenthMm !== null ||
    project.prongCount !== null ||
    project.prongLengthMm !== null ||
    project.openingWidthMm !== null ||
    project.shape !== null ||
    project.additionalDimensions !== null

  const mailtoHref = `mailto:${encodeURIComponent(project.email)}?subject=${encodeURIComponent(
    `Ihre Anfrage ${project.projectNumber}: ${project.projectName}`,
  )}`

  return (
    <div>
      <AdminPageHeader
        backHref="/admin/projekte"
        backLabel="Zurück zur Projektübersicht"
        title={project.projectName}
        description={`Projekt ${project.projectNumber} · eingegangen am ${formatDateTime(project.createdAt)}`}
        actions={
          <div className="text-right">
            <p className="tabular font-display text-2xl font-semibold">
              {formatNumber(project.quantity)} Stück
            </p>
            <p className="text-xs text-ink-faint">
              {MATERIAL_LABELS[project.material] ?? project.material}
            </p>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <ProjectStatusBadge status={project.status} />
        {project.wantsConsultation && <Badge tone="accent">Beratung gewünscht</Badge>}
        {project.attachments.length > 0 && (
          <Badge tone="outline">
            {formatNumber(project.attachments.length)}{' '}
            {project.attachments.length === 1 ? 'Anhang' : 'Anhänge'}
          </Badge>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Anwendung */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Anwendung</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                <DataRow label="Lebensmittel" value={project.foodType} />
                <DataRow label="Einsatzzweck" value={project.purpose} />
                <DataRow
                  label="Gewünschte Belastung"
                  value={
                    project.targetLoadGrams === null ? null : formatWeight(project.targetLoadGrams)
                  }
                />
              </dl>
              <div>
                <h3 className="text-2xs font-semibold tracking-wider text-ink-muted uppercase">
                  Ziel der Anfrage
                </h3>
                <p className="mt-1.5 rounded-lg bg-paper-sunken px-4 py-3.5 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                  {project.goalDescription}
                </p>
              </div>
            </CardBody>
          </Card>

          {/* Abmessungen */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Abmessungen</CardTitle>
              <span className="text-xs text-ink-faint">Angaben des Anfragenden</span>
            </CardHeader>
            <CardBody className="space-y-4">
              {hasDimensions ? (
                <>
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                    <DataRow
                      label="Gesamtlänge"
                      value={
                        project.totalLengthMm === null ? null : formatLength(project.totalLengthMm)
                      }
                    />
                    <DataRow
                      label="Drahtdurchmesser"
                      value={
                        project.wireDiameterTenthMm === null
                          ? null
                          : formatTenthMm(project.wireDiameterTenthMm)
                      }
                    />
                    <DataRow
                      label="Anzahl Dornen"
                      value={project.prongCount === null ? null : formatNumber(project.prongCount)}
                    />
                    <DataRow
                      label="Dornenlänge"
                      value={
                        project.prongLengthMm === null ? null : formatLength(project.prongLengthMm)
                      }
                    />
                    <DataRow
                      label="Öffnungsmaß"
                      value={
                        project.openingWidthMm === null
                          ? null
                          : formatLength(project.openingWidthMm)
                      }
                    />
                    <DataRow label="Form" value={project.shape} />
                  </dl>
                  {project.additionalDimensions && (
                    <div>
                      <h3 className="text-2xs font-semibold tracking-wider text-ink-muted uppercase">
                        Weitere Maße
                      </h3>
                      <p className="mt-1.5 rounded-lg bg-paper-sunken px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                        {project.additionalDimensions}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-muted">
                  Es wurden keine Maße angegeben. Die Abmessungen sind vor einem Angebot mit dem
                  Anfragenden zu klären.
                </p>
              )}
              <p className="border-t border-[var(--border-subtle)] pt-3 text-xs text-ink-faint">
                {project.specConfirmed
                  ? 'Die technischen Angaben wurden vom Anfragenden als zutreffend bestätigt.'
                  : 'Die technischen Angaben wurden nicht bestätigt — bitte vor der Fertigung prüfen.'}
              </p>
            </CardBody>
          </Card>

          {/* Werkstoff und Ausführung */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Werkstoff und Ausführung</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                <DataRow
                  label="Werkstoff"
                  value={MATERIAL_LABELS[project.material] ?? project.material}
                />
                <DataRow label="Spitzenausführung" value={project.tipFinish} />
                <DataRow label="Oberfläche" value={project.surface} />
                <DataRow label="Stückzahl" value={`${formatNumber(project.quantity)} Stück`} />
                <DataRow
                  label="Beratung gewünscht"
                  value={project.wantsConsultation ? 'Ja' : 'Nein'}
                />
                <DataRow
                  label="Freigabe fürs Sortiment"
                  value={
                    project.allowCatalogRelease
                      ? 'Ja — Aufnahme ins Standardsortiment erlaubt'
                      : 'Nein'
                  }
                />
              </dl>
            </CardBody>
          </Card>

          {/* Anhänge */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Anhänge</CardTitle>
              <span className="text-xs text-ink-faint">
                Skizzen und Unterlagen des Anfragenden
              </span>
            </CardHeader>
            {project.attachments.length === 0 ? (
              <CardBody>
                <EmptyState
                  compact
                  icon={<Paperclip className="size-5" aria-hidden="true" />}
                  title="Keine Anhänge"
                  description="Zu dieser Anfrage wurden keine Zeichnungen oder Fotos hochgeladen."
                  headingLevel="h3"
                />
              </CardBody>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {project.attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                  >
                    <Paperclip className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {attachment.originalName}
                      </span>
                      <span className="tabular block text-xs text-ink-faint">
                        {FILE_TYPE_LABELS[attachment.mimeType] ?? 'Datei'} ·{' '}
                        {formatFileSize(attachment.sizeBytes)} · hochgeladen am{' '}
                        {formatDateTime(attachment.createdAt)}
                      </span>
                    </span>
                    <a
                      href={`/api/admin/projekte/${project.id}/anhang/${attachment.id}`}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[var(--border-default)] px-3.5 text-sm font-medium text-ink transition-colors hover:border-[var(--border-strong)] hover:bg-paper-sunken"
                    >
                      <Download className="size-4" aria-hidden="true" />
                      Herunterladen
                      <span className="sr-only">: {attachment.originalName}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Seitenspalte */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle as="h2">Kontakt</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              {project.company && <p className="font-medium text-ink">{project.company}</p>}
              <p className={project.company ? 'text-ink-soft' : 'font-medium text-ink'}>
                {project.contactName}
              </p>
              <p>
                <a href={mailtoHref} className="text-ink-soft break-all hover:text-[var(--accent)]">
                  {project.email}
                </a>
              </p>
              {project.phone && (
                <p>
                  <a
                    href={`tel:${project.phone.replace(/\s/g, '')}`}
                    className="text-ink-soft hover:text-[var(--accent)]"
                  >
                    {project.phone}
                  </a>
                </p>
              )}

              <div className="border-t border-[var(--border-subtle)] pt-3">
                <a
                  href={mailtoHref}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border-default)] px-3.5 text-sm font-medium text-ink transition-colors hover:border-[var(--border-strong)] hover:bg-paper-sunken"
                >
                  <Mail className="size-4" aria-hidden="true" />
                  Rückfrage per E-Mail
                </a>
                <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                  Öffnet Ihr E-Mail-Programm mit Empfänger und Betreff. Diese Anwendung versendet
                  selbst keine E-Mails.
                </p>
              </div>

              <dl className="tabular space-y-1 border-t border-[var(--border-subtle)] pt-2 text-xs text-ink-muted">
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Eingegangen</dt>
                  <dd>{formatDateTime(project.createdAt)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Zuletzt geändert</dt>
                  <dd>{formatDateTime(project.updatedAt)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <ProjectActions
            projectId={project.id}
            projectNumber={project.projectNumber}
            status={status}
            initialNote={project.internalNote ?? ''}
            canWrite={canWrite}
          />
        </div>
      </div>
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-2xs font-semibold tracking-wider text-ink-muted uppercase">{label}</dt>
      <dd className={value ? 'mt-1 text-sm text-ink-soft' : 'mt-1 text-sm text-ink-faint'}>
        {value ?? 'Nicht angegeben'}
      </dd>
    </div>
  )
}

/** Dateigroesse in der Einheit, die ein Mensch erwartet. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${formatNumber(bytes)} Bytes`
  const kilobytes = bytes / 1024
  if (kilobytes < 1024) {
    return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(kilobytes)} KB`
  }
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(kilobytes / 1024)} MB`
}
