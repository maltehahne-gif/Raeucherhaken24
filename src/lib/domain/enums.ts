/**
 * Zentrale Definition aller Status- und Typwerte.
 *
 * Der Dev-Provider SQLite unterstuetzt keine Prisma-Enums, deshalb liegen diese
 * Werte als String in der Datenbank. Gueltigkeit wird ausschliesslich hier und
 * ueber die Zod-Schemata in src/lib/validation erzwungen.
 */
import { z } from 'zod'

function enumOf<const T extends readonly [string, ...string[]]>(values: T) {
  return { values, schema: z.enum(values) } as const
}

// --- Bestellung ------------------------------------------------------------

export const ORDER_STATUSES = [
  'new',
  'confirmed',
  'picking',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export const orderStatusSchema = enumOf(ORDER_STATUSES).schema

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Neu',
  confirmed: 'Bestätigt',
  picking: 'In Kommissionierung',
  packed: 'Verpackt',
  shipped: 'Versendet',
  delivered: 'Zugestellt',
  cancelled: 'Storniert',
}

/** Erlaubte Statusuebergaenge. Verhindert unsinnige Spruenge im Admin. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ['confirmed', 'picking', 'cancelled'],
  confirmed: ['picking', 'cancelled'],
  picking: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to)
}

/** Ab diesem Status gilt die Ware als das Haus verlassen habend. */
export const ORDER_OPEN_STATUSES: readonly OrderStatus[] = ['new', 'confirmed', 'picking', 'packed']

export const PAYMENT_STATUSES = ['pending', 'paid', 'partially_refunded', 'refunded', 'failed'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export const paymentStatusSchema = enumOf(PAYMENT_STATUSES).schema

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Offen',
  paid: 'Bezahlt',
  partially_refunded: 'Teilerstattet',
  refunded: 'Erstattet',
  failed: 'Fehlgeschlagen',
}

export const PAYMENT_METHODS = ['prepayment', 'invoice'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export const paymentMethodSchema = enumOf(PAYMENT_METHODS).schema

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  prepayment: 'Vorkasse per Überweisung',
  invoice: 'Kauf auf Rechnung (nur für Geschäftskunden nach Freigabe)',
}

export const CARRIERS = ['dhl', 'dpd', 'gls', 'ups', 'spedition', 'abholung'] as const
export type Carrier = (typeof CARRIERS)[number]
export const CARRIER_LABELS: Record<Carrier, string> = {
  dhl: 'DHL',
  dpd: 'DPD',
  gls: 'GLS',
  ups: 'UPS',
  spedition: 'Spedition',
  abholung: 'Selbstabholung',
}

/** Tracking-URL-Vorlagen. `{tracking}` wird ersetzt. */
export const CARRIER_TRACKING_URLS: Partial<Record<Carrier, string>> = {
  dhl: 'https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode={tracking}',
  dpd: 'https://tracking.dpd.de/status/de_DE/parcel/{tracking}',
  gls: 'https://gls-group.com/DE/de/paketverfolgung?match={tracking}',
  ups: 'https://www.ups.com/track?loc=de_DE&tracknum={tracking}',
}

// --- Produkt ---------------------------------------------------------------

export const PRODUCT_TYPES = ['simple', 'configurable', 'custom'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]
export const productTypeSchema = enumOf(PRODUCT_TYPES).schema

export const MATERIALS = ['V2A', 'V4A', 'VA', 'Federstahl', 'Holz', 'Naturprodukt'] as const
export type Material = (typeof MATERIALS)[number]

export const MATERIAL_LABELS: Record<string, string> = {
  V2A: 'V2A (1.4301)',
  V4A: 'V4A (1.4404)',
  VA: 'VA (Edelstahl rostfrei)',
  Federstahl: 'Federstahl',
  Holz: 'Holz',
  Naturprodukt: 'Naturprodukt',
}

export const BASE_UNITS = ['kg', 'l', 'stk'] as const
export type BaseUnit = (typeof BASE_UNITS)[number]

// --- Gutscheine ------------------------------------------------------------

export const COUPON_TYPES = ['percent', 'fixed', 'free_shipping'] as const
export type CouponType = (typeof COUPON_TYPES)[number]
export const couponTypeSchema = enumOf(COUPON_TYPES).schema

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  percent: 'Prozentrabatt',
  fixed: 'Fester Betrag',
  free_shipping: 'Versandkostenfrei',
}

// --- Lager -----------------------------------------------------------------

export const MOVEMENT_REASONS = [
  'order',
  'cancellation',
  'refund',
  'manual',
  'correction',
  'seed',
] as const
export type MovementReason = (typeof MOVEMENT_REASONS)[number]

export const MOVEMENT_REASON_LABELS: Record<MovementReason, string> = {
  order: 'Bestellung',
  cancellation: 'Stornierung',
  refund: 'Erstattung / Retoure',
  manual: 'Manuelle Buchung',
  correction: 'Korrektur',
  seed: 'Ersteinrichtung',
}

// --- Support ---------------------------------------------------------------

export const SUPPORT_STATUSES = ['new', 'in_progress', 'waiting', 'resolved', 'closed'] as const
export type SupportStatus = (typeof SUPPORT_STATUSES)[number]
export const supportStatusSchema = enumOf(SUPPORT_STATUSES).schema

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  new: 'Neu',
  in_progress: 'In Bearbeitung',
  waiting: 'Wartet auf Kunde',
  resolved: 'Gelöst',
  closed: 'Geschlossen',
}

export const SUPPORT_TOPICS = ['general', 'order', 'product', 'custom', 'complaint'] as const
export type SupportTopic = (typeof SUPPORT_TOPICS)[number]
export const supportTopicSchema = enumOf(SUPPORT_TOPICS).schema

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  general: 'Allgemeine Frage',
  order: 'Frage zu einer Bestellung',
  product: 'Produktberatung',
  custom: 'Sonderanfertigung',
  complaint: 'Reklamation',
}

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high'] as const
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number]
export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
}

// --- Sonderanfertigungen ---------------------------------------------------

export const PROJECT_STATUSES = [
  'new',
  'in_review',
  'quoted',
  'accepted',
  'in_production',
  'delivered',
  'rejected',
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export const projectStatusSchema = enumOf(PROJECT_STATUSES).schema

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  new: 'Neu eingegangen',
  in_review: 'In technischer Prüfung',
  quoted: 'Angebot erstellt',
  accepted: 'Beauftragt',
  in_production: 'In Fertigung',
  delivered: 'Ausgeliefert',
  rejected: 'Abgelehnt',
}

// --- Rezepte ---------------------------------------------------------------

export const SMOKE_METHODS = ['kalt', 'warm', 'heiss'] as const
export type SmokeMethod = (typeof SMOKE_METHODS)[number]
export const SMOKE_METHOD_LABELS: Record<SmokeMethod, string> = {
  kalt: 'Kalträuchern',
  warm: 'Warmräuchern',
  heiss: 'Heißräuchern',
}

export const FOOD_TYPES = [
  'fisch',
  'fleisch',
  'schinken',
  'gefluegel',
  'wurst',
  'kaese',
  'vegetarisch',
] as const
export type FoodType = (typeof FOOD_TYPES)[number]
export const FOOD_TYPE_LABELS: Record<FoodType, string> = {
  fisch: 'Fisch',
  fleisch: 'Fleisch',
  schinken: 'Schinken',
  gefluegel: 'Geflügel',
  wurst: 'Wurst',
  kaese: 'Käse',
  vegetarisch: 'Vegetarisch',
}

export const FLAVORS = ['mild', 'kraeftig', 'wuerzig', 'suess-rauchig', 'klassisch'] as const
export type Flavor = (typeof FLAVORS)[number]
export const FLAVOR_LABELS: Record<Flavor, string> = {
  mild: 'Mild',
  kraeftig: 'Kräftig',
  wuerzig: 'Würzig',
  'suess-rauchig': 'Süß-rauchig',
  klassisch: 'Klassisch',
}

export const WOOD_TYPES = ['buche', 'erle', 'eiche', 'kirsche', 'apfel', 'wacholder', 'mix'] as const
export type WoodType = (typeof WOOD_TYPES)[number]
export const WOOD_TYPE_LABELS: Record<WoodType, string> = {
  buche: 'Buche',
  erle: 'Erle',
  eiche: 'Eiche',
  kirsche: 'Kirsche',
  apfel: 'Apfel',
  wacholder: 'Wacholder',
  mix: 'Holzmischung',
}

export const DIFFICULTIES = ['einsteiger', 'fortgeschritten', 'profi'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  einsteiger: 'Einsteiger',
  fortgeschritten: 'Fortgeschritten',
  profi: 'Profi',
}

// --- Saison ----------------------------------------------------------------

export const SEASONAL_THEMES = [
  'normal',
  'advent',
  'nikolaus',
  'weihnachten',
  'silvester',
  'neujahr',
  'ostern',
  'black-week',
  'black-friday',
] as const
export type SeasonalThemeKey = (typeof SEASONAL_THEMES)[number]
export const seasonalThemeSchema = enumOf(SEASONAL_THEMES).schema

export const SEASONAL_THEME_LABELS: Record<SeasonalThemeKey, string> = {
  normal: 'Standard',
  advent: 'Advent',
  nikolaus: 'Nikolaus',
  weihnachten: 'Weihnachten',
  silvester: 'Silvester',
  neujahr: 'Neujahr',
  ostern: 'Ostern',
  'black-week': 'Black Week',
  'black-friday': 'Black Friday',
}

// --- Sortierung ------------------------------------------------------------

export const SORT_OPTIONS = [
  'relevanz',
  'name-asc',
  'name-desc',
  'preis-asc',
  'preis-desc',
  'beliebtheit',
  'bestseller',
  'neu',
] as const
export type SortOption = (typeof SORT_OPTIONS)[number]
export const sortOptionSchema = enumOf(SORT_OPTIONS).schema

export const SORT_OPTION_LABELS: Record<SortOption, string> = {
  relevanz: 'Relevanz',
  'name-asc': 'Name A–Z',
  'name-desc': 'Name Z–A',
  'preis-asc': 'Preis aufsteigend',
  'preis-desc': 'Preis absteigend',
  beliebtheit: 'Beliebtheit',
  bestseller: 'Bestseller',
  neu: 'Neuheiten',
}
