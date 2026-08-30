import { z } from 'zod'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { generateToken, hashIp, sha256 } from '@/lib/server/crypto'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { checkRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit'
import {
  getClientIp,
  handleRouteError,
  jsonError,
  jsonNotFound,
  jsonOk,
  jsonRateLimited,
  readJson,
} from '@/lib/server/http'
import { optionalString } from '@/lib/validation/common'

export const dynamic = 'force-dynamic'

/**
 * Bewertung eines Rezeptes.
 *
 * Je Besucher und Rezept existiert genau eine Bewertung. Erkannt wird der
 * Besucher ueber ein eigenes HttpOnly-Cookie mit Zufallstoken — bewusst nicht
 * ueber die IP-Adresse: hinter einem Anschluss sitzen oft mehrere Personen,
 * und eine wechselnde IP wuerde dieselbe Person mehrfach zaehlen lassen.
 *
 * In der Datenbank steht nur der Hash des Tokens. Damit laesst sich zwar
 * pruefen, ob eine Bewertung von demselben Browser stammt, aus dem Bestand
 * heraus aber kein gueltiges Cookie erzeugen.
 *
 * Eine Anmeldung ist nicht noetig; die Zugangspruefung besteht aus drei
 * Ebenen: gueltiges CSRF-Token, veroeffentlichtes Rezept und die Bindung an
 * genau eine Bewertung je Besucher.
 */

const VOTER_COOKIE = 'rh24_rezept_voter'
const VOTER_TTL_SECONDS = 365 * 24 * 60 * 60

type RouteContext = { params: Promise<{ slug: string }> }

const ratingSchema = z.object({
  stars: z
    .number({
      required_error: 'Bitte vergeben Sie eine Bewertung.',
      invalid_type_error: 'Bitte vergeben Sie eine Bewertung.',
    })
    .int('Bitte vergeben Sie zwischen einem und fünf Sternen.')
    .min(1, 'Bitte vergeben Sie mindestens einen Stern.')
    .max(5, 'Es sind höchstens fünf Sterne möglich.'),
  comment: optionalString(1_000, 'Ihr Kommentar'),
  authorName: optionalString(60, 'Ihr Name'),
  // Von Menschen nie ausgefuellt, von einfachen Bots dagegen oft.
  website: z.string().max(0, 'Ihre Bewertung konnte nicht verarbeitet werden.').optional(),
})

/**
 * Der Token ist bereits ein 32 Byte langes Zufallsgeheimnis. Ein Pepper wie
 * bei IP-Adressen bringt hier nichts: Der Wertebereich ist zu gross, um ihn
 * durchzuprobieren.
 */
function voterKeyFrom(token: string): string {
  return sha256(token).slice(0, 32)
}

function averageOf(sum: number, count: number): number | null {
  return count > 0 ? Math.round((sum / count) * 100) / 100 : null
}

interface RatingState {
  average: number | null
  count: number
  /** Die eigene Bewertung dieses Besuchers, sofern vorhanden. */
  own: {
    stars: number
    comment: string | null
    authorName: string | null
    /** Steht der eigene Kommentar oeffentlich oder noch in der Sichtung? */
    commentApproved: boolean
  } | null
}

/**
 * Aktueller Stand samt eigener Bewertung.
 * Setzt bewusst kein Cookie: Wer nur liest, bekommt keine Kennung.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params

    const recipe = await prisma.recipe.findFirst({
      where: { slug, published: true },
      select: { id: true, ratingSum: true, ratingCount: true },
    })
    if (!recipe) return jsonNotFound('Dieses Rezept gibt es nicht.')

    const token = (await cookies()).get(VOTER_COOKIE)?.value
    const own = token
      ? await prisma.recipeRating.findUnique({
          where: { recipeId_voterKey: { recipeId: recipe.id, voterKey: voterKeyFrom(token) } },
          select: { stars: true, comment: true, authorName: true, commentApproved: true },
        })
      : null

    const state: RatingState = {
      average: averageOf(recipe.ratingSum, recipe.ratingCount),
      count: recipe.ratingCount,
      own,
    }
    return jsonOk(state)
  } catch (error) {
    return handleRouteError(error, 'rezept-bewertung:get')
  }
}

/** Bewertung abgeben oder die eigene, bereits abgegebene Bewertung aendern. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const ip = await getClientIp()
    const limit = checkRateLimit(
      `rezept-bewertung:${hashIp(ip)}`,
      RATE_LIMITS.rating.limit,
      RATE_LIMITS.rating.windowMs,
    )
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds)

    const parsed = ratingSchema.safeParse(await readJson(request))
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.')
        if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
      }
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, { fieldErrors })
    }

    const { slug } = await context.params
    const recipe = await prisma.recipe.findFirst({
      where: { slug, published: true },
      select: { id: true },
    })
    if (!recipe) return jsonNotFound('Dieses Rezept gibt es nicht.')

    const store = await cookies()
    const existingToken = store.get(VOTER_COOKIE)?.value
    const token = existingToken ?? generateToken(24)
    const voterKey = voterKeyFrom(token)

    const { stars, comment, authorName } = parsed.data

    /*
     * Bewertung und Kennzahlen des Rezeptes muessen gemeinsam wandern —
     * sonst zeigt die Uebersicht einen Durchschnitt, den die Einzelbewertungen
     * nicht hergeben. Der eindeutige Index (recipeId, voterKey) verhindert
     * zusaetzlich, dass ein Doppelklick zwei Bewertungen anlegt.
     */
    const outcome = await prisma.$transaction(async (tx) => {
      const previous = await tx.recipeRating.findUnique({
        where: { recipeId_voterKey: { recipeId: recipe.id, voterKey } },
        select: { id: true, stars: true },
      })

      /*
       * Ein Kommentar geht immer neu in die Sichtung — auch beim Aendern einer
       * bereits freigegebenen Bewertung. Sonst liesse sich ein harmloser Text
       * freigeben und anschliessend gegen einen beliebigen austauschen.
       */
      if (previous) {
        await tx.recipeRating.update({
          where: { id: previous.id },
          data: {
            stars,
            comment: comment ?? null,
            authorName: authorName ?? null,
            commentApproved: false,
          },
        })
      } else {
        await tx.recipeRating.create({
          data: {
            recipeId: recipe.id,
            voterKey,
            stars,
            comment: comment ?? null,
            authorName: authorName ?? null,
          },
        })
      }

      const updated = await tx.recipe.update({
        where: { id: recipe.id },
        data: previous
          ? { ratingSum: { increment: stars - previous.stars } }
          : { ratingSum: { increment: stars }, ratingCount: { increment: 1 } },
        select: { ratingSum: true, ratingCount: true },
      })

      return { updated, wasUpdate: previous !== null }
    })

    if (!existingToken) {
      store.set(VOTER_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: VOTER_TTL_SECONDS,
      })
    }

    // Protokolliert wird der Vorgang, nicht der Kommentartext: Er kann
    // personenbezogene Angaben enthalten und stuende im Protokoll ohne
    // Loeschmoeglichkeit.
    await writeAuditLog({
      action: outcome.wasUpdate ? 'recipe.rating_updated' : 'recipe.rated',
      entity: 'Recipe',
      entityId: recipe.id,
      detail: { slug, stars, hasComment: comment !== null && comment !== undefined },
      ip,
    })

    const state: RatingState = {
      average: averageOf(outcome.updated.ratingSum, outcome.updated.ratingCount),
      count: outcome.updated.ratingCount,
      own: {
        stars,
        comment: comment ?? null,
        authorName: authorName ?? null,
        commentApproved: false,
      },
    }

    // Die Sternwertung zaehlt sofort, der Text erst nach der Sichtung. Beides
    // gehoert in die Rueckmeldung, sonst wartet jemand vergeblich auf seinen
    // Kommentar oder haelt die Bewertung fuer verloren.
    const hasComment = typeof comment === 'string' && comment.length > 0
    const base = outcome.wasUpdate
      ? 'Ihre Bewertung wurde aktualisiert.'
      : 'Vielen Dank für Ihre Bewertung.'

    return jsonOk({
      ...state,
      message: hasComment
        ? `${base} Ihre Sterne zählen sofort; Ihr Kommentar erscheint nach einer kurzen Sichtung.`
        : base,
    })
  } catch (error) {
    return handleRouteError(error, 'rezept-bewertung:post')
  }
}
