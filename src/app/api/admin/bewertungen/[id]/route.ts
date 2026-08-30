import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Sichtung eines Rezeptkommentars.
 *
 * Zwei Entscheidungen sind moeglich: freigeben oder den Text entfernen.
 *
 * Entfernt wird nur der Text, nicht die Bewertung. Die Sterne sind bereits in
 * den Durchschnitt des Rezeptes eingerechnet; sie herauszunehmen hiesse, eine
 * Meinung wegen ihrer Formulierung zu tilgen. Wer die ganze Bewertung
 * loeschen will, tut das ueber die Loeschaktion — dann wird auch der
 * Durchschnitt korrigiert.
 */

const moderationSchema = z.object({
  action: z.enum(['approve', 'remove_comment', 'delete'], {
    errorMap: () => ({ message: 'Unbekannte Aktion.' }),
  }),
})

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('content:write')
    const { id } = await context.params

    const rating = await prisma.recipeRating.findUnique({
      where: { id },
      select: {
        id: true,
        stars: true,
        comment: true,
        commentApproved: true,
        recipeId: true,
        recipe: { select: { slug: true, title: true } },
      },
    })
    if (!rating) return jsonError('Diese Bewertung wurde nicht gefunden.', 404)

    const { action } = moderationSchema.parse(await readJson(request))
    const ip = await getClientIp()

    if (action === 'approve') {
      if (rating.comment === null) {
        return jsonError('Zu dieser Bewertung gibt es keinen Kommentar.', 409, { code: 'no_comment' })
      }
      if (rating.commentApproved) {
        return jsonOk({ id, message: 'Der Kommentar war bereits freigegeben.' })
      }
      await prisma.recipeRating.update({ where: { id }, data: { commentApproved: true } })
      await writeAuditLog({
        userId: session.user.id,
        action: 'recipe.comment_approved',
        entity: 'RecipeRating',
        entityId: id,
        detail: { recipe: rating.recipe.slug },
        ip,
      })
      return jsonOk({ id, message: `Der Kommentar steht jetzt bei „${rating.recipe.title}“.` })
    }

    if (action === 'remove_comment') {
      await prisma.recipeRating.update({
        where: { id },
        data: { comment: null, authorName: null, commentApproved: false },
      })
      await writeAuditLog({
        userId: session.user.id,
        action: 'recipe.comment_removed',
        entity: 'RecipeRating',
        entityId: id,
        detail: { recipe: rating.recipe.slug },
        ip,
      })
      return jsonOk({
        id,
        message: 'Der Text wurde entfernt. Die Sternwertung bleibt im Durchschnitt.',
      })
    }

    /*
     * Vollstaendiges Loeschen: Bewertung und Kennzahlen muessen gemeinsam
     * wandern, sonst zeigt das Rezept einen Durchschnitt, den die verbliebenen
     * Bewertungen nicht hergeben.
     */
    await prisma.$transaction(async (tx) => {
      await tx.recipeRating.delete({ where: { id } })
      await tx.recipe.update({
        where: { id: rating.recipeId },
        data: {
          ratingSum: { decrement: rating.stars },
          ratingCount: { decrement: 1 },
        },
      })
    })
    await writeAuditLog({
      userId: session.user.id,
      action: 'recipe.rating_deleted',
      entity: 'RecipeRating',
      entityId: id,
      detail: { recipe: rating.recipe.slug, stars: rating.stars },
      ip,
    })
    return jsonOk({ id, message: 'Die Bewertung wurde gelöscht und der Durchschnitt korrigiert.' })
  } catch (error) {
    return handleRouteError(error, 'admin:bewertungen:patch')
  }
}
