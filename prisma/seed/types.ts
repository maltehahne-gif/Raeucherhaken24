/**
 * Struktur der generierten Seed-Inhalte in prisma/seed-data/.
 *
 * Diese Dateien enthalten redaktionelle Demodaten. Sie sind bewusst von der
 * Seed-Logik getrennt, damit ein Betrieb sie durch echte Produktdaten ersetzen
 * kann, ohne die Anlagelogik anzufassen.
 */

export interface SeedSpec {
  key: string
  label: string
  value: string
  group?: string
}

export interface SeedProduct {
  name: string
  subtitle?: string
  shortDescription: string
  description: string
  priceCents: number
  weightGrams?: number
  shippingWeightGrams?: number
  lengthMm?: number
  /** Drahtstärke in Zehntelmillimetern (30 = 3,0 mm) */
  wireDiameterTenthMm?: number
  loadCapacityGrams?: number
  material?: string
  usage?: string
  tipFinish?: string
  packagingUnit?: number
  baseUnit?: string
  baseUnitAmount?: number
  bestseller?: boolean
  stock?: number
  deliveryDaysMin?: number
  deliveryDaysMax?: number
  specs?: SeedSpec[]
}

export interface SeedCatalog {
  haken: SeedProduct[]
  fleischerhaken: SeedProduct[]
  raeuchermehl: SeedProduct[]
  laugen: SeedProduct[]
  sonder: SeedProduct[]
  'gewuerze-1': SeedProduct[]
  'gewuerze-2': SeedProduct[]
  'gewuerze-3': SeedProduct[]
  'gewuerze-4': SeedProduct[]
}

export interface SeedRecipe {
  title: string
  teaser: string
  intro: string
  method: string
  foodType: string
  flavor: string
  woodType: string
  difficulty: string
  prepMinutes?: number
  brineHours?: number
  smokeMinutes?: number
  servings?: number
  ingredients: Array<{ label: string; amount?: string; group?: string }>
  steps: Array<{ title: string; body: string; durationMinutes?: number }>
}

export interface SeedArticleSection {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export interface SeedArticle {
  slug: string
  title: string
  teaser: string
  metaDescription?: string
  readMinutes?: number
  sections: SeedArticleSection[]
  faq?: Array<{ question: string; answer: string }>
}
