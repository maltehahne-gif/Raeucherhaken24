import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'
import { trimmedString } from '@/lib/validation/common'
import {
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  type SupportPriority,
  type SupportStatus,
} from '@/lib/domain/enums'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Bearbeitung einer Supportanfrage.
 *
 * Zwei Vorgaenge sind vorgesehen:
 *   status  — Bearbeitungsstatus und Prioritaet setzen
 *   message — interne Notiz oder Antwortentwurf festhalten
 *
 * Ein Antwortentwurf wird ausschliesslich gespeichert. Diese Anwendung
 * versendet keine E-Mails; dafuer waere ein konfigurierter Mailserver noetig.
 * Der Hinweis darauf steht sichtbar in der Oberflaeche, damit ein Entwurf
 * nicht faelschlich fuer eine gesendete Antwort gehalten wird.
 *
 * Protokolliert wird, WAS geschehen ist — der Text von Notizen und Entwuerfen
 * bleibt bewusst aussen vor: er kann personenbezogene Angaben enthalten und
 * stuende im Protokoll ohne Loeschmoeglichkeit.
 */

// Eigene Meldungen statt der englischen Standardtexte von Zod: auch eine
// manipulierte Anfrage bekommt eine verstaendliche deutsche Antwort.
const statusValueSchema = z.enum(SUPPORT_STATUSES, {
  errorMap: () => ({ message: 'Bitte wählen Sie einen gültigen Bearbeitungsstatus.' }),
})

const prioritySchema = z.enum(SUPPORT_PRIORITIES, {
  errorMap: () => ({ message: 'Bitte wählen Sie eine gültige Priorität.' }),
})

const statusSchema = z.object({
  status: statusValueSchema,
  priority: prioritySchema,
})

const messageSchema = z.object({
  kind: z.enum(['internal', 'reply'], {
    errorMap: () => ({ message: 'Bitte wählen Sie, ob es eine interne Notiz oder ein Antwortentwurf ist.' }),
  }),
  body: trimmedString(1, 5_000, 'Der Text'),
  /** Setzt eine neue Anfrage zugleich auf „In Bearbeitung“. */
  startProgress: z.boolean().optional().default(false),
})

const actionSchema = z.object({ action: z.enum(['status', 'message']) })

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const body = await readJson(request)
    const action = actionSchema.safeParse(body)
    if (!action.success) return jsonError('Die gewünschte Aktion ist nicht bekannt.', 400)

    const session = await requirePermission('support:write')
    const { id } = await context.params

    const existing = await prisma.supportRequest.findUnique({
      where: { id },
      select: { id: true, ticketNumber: true, status: true, priority: true },
    })
    if (!existing) return jsonError('Diese Anfrage wurde nicht gefunden.', 404)

    const ip = await getClientIp()

    if (action.data.action === 'status') {
      return await handleStatus(existing, body, session.user.id, ip)
    }
    return await handleMessage(existing, body, session.user.id, ip)
  } catch (error) {
    return handleRouteError(error, 'admin:support:patch')
  }
}

interface SupportRecord {
  id: string
  ticketNumber: string
  status: string
  priority: string
}

function state(record: { status: string; priority: string }, message: string) {
  return jsonOk({ message, status: record.status, priority: record.priority })
}

async function handleStatus(existing: SupportRecord, body: unknown, userId: string, ip: string) {
  const parsed = statusSchema.safeParse(body)
  if (!parsed.success) return fieldErrorResponse(parsed.error)

  const nextStatus = parsed.data.status
  const nextPriority = parsed.data.priority
  const statusChanged = nextStatus !== existing.status
  const priorityChanged = nextPriority !== existing.priority

  if (!statusChanged && !priorityChanged) {
    return state(existing, 'Es gab nichts zu speichern — Status und Priorität sind unverändert.')
  }

  await prisma.supportRequest.update({
    where: { id: existing.id },
    data: { status: nextStatus, priority: nextPriority },
  })

  await writeAuditLog({
    userId,
    action: 'support.status_changed',
    entity: 'SupportRequest',
    entityId: existing.id,
    detail: {
      ticketNumber: existing.ticketNumber,
      status: statusChanged ? { from: existing.status, to: nextStatus } : undefined,
      priority: priorityChanged ? { from: existing.priority, to: nextPriority } : undefined,
    },
    ip,
  })

  const parts: string[] = []
  if (statusChanged) parts.push(`Status: ${SUPPORT_STATUS_LABELS[nextStatus as SupportStatus]}`)
  if (priorityChanged) {
    parts.push(`Priorität: ${SUPPORT_PRIORITY_LABELS[nextPriority as SupportPriority]}`)
  }

  return state(
    { status: nextStatus, priority: nextPriority },
    `Anfrage aktualisiert — ${parts.join(', ')}.`,
  )
}

async function handleMessage(existing: SupportRecord, body: unknown, userId: string, ip: string) {
  const parsed = messageSchema.safeParse(body)
  if (!parsed.success) return fieldErrorResponse(parsed.error)

  const { kind, body: text } = parsed.data
  // Der Vermerk „In Bearbeitung“ ist nur beim Erstkontakt sinnvoll; ein
  // bereits weitergefuehrter Vorgang wird dadurch nicht zurueckgesetzt.
  const startProgress = parsed.data.startProgress && existing.status === 'new'
  const nextStatus = startProgress ? 'in_progress' : existing.status

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { requestId: existing.id, kind, body: text, userId },
    }),
    // Der Vorgang gilt damit als angefasst — das gehoert in „zuletzt geändert“.
    prisma.supportRequest.update({
      where: { id: existing.id },
      data: startProgress ? { status: 'in_progress' } : { updatedAt: new Date() },
    }),
  ])

  await writeAuditLog({
    userId,
    action: kind === 'reply' ? 'support.reply_drafted' : 'support.note_added',
    entity: 'SupportRequest',
    entityId: existing.id,
    detail: {
      ticketNumber: existing.ticketNumber,
      kind,
      length: text.length,
      statusChangedTo: startProgress ? 'in_progress' : undefined,
    },
    ip,
  })

  const saved =
    kind === 'reply'
      ? 'Antwortentwurf gespeichert. Der Versand erfolgt nicht automatisch.'
      : 'Interne Notiz gespeichert.'

  return state(
    { status: nextStatus, priority: existing.priority },
    startProgress ? `${saved} Status: In Bearbeitung.` : saved,
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
