import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hashIp } from '@/lib/server/crypto'
import { verifyCsrf } from '@/lib/server/csrf'
import { checkRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit'
import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonOk,
  jsonRateLimited,
  readJson,
} from '@/lib/server/http'
import { emailSchema } from '@/lib/validation/common'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ nummer: string }> }

/**
 * Technische Angaben einer Sonderanfertigung ausgeben.
 *
 * Warum diese Route ueberhaupt existiert: Projektnummern sind fortlaufend
 * (P-2026-101, -102, …) und damit erratbar. Der Entwurf enthaelt aber
 * Konstruktionsangaben und den Firmennamen des Anfragenden — Angaben, die
 * niemand sehen soll, der nur eine Zahl hochzaehlt. Die oeffentliche Seite
 * zeigt deshalb nur Nummer und Bearbeitungsstand; alles Weitere gibt es erst
 * gegen die E-Mail-Adresse, mit der die Anfrage gestellt wurde.
 *
 * Die Adresse wird per POST uebergeben, nicht als Abfrageparameter: Sonst
 * stuende sie im Verlauf des Browsers, im Referrer und in jedem Zugriffslog.
 *
 * Die Antwort unterscheidet nicht zwischen "Projekt gibt es nicht" und
 * "Adresse passt nicht". Andernfalls liesse sich ueber diese Route pruefen,
 * welche Projektnummern vergeben sind.
 */

const lookupSchema = z.object({ email: emailSchema })

const DENIED =
  'Zu dieser Projektnummer und E-Mail-Adresse liegt keine Anfrage vor. Bitte prüfen Sie beides.'

export async function POST(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const ip = await getClientIp()
    // Dieselbe Begrenzung wie bei der Anmeldung: Die Route ist ein Ratespiel
    // mit zwei Unbekannten und darf nicht beliebig oft befragt werden.
    const limit = checkRateLimit(
      `projekt-abruf:${hashIp(ip)}`,
      RATE_LIMITS.login.limit,
      RATE_LIMITS.login.windowMs,
    )
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds)

    const parsed = lookupSchema.safeParse(await readJson(request))
    if (!parsed.success) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, {
        fieldErrors: { email: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' },
      })
    }

    const { nummer } = await context.params
    const project = await prisma.customProject.findUnique({
      where: { projectNumber: decodeURIComponent(nummer).toUpperCase() },
      select: {
        projectNumber: true,
        projectName: true,
        email: true,
        contactName: true,
        company: true,
        foodType: true,
        purpose: true,
        targetLoadGrams: true,
        goalDescription: true,
        totalLengthMm: true,
        wireDiameterTenthMm: true,
        prongCount: true,
        prongLengthMm: true,
        openingWidthMm: true,
        shape: true,
        additionalDimensions: true,
        material: true,
        tipFinish: true,
        surface: true,
        quantity: true,
        wantsConsultation: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { attachments: true } },
      },
    })

    if (!project || project.email !== parsed.data.email) {
      return jsonError(DENIED, 404, { code: 'not_found' })
    }

    const { email: _email, _count, ...rest } = project
    return jsonOk({ ...rest, attachmentCount: _count.attachments })
  } catch (error) {
    return handleRouteError(error, 'sonderanfertigung:lookup')
  }
}
