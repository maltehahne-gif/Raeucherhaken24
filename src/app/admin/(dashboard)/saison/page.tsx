import type { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { requirePermission } from '@/lib/server/auth'
import { getSetting, SETTING_KEYS } from '@/lib/server/settings'
import { SEASONAL_THEMES, SEASONAL_THEME_LABELS, type SeasonalThemeKey } from '@/lib/domain/enums'
import { AdminPageHeader } from '@/components/admin/page-header'
import { SeasonForm, type SeasonFormValues } from '@/components/admin/season-form'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = { title: 'Saison & Banner', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function isThemeKey(value: string): value is SeasonalThemeKey {
  return (SEASONAL_THEMES as readonly string[]).includes(value)
}

/**
 * Saisonsteuerung der Storefront.
 *
 * Gespeichert werden vier Einstellungen im Setting-Store; das Wurzel-Layout
 * setzt daraus `data-season` und blendet den Hinweisbanner ein. Weil der
 * Seiten-Cache beim Speichern verworfen wird, ist die Umstellung sofort
 * sichtbar — es gibt keinen Veroeffentlichungsschritt.
 */
export default async function SeasonPage() {
  await requirePermission('marketing:write')

  const [rawTheme, bannerText, bannerLink, bannerActive] = await Promise.all([
    getSetting(SETTING_KEYS.seasonalTheme),
    getSetting(SETTING_KEYS.bannerText),
    getSetting(SETTING_KEYS.bannerLink),
    getSetting(SETTING_KEYS.bannerActive),
  ])

  const theme: SeasonalThemeKey = rawTheme && isThemeKey(rawTheme) ? rawTheme : 'normal'
  const initialValues: SeasonFormValues = {
    theme,
    bannerText: bannerText ?? '',
    bannerLink: bannerLink ?? '',
    bannerActive: bannerActive === 'true',
  }

  return (
    <div>
      <AdminPageHeader
        title="Saison & Banner"
        description="Farbwelt und Hinweisbanner des Shops. Der Saisonmodus verschiebt ausschließlich Farbtöne — Sortiment, Preise und Aufbau bleiben unberührt."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="accent">Aktuell: {SEASONAL_THEME_LABELS[theme]}</Badge>
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-[var(--accent)]"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Shop ansehen
            </Link>
          </div>
        }
      />

      <SeasonForm initialValues={initialValues} />
    </div>
  )
}
