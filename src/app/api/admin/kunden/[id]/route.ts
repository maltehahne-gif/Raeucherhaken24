import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'
import { parseTags } from '@/lib/utils/text'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/** Hoechstzahl Tags je Kunde — mehr laesst sich in der Liste nicht mehr erfassen. */
const MAX_TAGS = 12
const MAX_TAG_LENGTH = 24
const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.\-+/]*$/u

/**
 * Tags kommen als kommaseparierte Zeichenkette und werden hier vereinheitlicht:
 * getrimmt, ohne Leereintraege und ohne Dubletten (Gross-/Kleinschreibung wird
 * beim Vergleich ignoriert, die zuerst genannte Schreibweise bleibt erhalten).
 */
const tagsSchema = z
  .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
  .transform((value, ctx) => {
    const raw = value === null || value === undefined ? [] : Array.isArray(value) ? value : parseTags(value)
    const cleaned: string[] = []
    const seen = new Set<string>()

    for (const entry of raw) {
      const tag = entry.trim().replace(/\s+/g, ' ')
      if (tag.length === 0) continue
      if (tag.length > MAX_TAG_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Der Tag „${tag.slice(0, MAX_TAG_LENGTH)}…“ ist zu lang (höchstens ${MAX_TAG_LENGTH} Zeichen).`,
        })
        return z.NEVER
      }
      if (!TAG_PATTERN.test(tag)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Der Tag „${tag}“ enthält unzulässige Zeichen. Erlaubt sind Buchstaben, Ziffern, Leerzeichen und - _ . + /`,
        })
        return z.NEVER
      }
      const key = tag.toLocaleLowerCase('de-DE')
      if (seen.has(key)) continue
      seen.add(key)
      cleaned.push(tag)
    }

    if (cleaned.length > MAX_TAGS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Bitte vergeben Sie höchstens ${MAX_TAGS} Tags.`,
      })
      return z.NEVER
    }

    return cleaned
  })

const customerNotesSchema = z.object({
  notes: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined ? '' : v.trim()))
    .pipe(z.string().max(5_000, 'Die Notiz darf höchstens 5.000 Zeichen haben.')),
  tags: tagsSchema,
})

/**
 * Pflege der internen Kundenakte: Notizen und Tags.
 *
 * Stammdaten (Name, Anschrift, E-Mail) bleiben ausdruecklich unberuehrt — sie
 * stammen aus den Bestellungen des Kunden und werden nicht im Verwaltungs-
 * bereich ueberschrieben. Notizen und Tags sind rein interne Arbeitsdaten und
 * werden dem Kunden nirgends angezeigt.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('customers:write')
    const { id } = await context.params

    const existing = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, customerNumber: true, tags: true, notes: true },
    })
    if (!existing) return jsonError('Dieser Kunde wurde nicht gefunden.', 404)

    const data = customerNotesSchema.parse(await readJson(request))
    const tags = data.tags.join(', ')
    const notes = data.notes.length > 0 ? data.notes : null

    if (tags === existing.tags && notes === existing.notes) {
      return jsonOk({
        id,
        notes: notes ?? '',
        tags: data.tags,
        message: 'Es gab nichts zu speichern — die Angaben sind unverändert.',
      })
    }

    await prisma.customer.update({ where: { id }, data: { notes, tags } })

    // Der Notiztext selbst gehoert nicht ins Protokoll: er kann persoenliche
    // Angaben enthalten und stuende dort ohne Loeschmoeglichkeit.
    await writeAuditLog({
      userId: session.user.id,
      action: 'customer.notes_updated',
      entity: 'Customer',
      entityId: id,
      detail: {
        customerNumber: existing.customerNumber,
        tags: data.tags,
        noteLength: data.notes.length,
      },
      ip: await getClientIp(),
    })

    return jsonOk({
      id,
      notes: notes ?? '',
      tags: data.tags,
      message: 'Notizen und Tags wurden gespeichert.',
    })
  } catch (error) {
    return handleRouteError(error, 'admin:kunden:patch')
  }
}
