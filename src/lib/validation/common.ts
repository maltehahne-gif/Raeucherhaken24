import { z } from 'zod'

/**
 * Wiederverwendbare Bausteine fuer Formular- und API-Validierung.
 * Alle Meldungen sind deutsch und koennen direkt am Feld angezeigt werden.
 */

export const trimmedString = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} ist erforderlich.`, invalid_type_error: `${label} ist ungültig.` })
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(min, min === 1 ? `${label} ist erforderlich.` : `${label} muss mindestens ${min} Zeichen haben.`)
        .max(max, `${label} darf höchstens ${max} Zeichen haben.`),
    )

export const optionalString = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} darf höchstens ${max} Zeichen haben.`)
    .transform((v) => v.trim())
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()

export const emailSchema = z
  .string({ required_error: 'Bitte geben Sie Ihre E-Mail-Adresse an.' })
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(5, 'Bitte geben Sie eine gültige E-Mail-Adresse an.')
      .max(160, 'Die E-Mail-Adresse ist zu lang.')
      .email('Bitte geben Sie eine gültige E-Mail-Adresse an.'),
  )

/** Deutsche Postleitzahl: genau fuenf Ziffern. */
export const postalCodeSchema = z
  .string({ required_error: 'Bitte geben Sie eine Postleitzahl an.' })
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^\d{5}$/, 'Bitte geben Sie eine gültige fünfstellige Postleitzahl an.'))

/** Telefonnummer: bewusst tolerant, aber gegen Missbrauch begrenzt. */
export const phoneSchema = z
  .string()
  .transform((v) => v.trim())
  .refine(
    (v) => v.length === 0 || (/^[+0-9()\/\s.-]{6,32}$/.test(v) && (v.match(/\d/g) ?? []).length >= 6),
    'Bitte geben Sie eine gültige Telefonnummer an.',
  )
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional()

export const slugSchema = z
  .string()
  .min(1, 'Der URL-Pfad ist erforderlich.')
  .max(96, 'Der URL-Pfad ist zu lang.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Nur Kleinbuchstaben, Ziffern und Bindestriche sind erlaubt.')

/** Positive Ganzzahl aus Formulardaten (kommt als String an). */
export const intFromInput = (min: number, max: number, label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v : Number.parseInt(v.trim().replace(/\./g, ''), 10)))
    .pipe(
      z
        .number({ invalid_type_error: `${label} muss eine Zahl sein.` })
        .int(`${label} muss eine ganze Zahl sein.`)
        .min(min, `${label} muss mindestens ${min} betragen.`)
        .max(max, `${label} darf höchstens ${max} betragen.`),
    )

export const optionalIntFromInput = (min: number, max: number, label: string) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'number') return v
      const trimmed = v.trim()
      if (trimmed.length === 0) return null
      return Number.parseInt(trimmed.replace(/\./g, ''), 10)
    })
    .pipe(
      z
        .number()
        .int(`${label} muss eine ganze Zahl sein.`)
        .min(min, `${label} muss mindestens ${min} betragen.`)
        .max(max, `${label} darf höchstens ${max} betragen.`)
        .nullable(),
    )

/** Preiseingabe "19,90" -> 1990 Cent. */
export const priceFromInput = (label = 'Der Preis') =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      if (typeof v === 'number') return Math.round(v * 100)
      const normalized = v.trim().replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.')
      if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} ist ungültig (Beispiel: 19,90).` })
        return z.NEVER
      }
      return Math.round(Number.parseFloat(normalized) * 100)
    })
    .pipe(
      z
        .number()
        .int()
        .min(0, `${label} darf nicht negativ sein.`)
        .max(9_999_999, `${label} ist unrealistisch hoch.`),
    )

/** Checkbox-Zustimmung, die zwingend gesetzt sein muss. */
export const consentSchema = (message: string) =>
  z
    .union([z.boolean(), z.literal('on'), z.literal('true'), z.literal('')])
    .transform((v) => v === true || v === 'on' || v === 'true')
    .refine((v) => v, message)

/**
 * Honeypot-Feld: von Menschen nie ausgefuellt, von einfachen Bots dagegen oft.
 * Ist es befuellt, wird die Anfrage als Spam behandelt.
 */
export const honeypotSchema = z
  .string()
  .max(0, 'Ihre Anfrage konnte nicht verarbeitet werden.')
  .optional()
  .or(z.literal('').optional())

/** Seiten- und Sortierparameter aus der URL. */
export const pageSchema = z
  .union([z.string(), z.number(), z.undefined()])
  .transform((v) => {
    if (v === undefined) return 1
    const n = typeof v === 'number' ? v : Number.parseInt(v, 10)
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 500) : 1
  })

export const couponCodeSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase().replace(/\s+/g, ''))
  .pipe(
    z
      .string()
      .min(3, 'Bitte geben Sie einen gültigen Gutscheincode an.')
      .max(40, 'Der Gutscheincode ist zu lang.')
      .regex(/^[A-Z0-9_-]+$/, 'Der Gutscheincode enthält ungültige Zeichen.'),
  )
