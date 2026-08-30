import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain/enums'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Bearbeitung einer Sonderanfertigung.
 *
 * Zwei Vorgaenge sind vorgesehen:
 *   status — Bearbeitungsstand setzen
 *   note   — interne Notiz speichern
 *
 * Die Angaben des Anfragenden (Masse, Werkstoff, Anhaenge) bleiben unberuehrt:
 * sie sind das Dokument der Anfrage und werden im Verwaltungsbereich nicht
 * ueberschrieben. Der Notiztext selbst gehoert nicht ins Protokoll — er kann
 * personenbezogene Angaben enthalten und stuende dort ohne Loeschmoeglichkeit.
 */

// Eigene Meldung statt des englischen Standardtextes von Zod: auch eine
// manipulierte Anfrage bekommt eine verstaendliche deutsche Antwort.
const statusSchema = z.object({
  status: z.enum(PROJECT_STATUSES, {
    errorMap: () => ({ message: 'Bitte wählen Sie einen gültigen Bearbeitungsstand.' }),
  }),
})

const noteSchema = z.object({
  internalNote: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined ? '' : v.trim()))
    .pipe(z.string().max(5_000, 'Die Notiz darf höchstens 5.000 Zeichen haben.')),
})

const actionSchema = z.object({ action: z.enum(['status', 'note']) })

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const body = await readJson(request)
    const action = actionSchema.safeParse(body)
    if (!action.success) return jsonError('Die gewünschte Aktion ist nicht bekannt.', 400)

    const session = await requirePermission('projects:write')
    const { id } = await context.params

    const existing = await prisma.customProject.findUnique({
      where: { id },
      select: { id: true, projectNumber: true, status: true, internalNote: true },
    })
    if (!existing) return jsonError('Diese Sonderanfertigung wurde nicht gefunden.', 404)

    const ip = await getClientIp()

    if (action.data.action === 'status') {
      return await handleStatus(existing, body, session.user.id, ip)
    }
    return await handleNote(existing, body, session.user.id, ip)
  } catch (error) {
    return handleRouteError(error, 'admin:projekte:patch')
  }
}

interface ProjectRecord {
  id: string
  projectNumber: string
  status: string
  internalNote: string | null
}

function state(record: { status: string; internalNote: string | null }, message: string) {
  return jsonOk({ message, status: record.status, internalNote: record.internalNote ?? '' })
}

async function handleStatus(existing: ProjectRecord, body: unknown, userId: string, ip: string) {
  const parsed = statusSchema.safeParse(body)
  if (!parsed.success) return fieldErrorResponse(parsed.error)

  const target = parsed.data.status
  if (target === existing.status) {
    return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
      fieldErrors: {
        status: `Das Projekt steht bereits auf „${PROJECT_STATUS_LABELS[target]}“.`,
      },
    })
  }

  await prisma.customProject.update({ where: { id: existing.id }, data: { status: target } })

  await writeAuditLog({
    userId,
    action: 'project.status_changed',
    entity: 'CustomProject',
    entityId: existing.id,
    detail: {
      projectNumber: existing.projectNumber,
      from: existing.status,
      to: target,
    },
    ip,
  })

  return state(
    { status: target, internalNote: existing.internalNote },
    `Status auf „${PROJECT_STATUS_LABELS[target as ProjectStatus]}“ gesetzt.`,
  )
}

async function handleNote(existing: ProjectRecord, body: unknown, userId: string, ip: string) {
  const parsed = noteSchema.safeParse(body)
  if (!parsed.success) return fieldErrorResponse(parsed.error)

  const note = parsed.data.internalNote.length > 0 ? parsed.data.internalNote : null
  if (note === existing.internalNote) {
    return state(existing, 'Es gab nichts zu speichern — die Notiz ist unverändert.')
  }

  await prisma.customProject.update({ where: { id: existing.id }, data: { internalNote: note } })

  await writeAuditLog({
    userId,
    action: 'project.note_updated',
    entity: 'CustomProject',
    entityId: existing.id,
    detail: {
      projectNumber: existing.projectNumber,
      noteLength: parsed.data.internalNote.length,
      cleared: note === null,
    },
    ip,
  })

  return state(
    { status: existing.status, internalNote: note },
    note === null ? 'Die interne Notiz wurde gelöscht.' : 'Die interne Notiz wurde gespeichert.',
  )
}

/** Wandelt Zod-Fehler in feldbezogene Meldungen fuer das Formular. */
function fieldErrorResponse(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (path.length > 0 && !fieldErrors[path]) fieldErrors[path] = issue.message
  }
  return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, { fieldErrors })
}
