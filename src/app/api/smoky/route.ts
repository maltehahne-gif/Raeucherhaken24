import { headers } from 'next/headers'
import { z } from 'zod'
import { hashIp } from '@/lib/server/crypto'
import { verifyCsrf } from '@/lib/server/csrf'
import { answer, isUsableMessage, type ChatMessage } from '@/lib/server/smoky'
import { checkRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit'
import { handleRouteError, jsonError, jsonOk, jsonRateLimited, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(24),
  profile: z
    .object({
      foodType: z.string().max(30).optional(),
      foodDetail: z.string().max(60).optional(),
      method: z.string().max(20).optional(),
      flavor: z.string().max(30).optional(),
      amountGrams: z.number().int().min(0).max(500_000).optional(),
      pieceCount: z.number().int().min(0).max(2_000).optional(),
      experience: z.string().max(30).optional(),
      heavyBrineUse: z.boolean().optional(),
      budget: z.string().max(20).optional(),
    })
    .optional(),
})

/**
 * Chatendpunkt für den Räucherberater.
 *
 * Der übergebene Verlauf ist reine Eingabe; alle Empfehlungen entstehen
 * serverseitig aus dem echten Katalog. Das Profil kommt vom Browser zurück,
 * wird aber vollständig validiert und ausschließlich zur Auswahl von Artikeln
 * verwendet — es kann keine Preise, Rechte oder Datenbankinhalte beeinflussen.
 */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
    const limit = checkRateLimit(
      `smoky:${hashIp(ip)}`,
      RATE_LIMITS.advisor.limit,
      RATE_LIMITS.advisor.windowMs,
    )
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds)

    const parsed = chatSchema.safeParse(await readJson(request))
    if (!parsed.success) return jsonError('Die Anfrage konnte nicht verarbeitet werden.', 422)

    const messages = parsed.data.messages as ChatMessage[]
    const last = messages[messages.length - 1]
    if (last.role !== 'user' || !isUsableMessage(last.content)) {
      return jsonOk({
        text: 'Können Sie das etwas genauer beschreiben? Zum Beispiel: „Ich möchte zehn Forellen heiß räuchern.“',
        products: [],
        suggestions: ['Forellen heiß räuchern', 'Lachs kalt räuchern', 'Schinken für den Winter'],
        profile: parsed.data.profile ?? {},
        source: 'regelwerk',
      })
    }

    const reply = await answer(messages, (parsed.data.profile ?? {}) as never)
    return jsonOk(reply)
  } catch (error) {
    return handleRouteError(error, 'smoky:post')
  }
}
