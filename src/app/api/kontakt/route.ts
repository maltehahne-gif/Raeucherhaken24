import { prisma } from '@/lib/db'
import { hashIp } from '@/lib/server/crypto'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { nextNumber } from '@/lib/server/numbering'
import { checkRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit'
import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  jsonRateLimited,
  readJson,
} from '@/lib/server/http'
import { contactSchema } from '@/lib/validation/contact'

export const dynamic = 'force-dynamic'

/**
 * Kontaktanfrage entgegennehmen.
 *
 * Eine Anfrage ohne Anmeldung, die einen Datensatz anlegt — also der Punkt,
 * an dem ein Shop typischerweise zugemuellt wird. Drei Hürden greifen
 * nacheinander:
 *
 *  1. CSRF-Nachweis: Die Anfrage muss aus dem eigenen Formular stammen.
 *  2. Ratenbegrenzung je Absender: fünf Anfragen in zehn Minuten.
 *  3. Honeypot: ein für Menschen unsichtbares Feld, das einfache Bots
 *     ausfüllen. Ist es befüllt, wird die Anfrage abgewiesen — mit derselben
 *     Meldung wie ein Eingabefehler, damit ein Bot nicht lernt, woran es lag.
 *
 * Ticketnummer und Vorgang entstehen in einer Transaktion: Bricht das
 * Schreiben ab, ist auch keine Nummer verbraucht.
 *
 * Es wird bewusst keine E-Mail verschickt — dafür ist kein Versanddienst
 * angebunden (siehe README, „Offene externe Anbindungen“). Die Anfrage
 * erscheint im Verwaltungsbereich unter /admin/support; die Ticketnummer
 * bekommt der Absender sofort auf der Seite zu sehen.
 */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const ip = await getClientIp()
    const limit = checkRateLimit(
      `kontakt:${hashIp(ip)}`,
      RATE_LIMITS.contact.limit,
      RATE_LIMITS.contact.windowMs,
    )
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds)

    const parsed = contactSchema.safeParse(await readJson(request))
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.')
        // Der Honeypot hat kein sichtbares Feld — seine Meldung würde ins
        // Leere zeigen und dem Absender nur Rätsel aufgeben.
        if (path === 'website') continue
        if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
      }
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, { fieldErrors })
    }

    const input = parsed.data

    /*
     * Eine Bestellnummer wird nur übernommen, wenn es die Bestellung gibt.
     * Sonst stünde im Verwaltungsbereich eine Nummer, hinter der nichts liegt
     * — und die Bearbeitung würde einer Spur nachgehen, die es nicht gibt.
     */
    const orderNumber = input.orderNumber?.trim().toUpperCase() ?? ''
    const knownOrder =
      orderNumber.length > 0
        ? await prisma.order.findUnique({ where: { orderNumber }, select: { orderNumber: true } })
        : null

    const created = await prisma.$transaction(async (tx) => {
      const ticketNumber = await nextNumber(tx, 'ticket', new Date().getFullYear())
      return tx.supportRequest.create({
        data: {
          ticketNumber,
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          company: input.company ?? null,
          topic: input.topic,
          orderNumber: knownOrder?.orderNumber ?? null,
          subject: input.subject,
          message: input.message,
          // Eine Reklamation wartet nicht in der Reihe: Sie geht mit erhöhter
          // Priorität in die Bearbeitung.
          priority: input.topic === 'complaint' ? 'high' : 'normal',
        },
        select: { id: true, ticketNumber: true },
      })
    })

    // Der Nachrichtentext bleibt aus dem Protokoll heraus: Er kann
    // personenbezogene Angaben enthalten und stünde dort ohne Löschmöglichkeit.
    await writeAuditLog({
      action: 'support.created',
      entity: 'SupportRequest',
      entityId: created.id,
      detail: {
        ticketNumber: created.ticketNumber,
        topic: input.topic,
        orderNumberKnown: orderNumber.length > 0 ? knownOrder !== null : undefined,
      },
      ip,
    })

    return jsonOk({
      ticketNumber: created.ticketNumber,
      message:
        orderNumber.length > 0 && knownOrder === null
          ? `Ihre Anfrage ist unter ${created.ticketNumber} eingegangen. Die angegebene Bestellnummer konnten wir nicht zuordnen — bitte prüfen Sie sie in Ihrer Bestellbestätigung.`
          : `Ihre Anfrage ist unter ${created.ticketNumber} eingegangen.`,
    })
  } catch (error) {
    return handleRouteError(error, 'kontakt:post')
  }
}
