/**
 * Navigationsstruktur der Storefront.
 *
 * Eine einzige Quelle fuer Kopfzeile, mobiles Menue, Fusszeile und Sitemap —
 * damit sich die Wege durch den Shop nicht auseinanderentwickeln.
 */

export interface NavLink {
  label: string
  href: string
  description?: string
}

export interface NavGroup {
  label: string
  href: string
  description?: string
  children?: NavLink[]
}

/** Kategoriewege. Die Slugs entsprechen den Seed-Kategorien. */
export const CATALOG_NAV: NavGroup[] = [
  {
    label: 'Räucherhaken',
    href: '/kategorie/raeucherhaken',
    description: 'Sechs Modelle in V2A und V4A – vom feinen Fischhaken bis zur Hakenleiste.',
    children: [
      { label: 'Alle Räucherhaken', href: '/kategorie/raeucherhaken' },
      { label: 'Fleischerhaken', href: '/kategorie/fleischerhaken', description: 'Schwere Haken für Fleischerei und Wild' },
      { label: 'Konfigurator', href: '/konfigurator', description: 'Haken nach Maß zusammenstellen' },
      { label: 'Hakenvergleich', href: '/vergleich', description: 'Modelle direkt gegenüberstellen' },
    ],
  },
  {
    label: 'Räuchermehl',
    href: '/kategorie/raeuchermehl',
    description: 'Buche, Erle, Eiche, Kirsche und Wacholder in Räucherqualität.',
  },
  {
    label: 'Räucherlaugen',
    href: '/kategorie/raeucherlaugen',
    description: 'Fertige Gewürzmischungen zum Ansetzen der Lake.',
  },
  {
    label: 'Naturgewürze',
    href: '/kategorie/naturgewuerze',
    description: 'Über einhundert Einzelgewürze, Kräuter, Mischungen und Salze.',
  },
  {
    label: 'Sonderanfertigung',
    href: '/sonderanfertigung',
    description: 'Haken nach Zeichnung – vom Prototyp bis zur Serie.',
  },
]

/** Beratung und Inhalte. */
export const CONTENT_NAV: NavGroup[] = [
  {
    label: 'Rezepte',
    href: '/rezepte',
    description: 'Erprobte Anleitungen für Fisch, Fleisch, Wurst und Käse.',
  },
  {
    label: 'Wissen',
    href: '/wissen',
    description: 'Grundlagen, Methoden und Werkstoffkunde rund ums Räuchern.',
  },
  {
    label: 'Kaufberatung',
    href: '/beratung',
    description: 'In fünf Schritten zur passenden Ausstattung.',
  },
]

export const SERVICE_NAV: NavLink[] = [
  { label: 'Kontakt & Support', href: '/kontakt' },
  { label: 'Versand & Lieferung', href: '/versand' },
  { label: 'Zahlungsarten', href: '/zahlung' },
  { label: 'Bestellung verfolgen', href: '/bestellung' },
]

export const LEGAL_NAV: NavLink[] = [
  { label: 'Impressum', href: '/impressum' },
  { label: 'Datenschutz', href: '/datenschutz' },
  { label: 'AGB', href: '/agb' },
  { label: 'Widerrufsrecht', href: '/widerruf' },
]

/** Alle statischen, indexierbaren Seiten fuer die Sitemap. */
export const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly' }> = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/kategorie', priority: 0.9, changeFrequency: 'daily' },
  { path: '/konfigurator', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/vergleich', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/beratung', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/sonderanfertigung', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/rezepte', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/wissen', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/kontakt', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/versand', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/zahlung', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/impressum', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/datenschutz', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/agb', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/widerruf', priority: 0.3, changeFrequency: 'yearly' },
]

/** Seiten, die nie indexiert werden duerfen. */
export const NOINDEX_PREFIXES = ['/admin', '/warenkorb', '/kasse', '/bestellung/', '/api'] as const
