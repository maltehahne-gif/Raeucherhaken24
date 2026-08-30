import { readFile } from 'node:fs/promises'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { writeAuditLog } from '@/lib/server/audit'
import { resolveStoredPath } from '@/lib/server/uploads'
import { getClientIp, handleRouteError, jsonError } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> }

/**
 * Ausgabe eines Projektanhangs.
 *
 * Anhaenge liegen bewusst ausserhalb von /public: nur wer angemeldet ist und
 * `projects:read` besitzt, kommt an eine Kundenzeichnung. Drei Vorkehrungen
 * gehoeren zwingend zusammen:
 *
 *  1. Der Pfad wird ueber resolveStoredPath aufgeloest — ein manipulierter
 *     Dateiname kann damit nicht aus dem Uploadverzeichnis ausbrechen.
 *  2. Ausgeliefert wird immer als application/octet-stream mit nosniff. Der
 *     beim Upload gemeldete MIME-Typ wird NICHT zurueckgespielt; sonst liesse
 *     sich eine praeparierte Datei im Browser zur Ausfuehrung bringen.
 *  3. Content-Disposition: attachment — die Datei wird geladen, nie angezeigt.
 *
 * Der Anhang wird zusaetzlich gegen die Projekt-ID aus der URL geprueft, damit
 * eine fremde Anhang-ID nicht ueber ein beliebiges Projekt erreichbar ist.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission('projects:read')
    const { id, attachmentId } = await context.params

    const attachment = await prisma.projectAttachment.findFirst({
      where: { id: attachmentId, projectId: id },
      select: {
        id: true,
        storedName: true,
        originalName: true,
        sizeBytes: true,
        project: { select: { projectNumber: true } },
      },
    })
    if (!attachment) return jsonError('Diese Datei wurde nicht gefunden.', 404)

    const path = resolveStoredPath(attachment.storedName)

    let data: Buffer
    try {
      data = await readFile(path)
    } catch {
      // Der Datenbankeintrag existiert, die Datei nicht mehr — das ist ein
      // Betriebsfehler und keine ungueltige Anfrage.
      console.error('[admin:projekte:anhang] Datei fehlt auf der Platte', attachment.storedName)
      return jsonError(
        'Diese Datei ist auf dem Server nicht mehr vorhanden. Bitte wenden Sie sich an die Administration.',
        410,
      )
    }

    await writeAuditLog({
      userId: session.user.id,
      action: 'project.attachment_downloaded',
      entity: 'ProjectAttachment',
      entityId: attachment.id,
      detail: {
        projectNumber: attachment.project.projectNumber,
        originalName: attachment.originalName,
        sizeBytes: attachment.sizeBytes,
      },
      ip: await getClientIp(),
    })

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(data.byteLength),
        'Content-Disposition': contentDisposition(attachment.originalName),
        'X-Content-Type-Options': 'nosniff',
        // Kundenunterlagen gehoeren in keinen gemeinsamen Zwischenspeicher.
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return handleRouteError(error, 'admin:projekte:anhang')
  }
}

/**
 * Content-Disposition mit dem Originalnamen.
 *
 * Der ASCII-Teil ist die Rueckfallebene fuer alte Browser, `filename*` traegt
 * den vollstaendigen Namen nach RFC 5987. Anfuehrungszeichen und Steuerzeichen
 * werden ersetzt, damit der Header nicht aufgebrochen werden kann.
 */
function contentDisposition(originalName: string): string {
  const cleaned = originalName.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 150)
  const fallback = cleaned.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  const safeFallback = fallback.trim().length > 0 ? fallback : 'anhang'
  return `attachment; filename="${safeFallback}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`
}
