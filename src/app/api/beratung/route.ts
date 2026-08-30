import { z } from 'zod'
import { headers } from 'next/headers'
import { hashIp } from '@/lib/server/crypto'
import { verifyCsrf } from '@/lib/server/csrf'
import { recommend, type AdvisorProfile } from '@/lib/server/advisor'
import { checkRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit'
import { handleRouteError, jsonError, jsonOk, jsonRateLimited, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

const profileSchema = z.object({
  foodType: z.enum(['fisch', 'fleisch', 'schinken', 'gefluegel', 'wurst', 'kaese', 'vegetarisch']).optional(),
  foodDetail: z.string().max(60).optional(),
  method: z.enum(['kalt', 'warm', 'heiss']).optional(),
  flavor: z.enum(['mild', 'kraeftig', 'wuerzig', 'suess-rauchig', 'klassisch']).optional(),
  amountGrams: z.number().int().min(0).max(500_000).optional(),
  pieceCount: z.number().int().min(0).max(2_000).optional(),
  experience: z.enum(['einsteiger', 'fortgeschritten', 'profi']).optional(),
  heavyBrineUse: z.boolean().optional(),
  budget: z.enum(['sparsam', 'mittel', 'hochwertig']).optional(),
})

/**
 * Auswertung des geführten Kaufberaters.
 * Die Empfehlung entsteht ausschließlich aus dem echten Katalog.
 */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
    const limit = checkRateLimit(
      `beratung:${hashIp(ip)}`,
      RATE_LIMITS.advisor.limit,
      RATE_LIMITS.advisor.windowMs,
    )
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds)

    const parsed = profileSchema.safeParse(await readJson(request))
    if (!parsed.success) return jsonError('Bitte prüfen Sie Ihre Auswahl.', 422)

    const result = await recommend(parsed.data as AdvisorProfile, 3)
    return jsonOk(result)
  } catch (error) {
    return handleRouteError(error, 'beratung:post')
  }
}
