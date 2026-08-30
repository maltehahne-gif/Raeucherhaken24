import { z } from 'zod'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'
import { getSetting, setSetting, SETTING_KEYS } from '@/lib/server/settings'
import { SEASONAL_THEMES, SEASONAL_THEME_LABELS, type SeasonalThemeKey } from '@/lib/domain/enums'

export const dynamic = 'force-dynamic'

/**
 * Saisonmodus und Hinweisbanner der Storefront.
 *
 * Beides sind Betriebseinstellungen im Setting-Store und wirken sofort auf
 * jede Seite: `setSetting` verwirft den Einstellungs-Cache und den
 * Seiten-Cache des Wurzel-Layouts.
 *
 * Der Bannerlink wird eingeschraenkt auf shopeigene Pfade und https-Adressen.
 * Damit kann ueber diese Einstellung kein `javascript:`-Aufruf und keine
 * unverschluesselte Weiterleitung in den Kopfbereich gelangen.
 */

/** Fehlende Werte wie ein leeres Feld behandeln, damit die deutsche Meldung greift. */
const asText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

const flagSchema = z
  .union([z.boolean(), z.string(), z.null(), z.undefined()])
  .transform((v) => v === true || v === 'on' || v === 'true')

const seasonSchema = z
  .object({
    theme: z.preprocess(
      asText,
      z.enum(SEASONAL_THEMES, {
        errorMap: () => ({ message: 'Bitte wählen Sie einen der angebotenen Saisonmodi.' }),
      }),
    ),
    bannerText: z.preprocess(
      asText,
      z
        .string()
        .transform((v) => v.trim().replace(/\s+/g, ' '))
        .pipe(z.string().max(160, 'Der Bannertext darf höchstens 160 Zeichen haben.')),
    ),
    bannerLink: z.preprocess(
      asText,
      z
        .string()
        .transform((v) => v.trim())
        .pipe(z.string().max(200, 'Der Bannerlink darf höchstens 200 Zeichen haben.')),
    ),
    bannerActive: flagSchema,
  })
  .superRefine((data, ctx) => {
    if (data.bannerActive && data.bannerText.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bannerText'],
        message: 'Ein sichtbarer Banner braucht einen Text.',
      })
    }

    if (data.bannerLink.length === 0) return

    const internal = data.bannerLink.startsWith('/') && !data.bannerLink.startsWith('//')
    const external = data.bannerLink.startsWith('https://')
    if (!internal && !external) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bannerLink'],
        message:
          'Bitte geben Sie einen Pfad im Shop an (Beispiel: /kategorie/raeucherhaken) oder eine vollständige https-Adresse.',
      })
      return
    }

    if (external) {
      try {
        new URL(data.bannerLink)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bannerLink'],
          message: 'Diese Adresse ist nicht gültig.',
        })
      }
    }
  })

export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('marketing:write')
    const data = seasonSchema.parse(await readJson(request))

    const previousTheme = (await getSetting(SETTING_KEYS.seasonalTheme)) ?? 'normal'
    const previousBannerActive = (await getSetting(SETTING_KEYS.bannerActive)) === 'true'

    await setSetting(SETTING_KEYS.seasonalTheme, data.theme)
    await setSetting(SETTING_KEYS.bannerText, data.bannerText)
    await setSetting(SETTING_KEYS.bannerLink, data.bannerLink)
    await setSetting(SETTING_KEYS.bannerActive, data.bannerActive ? 'true' : 'false')

    await writeAuditLog({
      userId: session.user.id,
      action: 'season.updated',
      entity: 'Setting',
      entityId: SETTING_KEYS.seasonalTheme,
      detail: {
        theme: data.theme,
        previousTheme,
        bannerActive: data.bannerActive,
        bannerText: data.bannerText.slice(0, 160),
        bannerLink: data.bannerLink,
      },
      ip: await getClientIp(),
    })

    const themeLabel = SEASONAL_THEME_LABELS[data.theme as SeasonalThemeKey]
    const themeSentence =
      previousTheme === data.theme
        ? `Der Saisonmodus bleibt „${themeLabel}“.`
        : `Der Shop läuft ab sofort im Modus „${themeLabel}“.`
    const bannerSentence = data.bannerActive
      ? 'Der Hinweisbanner ist sichtbar.'
      : previousBannerActive
        ? 'Der Hinweisbanner wurde ausgeblendet.'
        : 'Der Hinweisbanner bleibt ausgeblendet.'

    return jsonOk({
      theme: data.theme,
      message: `${themeSentence} ${bannerSentence} Die Umstellung gilt sofort für alle Besucherinnen und Besucher.`,
    })
  } catch (error) {
    return handleRouteError(error, 'admin:saison:post')
  }
}
