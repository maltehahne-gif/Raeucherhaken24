import { prisma } from '@/lib/db'
import { SEASONAL_THEMES, type SeasonalThemeKey } from '@/lib/domain/enums'

/**
 * Betriebseinstellungen aus der Setting-Tabelle.
 *
 * Die Werte aendern sich selten, werden aber auf jeder Seite gebraucht
 * (z. B. der Saisonmodus im Layout). Deshalb ein kurzer prozesslokaler Cache.
 */

const CACHE_TTL_MS = 30_000
let cache: { values: Map<string, string>; loadedAt: number } | null = null

export const SETTING_KEYS = {
  seasonalTheme: 'shop:seasonal_theme',
  bannerText: 'shop:banner_text',
  bannerLink: 'shop:banner_link',
  bannerActive: 'shop:banner_active',
} as const

async function loadSettings(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.values
  const values = new Map<string, string>()
  try {
    const rows = await prisma.setting.findMany()
    for (const row of rows) values.set(row.key, row.value)
  } catch {
    // Ohne Datenbank laeuft der Shop im Standardmodus weiter.
  }
  cache = { values, loadedAt: Date.now() }
  return values
}

export function invalidateSettingsCache(): void {
  cache = null
}

export async function getSetting(key: string): Promise<string | null> {
  const values = await loadSettings()
  return values.get(key) ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  invalidateSettingsCache()
}

export interface StorefrontSettings {
  theme: SeasonalThemeKey
  banner: { text: string; link: string | null } | null
}

function isThemeKey(value: string): value is SeasonalThemeKey {
  return (SEASONAL_THEMES as readonly string[]).includes(value)
}

/** Liest alles, was das Storefront-Layout braucht, in einem Rutsch. */
export async function getStorefrontSettings(): Promise<StorefrontSettings> {
  const values = await loadSettings()
  const rawTheme = values.get(SETTING_KEYS.seasonalTheme) ?? 'normal'
  const theme: SeasonalThemeKey = isThemeKey(rawTheme) ? rawTheme : 'normal'

  const bannerText = values.get(SETTING_KEYS.bannerText)?.trim()
  const bannerActive = values.get(SETTING_KEYS.bannerActive) === 'true'
  const bannerLink = values.get(SETTING_KEYS.bannerLink)?.trim()

  return {
    theme,
    banner:
      bannerActive && bannerText
        ? { text: bannerText, link: bannerLink && bannerLink.length > 0 ? bannerLink : null }
        : null,
  }
}
