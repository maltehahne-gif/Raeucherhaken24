import { SEASONAL_THEME_LABELS, SEASONAL_THEMES } from '../../src/lib/domain/enums'

/**
 * Marketing-Stammdaten: Gutscheine, Saisonmodi und Suchsynonyme.
 *
 * Die Gutscheine sind Demodaten mit sprechenden Codes. Vor dem Produktivgang
 * sollten sie im Admin geprüft, angepasst oder deaktiviert werden.
 */

export interface CouponSeed {
  code: string
  description: string
  type: 'percent' | 'fixed' | 'free_shipping'
  /** Basispunkte bei 'percent', Cent bei 'fixed' */
  value: number
  minOrderValueCents?: number
  maxDiscountCents?: number
  usageLimit?: number
  perCustomerLimit?: number
  /** Tage ab heute; null bedeutet unbefristet */
  startsInDays?: number | null
  endsInDays?: number | null
  active?: boolean
}

export const COUPONS: CouponSeed[] = [
  {
    code: 'RAUCHSTART10',
    description: 'Willkommensrabatt für die erste Bestellung – 10 % ab 40 € Warenwert.',
    type: 'percent',
    value: 1000,
    minOrderValueCents: 4_000,
    maxDiscountCents: 3_000,
    perCustomerLimit: 1,
    endsInDays: 180,
  },
  {
    code: 'HAKEN5',
    description: '5 € Rabatt auf Räucherhaken ab 30 € Warenwert.',
    type: 'fixed',
    value: 500,
    minOrderValueCents: 3_000,
    usageLimit: 500,
    endsInDays: 90,
  },
  {
    code: 'VERSANDFREI',
    description: 'Versandkostenfreie Lieferung ab 35 € Warenwert.',
    type: 'free_shipping',
    value: 0,
    minOrderValueCents: 3_500,
    endsInDays: 60,
  },
  {
    code: 'PROFI15',
    description: '15 % für Gewerbekunden ab 250 € Warenwert, maximal 60 € Rabatt.',
    type: 'percent',
    value: 1500,
    minOrderValueCents: 25_000,
    maxDiscountCents: 6_000,
    usageLimit: 200,
  },
  {
    code: 'ABGELAUFEN',
    description:
      'Demodaten: bereits abgelaufener Gutschein, damit die Fehlerbehandlung im Checkout prüfbar ist.',
    type: 'percent',
    value: 2000,
    startsInDays: -60,
    endsInDays: -14,
  },
  {
    code: 'AUSGESCHOEPFT',
    description:
      'Demodaten: Nutzungslimit bereits erreicht, damit die Fehlerbehandlung prüfbar ist.',
    type: 'fixed',
    value: 1_000,
    usageLimit: 1,
  },
]

export interface SeasonalThemeSeed {
  key: (typeof SEASONAL_THEMES)[number]
  description: string
  bannerText: string | null
  bannerLink: string | null
  sortOrder: number
}

export const SEASONAL_THEME_SEEDS: SeasonalThemeSeed[] = [
  {
    key: 'normal',
    description: 'Ganzjähriges Erscheinungsbild ohne saisonale Akzente.',
    bannerText: null,
    bannerLink: null,
    sortOrder: 10,
  },
  {
    key: 'advent',
    description: 'Warmer Messington als Akzent, dunkelgrüner Hinweisbanner.',
    bannerText: 'Bestellen Sie rechtzeitig: Räucherware für die Feiertage braucht Vorlauf.',
    bannerLink: '/rezepte',
    sortOrder: 20,
  },
  {
    key: 'nikolaus',
    description: 'Gedeckter Rotton, ansonsten unverändertes Layout.',
    bannerText: 'Kleine Aufmerksamkeit gesucht? Gewürzsets ab 100 g.',
    bannerLink: '/kategorie/naturgewuerze',
    sortOrder: 30,
  },
  {
    key: 'weihnachten',
    description: 'Tiefgrüner Akzent mit Messing im Banner.',
    bannerText: 'Letzte Versandtermine vor den Feiertagen finden Sie auf der Versandseite.',
    bannerLink: '/versand',
    sortOrder: 40,
  },
  {
    key: 'silvester',
    description: 'Goldakzent auf anthrazitfarbenem Banner.',
    bannerText: 'Kalt geräuchert zum Jahreswechsel – Rezepte und Zeitpläne im Ratgeber.',
    bannerLink: '/wissen/raeuchermethoden',
    sortOrder: 50,
  },
  {
    key: 'neujahr',
    description: 'Kühler Blauton für den Jahresbeginn.',
    bannerText: 'Neue Saison, neue Ausstattung: Kaufberatung in fünf Schritten.',
    bannerLink: '/beratung',
    sortOrder: 60,
  },
  {
    key: 'ostern',
    description: 'Gedecktes Olivgrün, sehr zurückhaltend.',
    bannerText: 'Osterschinken und geräucherter Fisch – Anleitungen im Rezeptbereich.',
    bannerLink: '/rezepte',
    sortOrder: 70,
  },
  {
    key: 'black-week',
    description: 'Schwarz als Akzentfarbe, Preise bleiben unverändert lesbar.',
    bannerText: 'Black Week: ausgewählte Artikel reduziert, solange der Vorrat reicht.',
    bannerLink: '/kategorie?aktion=1',
    sortOrder: 80,
  },
  {
    key: 'black-friday',
    description: 'Wie Black Week, zusätzlich ein Signalton für Aktionspreise.',
    bannerText: 'Black Friday: reduzierte Artikel nur heute.',
    bannerLink: '/kategorie?aktion=1',
    sortOrder: 90,
  },
]

export function seasonalThemeName(key: string): string {
  return SEASONAL_THEME_LABELS[key as keyof typeof SEASONAL_THEME_LABELS] ?? key
}

/**
 * Zusätzliche Suchsynonyme in der Datenbank.
 * Die Grundliste steht in src/lib/server/search.ts; hier stehen Begriffe,
 * die ein Betrieb typischerweise nach den ersten Wochen ergänzt.
 */
export const SEARCH_SYNONYMS: Array<{ term: string; canonical: string }> = [
  { term: 'raucherhaken', canonical: 'raeucherhaken' },
  { term: 'rauchermehl', canonical: 'raeuchermehl' },
  { term: 'raucherlauge', canonical: 'raeucherlauge' },
  { term: 'forellenhaken', canonical: 'raeucherhaken' },
  { term: 'aalhaken', canonical: 'raeucherhaken' },
  { term: 'schinkenhaken', canonical: 'fleischerhaken' },
  { term: 'wildhaken', canonical: 'fleischerhaken' },
  { term: 'buchenmehl', canonical: 'raeuchermehl' },
  { term: 'erlenmehl', canonical: 'raeuchermehl' },
  { term: 'buchenspaene', canonical: 'raeuchermehl' },
  { term: 'raeuchergewuerz', canonical: 'gewuerze' },
  { term: 'wurstgewuerz', canonical: 'gewuerze' },
  { term: 'poekelsalz', canonical: 'salz' },
  { term: 'meersalz', canonical: 'salz' },
  { term: 'edelstahlhaken', canonical: 'raeucherhaken' },
  { term: 'inox', canonical: 'edelstahl' },
  { term: 'nirosta', canonical: 'edelstahl' },
  { term: 'aufhaengung', canonical: 'raeucherhaken' },
  { term: 'raeucherofen', canonical: 'raeucherhaken' },
  { term: 'kaltrauch', canonical: 'raeuchermehl' },
]
