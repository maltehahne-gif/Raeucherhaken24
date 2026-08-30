import { z } from 'zod'
import { BASE_UNITS, MATERIALS } from '@/lib/domain/enums'
import {
  intFromInput,
  optionalIntFromInput,
  optionalString,
  priceFromInput,
  slugSchema,
  trimmedString,
} from '@/lib/validation/common'

/**
 * Validierung der Produktpflege im Verwaltungsbereich.
 *
 * Die Feldnamen entsprechen exakt den Namen im Formular. Dadurch landet jede
 * Zod-Meldung ueber `zodErrorResponse` direkt an dem Feld, das sie verursacht
 * hat — ohne eine Uebersetzungsschicht, die auseinanderlaufen kann.
 *
 * Diese Datei bleibt bewusst frei von Datenbank- und Server-Importen: das
 * Formular im Browser nutzt dieselben Konstanten und Hilfsfunktionen.
 */

/** Steuersaetze, die der Betrieb ansetzen darf (in Basispunkten). */
export const TAX_RATE_OPTIONS = [
  { value: 1900, label: '19 % — Regelsatz' },
  { value: 700, label: '7 % — ermäßigter Satz' },
  { value: 0, label: '0 % — steuerfrei' },
] as const

/** Beschriftungen der Grundpreiseinheiten nach PAngV. */
export const BASE_UNIT_LABELS: Record<string, string> = {
  kg: 'Kilogramm (Inhalt in Gramm)',
  l: 'Liter (Inhalt in Millilitern)',
  stk: 'Stück (Inhalt in Stück)',
}

/** Empfohlene Laengen fuer die Suchmaschinen-Vorschau. */
export const SEO_LIMITS = {
  metaTitle: { recommended: 60, max: 70 },
  metaDescription: { recommended: 160, max: 180 },
} as const

/** SKU und Artikelnummer: technische Kennungen, deshalb normiert auf Grossbuchstaben. */
const identifierSchema = (label: string, min: number, max: number) =>
  z
    .string({ required_error: `${label} ist erforderlich.`, invalid_type_error: `${label} ist ungültig.` })
    .transform((v) => v.trim().toUpperCase())
    .pipe(
      z
        .string()
        .min(min, `${label} muss mindestens ${min} Zeichen haben.`)
        .max(max, `${label} darf höchstens ${max} Zeichen haben.`)
        .regex(
          /^[A-Z0-9][A-Z0-9._-]*$/,
          `${label} darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.`,
        ),
    )

/** Optionaler Preis: leeres Feld bedeutet "kein Angebotspreis". */
const optionalPriceFromInput = (label: string) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v, ctx) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'number') return Math.round(v * 100)
      const raw = v.trim()
      if (raw.length === 0) return null
      const normalized = raw.replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.')
      if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} ist ungültig (Beispiel: 17,90).`,
        })
        return z.NEVER
      }
      return Math.round(Number.parseFloat(normalized) * 100)
    })
    .pipe(
      z
        .number()
        .int()
        .min(0, `${label} darf nicht negativ sein.`)
        .max(9_999_999, `${label} ist unrealistisch hoch.`)
        .nullable(),
    )

/** Zeitpunkt aus einem `datetime-local`-Feld; leeres Feld ergibt null. */
const optionalDateFromInput = (label: string) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v, ctx) => {
      if (v === null || v === undefined) return null
      const raw = v.trim()
      if (raw.length === 0) return null
      const date = new Date(raw)
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} ist kein gültiger Zeitpunkt.` })
        return z.NEVER
      }
      return date
    })
    .pipe(z.date().nullable())

/** Auswahlfeld, das leer bleiben darf. */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined || v.trim().length === 0 ? null : v.trim()))
    .pipe(z.enum(values, { errorMap: () => ({ message }) }).nullable())

/** Kontrollkaestchen: akzeptiert echte Booleans und Formularwerte gleichermassen. */
const flagSchema = z
  .union([z.boolean(), z.string(), z.null(), z.undefined()])
  .transform((v) => v === true || v === 'on' || v === 'true')

/**
 * Fehlende Pflichtfelder wie ein leeres Feld behandeln.
 *
 * Ohne das meldet Zod fuer einen fehlenden Schluessel die technische
 * Standardmeldung; mit der Vorbehandlung greift die deutsche Meldung des
 * jeweiligen Basisschemas.
 */
const emptyIfMissing = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((value) => (value === undefined || value === null ? '' : value), inner)

const taxRateSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : /^\d+$/.test(v.trim()) ? Number.parseInt(v.trim(), 10) : Number.NaN))
  .pipe(
    z
      .number({ invalid_type_error: 'Bitte wählen Sie einen Steuersatz.' })
      .int('Bitte wählen Sie einen Steuersatz.')
      .refine(
        (v) => TAX_RATE_OPTIONS.some((option) => option.value === v),
        'Bitte wählen Sie einen der hinterlegten Steuersätze.',
      ),
  )

export const productSchema = z
  .object({
    // 1. Grunddaten
    name: trimmedString(2, 160, 'Der Produktname'),
    subtitle: optionalString(200, 'Der Untertitel'),
    shortDescription: optionalString(400, 'Die Kurzbeschreibung'),
    description: trimmedString(20, 20_000, 'Die Beschreibung'),
    categoryId: z
      .string({ required_error: 'Bitte wählen Sie eine Kategorie.' })
      .transform((v) => v.trim())
      .pipe(
        z
          .string()
          .min(1, 'Bitte wählen Sie eine Kategorie.')
          .max(40, 'Die gewählte Kategorie ist ungültig.'),
      ),
    slug: z
      .string({ required_error: 'Der URL-Pfad ist erforderlich.' })
      .transform((v) => v.trim().toLowerCase())
      .pipe(slugSchema),
    sku: identifierSchema('Die SKU', 3, 48),
    articleNumber: identifierSchema('Die Artikelnummer', 3, 48),

    // 2. Preis
    priceCents: emptyIfMissing(priceFromInput('Der Preis')),
    salePriceCents: optionalPriceFromInput('Der Angebotspreis'),
    saleStartsAt: optionalDateFromInput('Der Beginn des Aktionszeitraums'),
    saleEndsAt: optionalDateFromInput('Das Ende des Aktionszeitraums'),
    /** Id der Aktion, die dieses Formular gerade pflegt (leer = neue Aktion). */
    promotionId: optionalString(40, 'Die Aktion'),
    taxRateBp: emptyIfMissing(taxRateSchema),
    baseUnit: optionalEnum(BASE_UNITS, 'Bitte wählen Sie eine gültige Grundpreiseinheit.'),
    baseUnitAmount: optionalIntFromInput(1, 1_000_000, 'Der Inhalt'),
    baseUnitReference: optionalIntFromInput(1, 1_000_000, 'Die Referenzmenge'),

    // 3. Logistik
    weightGrams: optionalIntFromInput(0, 500_000, 'Das Gewicht'),
    shippingWeightGrams: optionalIntFromInput(0, 500_000, 'Das Versandgewicht'),
    packagingUnit: emptyIfMissing(intFromInput(1, 100_000, 'Die Verpackungsmenge')),
    lengthMm: optionalIntFromInput(0, 10_000, 'Die Länge'),
    deliveryDaysMin: emptyIfMissing(intFromInput(0, 120, 'Die kürzeste Lieferzeit')),
    deliveryDaysMax: emptyIfMissing(intFromInput(0, 180, 'Die längste Lieferzeit')),

    // 4. Eigenschaften
    material: optionalEnum(MATERIALS, 'Bitte wählen Sie einen hinterlegten Werkstoff.'),
    usage: optionalString(120, 'Die Verwendung'),
    tipFinish: optionalString(120, 'Die Spitzenausführung'),

    // 5. Lager
    stock: emptyIfMissing(intFromInput(0, 1_000_000, 'Der Bestand')),
    lowStockThreshold: emptyIfMissing(intFromInput(0, 100_000, 'Die Meldegrenze')),
    allowBackorder: flagSchema,

    // 6. Sichtbarkeit
    active: flagSchema,
    visible: flagSchema,
    bestseller: flagSchema,
    sortOrder: emptyIfMissing(intFromInput(-9_999, 9_999, 'Die Sortierung')),

    // 7. SEO
    metaTitle: optionalString(SEO_LIMITS.metaTitle.max, 'Der Meta-Titel'),
    metaDescription: optionalString(SEO_LIMITS.metaDescription.max, 'Die Meta-Beschreibung'),
  })
  .superRefine((data, ctx) => {
    if (data.deliveryDaysMax < data.deliveryDaysMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryDaysMax'],
        message: 'Die längste Lieferzeit darf nicht kleiner als die kürzeste sein.',
      })
    }

    // Ein Angebotspreis ohne Zeitraum liefe unbefristet — das ist nie gewollt.
    if (data.salePriceCents !== null) {
      if (data.salePriceCents >= data.priceCents) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['salePriceCents'],
          message: 'Der Angebotspreis muss unter dem regulären Preis liegen.',
        })
      }
      if (data.saleStartsAt === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['saleStartsAt'],
          message: 'Bitte geben Sie an, ab wann das Angebot gilt.',
        })
      }
      if (data.saleEndsAt === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['saleEndsAt'],
          message: 'Bitte geben Sie an, bis wann das Angebot gilt.',
        })
      }
      if (data.saleStartsAt && data.saleEndsAt && data.saleEndsAt <= data.saleStartsAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['saleEndsAt'],
          message: 'Das Ende des Aktionszeitraums muss nach dem Beginn liegen.',
        })
      }
    } else if (data.saleStartsAt !== null || data.saleEndsAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['salePriceCents'],
        message: 'Bitte geben Sie einen Angebotspreis an oder entfernen Sie den Zeitraum.',
      })
    }

    // Grundpreisangabe ist nur vollstaendig verwertbar (PAngV).
    if (data.baseUnit !== null) {
      if (data.baseUnitAmount === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['baseUnitAmount'],
          message: 'Bitte geben Sie den Inhalt an, sonst lässt sich kein Grundpreis berechnen.',
        })
      }
      if (data.baseUnitReference === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['baseUnitReference'],
          message: 'Bitte geben Sie die Referenzmenge an, z. B. 1000 für „je 1 kg“.',
        })
      }
    } else if (data.baseUnitAmount !== null || data.baseUnitReference !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUnit'],
        message: 'Bitte wählen Sie eine Einheit oder leeren Sie Inhalt und Referenzmenge.',
      })
    }

    if (data.shippingWeightGrams !== null && data.weightGrams !== null && data.shippingWeightGrams < data.weightGrams) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shippingWeightGrams'],
        message: 'Das Versandgewicht kann nicht unter dem Produktgewicht liegen.',
      })
    }
  })

export type ProductInput = z.infer<typeof productSchema>

/** Schnellschalter aus der Liste: nur die Aktivierung wird umgestellt. */
export const productVisibilitySchema = z.object({
  intent: z.literal('visibility'),
  active: z.boolean(),
})

/**
 * Uebernimmt die Formularfelder in die Spalten der Produkttabelle.
 * Felder, die dieses Formular nicht pflegt (Typ, Beliebtheit, Reservierungen,
 * Zusatzmasse), bleiben bewusst unberuehrt.
 */
export function productRecordFromInput(input: ProductInput) {
  return {
    name: input.name,
    subtitle: input.subtitle ?? null,
    shortDescription: input.shortDescription ?? null,
    description: input.description,
    categoryId: input.categoryId,
    slug: input.slug,
    sku: input.sku,
    articleNumber: input.articleNumber,
    priceCents: input.priceCents,
    taxRateBp: input.taxRateBp,
    baseUnit: input.baseUnit,
    baseUnitAmount: input.baseUnitAmount,
    baseUnitReference: input.baseUnitReference,
    weightGrams: input.weightGrams,
    shippingWeightGrams: input.shippingWeightGrams,
    packagingUnit: input.packagingUnit,
    lengthMm: input.lengthMm,
    deliveryDaysMin: input.deliveryDaysMin,
    deliveryDaysMax: input.deliveryDaysMax,
    material: input.material,
    usage: input.usage ?? null,
    tipFinish: input.tipFinish ?? null,
    stock: input.stock,
    lowStockThreshold: input.lowStockThreshold,
    allowBackorder: input.allowBackorder,
    active: input.active,
    visible: input.visible,
    bestseller: input.bestseller,
    sortOrder: input.sortOrder,
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
  }
}

/** Umkehrung von `priceFromInput`: 1990 -> "19,90" (ganzzahlig gerechnet). */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, '0')}`
}

/** Datum fuer ein `datetime-local`-Feld in Ortszeit, z. B. "2026-09-01T08:30". */
export function toDateTimeLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}
