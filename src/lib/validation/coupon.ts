import { z } from 'zod'
import type { BadgeTone } from '@/components/ui/badge'
import { COUPON_TYPES, type CouponType } from '@/lib/domain/enums'
import { formatPrice, parsePriceToCents } from '@/lib/money'
import { formatDate } from '@/lib/utils/text'
import { optionalString } from '@/lib/validation/common'

/**
 * Validierung und Beschreibung von Gutscheinen.
 *
 * Die Feldnamen entsprechen exakt den Namen im Formular, damit jede
 * Zod-Meldung ueber `zodErrorResponse` ohne Uebersetzungsschicht an dem Feld
 * landet, das sie verursacht hat.
 *
 * Die Datei bleibt frei von Datenbank- und Server-Importen: Formular,
 * Listenansicht und API rechnen mit denselben Funktionen, damit Vorschau und
 * gespeicherter Wert niemals auseinanderlaufen koennen.
 *
 * Einheiten: Prozentrabatte liegen als Basispunkte in der Spalte `value`
 * (1000 = 10,00 %), Festbetraege als ganzzahlige Cent.
 */

/** Groesster zulaessiger Prozentrabatt: 100,00 %. */
const MAX_PERCENT_BP = 10_000
/** Groesster zulaessiger Geldbetrag: 99.999,99 €. */
const MAX_MONEY_CENTS = 9_999_999

// ---------------------------------------------------------------------------
// Umrechnung zwischen Eingabefeld und Speicherwert
// ---------------------------------------------------------------------------

/** Prozenteingabe "10" bzw. "10,5" -> Basispunkte (1000 / 1050). */
export function parsePercentToBp(input: string): number | null {
  const normalized = input.trim().replace(/\s|%/g, '').replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null
  const bp = Math.round(Number.parseFloat(normalized) * 100)
  return bp >= 0 && bp <= MAX_PERCENT_BP ? bp : null
}

/** Umkehrung von `parsePercentToBp`: 1000 -> "10", 1050 -> "10,5". */
export function bpToPercentInput(bp: number): string {
  const percent = bp / 100
  return Number.isInteger(percent)
    ? String(percent)
    : String(percent).replace('.', ',')
}

/** Cent -> Eingabefeld: 1990 -> "19,90". Ganzzahlig gerechnet. */
export function centsToInput(cents: number): string {
  const absolute = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, '0')}`
}

const percentFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

/** Prozentangabe aus Basispunkten fuer die Anzeige: 1050 -> "10,5 %". */
export function formatPercentBp(bp: number): string {
  return `${percentFormatter.format(bp / 100)} %`
}

/** Der gespeicherte Wert eines Gutscheins, lesbar formatiert. */
export function formatCouponValue(type: CouponType, value: number): string {
  switch (type) {
    case 'percent':
      return formatPercentBp(value)
    case 'fixed':
      return formatPrice(value)
    case 'free_shipping':
      return 'Versandkosten'
  }
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

export const COUPON_STATES = ['active', 'scheduled', 'expired', 'exhausted', 'disabled'] as const
export type CouponState = (typeof COUPON_STATES)[number]

export const COUPON_STATE_LABELS: Record<CouponState, string> = {
  active: 'Aktiv',
  scheduled: 'Noch nicht gestartet',
  expired: 'Abgelaufen',
  exhausted: 'Ausgeschöpft',
  disabled: 'Deaktiviert',
}

/** Farbgebung der Zustandskennzeichnung. Der Text steht immer daneben. */
export const COUPON_STATE_TONES: Record<CouponState, BadgeTone> = {
  active: 'success',
  scheduled: 'info',
  expired: 'neutral',
  exhausted: 'warning',
  disabled: 'steel',
}

/** Erklaerung des Zustands im Klartext — Farbe allein traegt keine Information. */
export const COUPON_STATE_DESCRIPTIONS: Record<CouponState, string> = {
  active: 'Der Gutschein wird derzeit eingelöst.',
  scheduled: 'Der Gutschein greift erst ab dem hinterlegten Startzeitpunkt.',
  expired: 'Der Gültigkeitszeitraum ist beendet.',
  exhausted: 'Das Nutzungslimit ist erreicht, weitere Einlösungen sind nicht möglich.',
  disabled: 'Der Gutschein ist deaktiviert und wird im Shop abgelehnt.',
}

export interface CouponStateInput {
  active: boolean
  startsAt: Date | null
  endsAt: Date | null
  usageLimit: number
  usageCount: number
}

/**
 * Zustand eines Gutscheins.
 *
 * Die Reihenfolge der Pruefungen entspricht der Reihenfolge, in der die
 * Gutscheinpruefung im Shop (src/lib/server/coupons.ts) ablehnt — die Liste
 * zeigt damit genau den Grund, den auch der Kunde zu sehen bekaeme.
 */
export function couponState(coupon: CouponStateInput, now: Date = new Date()): CouponState {
  if (!coupon.active) return 'disabled'
  if (coupon.startsAt && coupon.startsAt.getTime() > now.getTime()) return 'scheduled'
  if (coupon.endsAt && coupon.endsAt.getTime() <= now.getTime()) return 'expired'
  if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) return 'exhausted'
  return 'active'
}

// ---------------------------------------------------------------------------
// Beschreibung in Worten
// ---------------------------------------------------------------------------

const dayMonthFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })

/** Innerhalb des laufenden Jahres genuegt "31.12.", sonst mit Jahreszahl. */
function shortDate(date: Date, now: Date): string {
  return date.getFullYear() === now.getFullYear() ? dayMonthFormatter.format(date) : formatDate(date)
}

export interface CouponDescriptionInput {
  type: CouponType
  value: number
  minOrderValueCents: number
  maxDiscountCents: number
  startsAt: Date | null
  endsAt: Date | null
}

/**
 * Fasst die Regeln eines Gutscheins in einem Satz zusammen, z. B.
 * „10 % Rabatt ab 40,00 € Warenwert, höchstens 30,00 €, gültig bis 31.12.“
 */
export function describeCouponInWords(input: CouponDescriptionInput, now: Date = new Date()): string {
  const parts: string[] = []

  switch (input.type) {
    case 'percent':
      parts.push(`${formatPercentBp(input.value)} Rabatt`)
      break
    case 'fixed':
      parts.push(`${formatPrice(input.value)} Rabatt`)
      break
    case 'free_shipping':
      parts.push('Versandkostenfrei')
      break
  }

  if (input.minOrderValueCents > 0) {
    parts.push(`ab ${formatPrice(input.minOrderValueCents)} Warenwert`)
  }

  let text = parts.join(' ')

  if (input.type === 'percent' && input.maxDiscountCents > 0) {
    text += `, höchstens ${formatPrice(input.maxDiscountCents)}`
  }

  const starts = input.startsAt
  const ends = input.endsAt
  if (starts && ends) {
    text += `, gültig vom ${shortDate(starts, now)} bis ${shortDate(ends, now)}`
  } else if (starts) {
    text += `, gültig ab ${shortDate(starts, now)}`
  } else if (ends) {
    text += `, gültig bis ${shortDate(ends, now)}`
  } else {
    text += ', ohne Befristung'
  }

  return text.endsWith('.') ? text : `${text}.`
}

// ---------------------------------------------------------------------------
// Formularschema
// ---------------------------------------------------------------------------

/** Fehlende Werte wie ein leeres Feld behandeln, damit die deutsche Meldung greift. */
const asText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

const codeSchema = z.preprocess(
  asText,
  z
    .string()
    .transform((v) => v.trim().toUpperCase().replace(/\s+/g, ''))
    .pipe(
      z
        .string()
        .min(3, 'Der Gutscheincode muss mindestens 3 Zeichen haben.')
        .max(40, 'Der Gutscheincode darf höchstens 40 Zeichen haben.')
        .regex(
          /^[A-Z0-9_-]+$/,
          'Erlaubt sind Buchstaben, Ziffern, Bindestrich und Unterstrich — keine Leerzeichen.',
        ),
    ),
)

/** Geldbetrag aus einem Eingabefeld; leer bedeutet 0 (= keine Schwelle). */
const moneyFromInput = (label: string) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v, ctx) => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'number') return Math.round(v * 100)
      const raw = v.trim()
      if (raw.length === 0) return 0
      const cents = parsePriceToCents(raw)
      if (cents === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} ist ungültig (Beispiel: 40,00).`,
        })
        return z.NEVER
      }
      return cents
    })
    .pipe(
      z
        .number()
        .int()
        .min(0, `${label} darf nicht negativ sein.`)
        .max(MAX_MONEY_CENTS, `${label} ist unrealistisch hoch.`),
    )

/** Stueckzahl aus einem Eingabefeld; leer bedeutet 0 (= unbegrenzt). */
const countFromInput = (max: number, label: string) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'number') return v
      const raw = v.trim().replace(/\./g, '')
      if (raw.length === 0) return 0
      return Number.parseInt(raw, 10)
    })
    .pipe(
      z
        .number({ invalid_type_error: `${label} muss eine Zahl sein.` })
        .int(`${label} muss eine ganze Zahl sein.`)
        .min(0, `${label} darf nicht negativ sein.`)
        .max(max, `${label} darf höchstens ${max} betragen.`),
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

const flagSchema = z
  .union([z.boolean(), z.string(), z.null(), z.undefined()])
  .transform((v) => v === true || v === 'on' || v === 'true')

const couponFieldsSchema = z.object({
  code: codeSchema,
  description: optionalString(200, 'Die Beschreibung'),
  type: z.preprocess(
    asText,
    z.enum(COUPON_TYPES, { errorMap: () => ({ message: 'Bitte wählen Sie eine Gutscheinart.' }) }),
  ),
  /** Rohwert des Eingabefeldes; die Deutung haengt von `type` ab. */
  value: z.preprocess(asText, z.string().max(20, 'Der Wert ist zu lang.')),
  minOrderValueCents: moneyFromInput('Der Mindestbestellwert'),
  maxDiscountCents: moneyFromInput('Der maximale Rabattbetrag'),
  startsAt: optionalDateFromInput('Der Beginn der Gültigkeit'),
  endsAt: optionalDateFromInput('Das Ende der Gültigkeit'),
  usageLimit: countFromInput(1_000_000, 'Das Nutzungslimit'),
  perCustomerLimit: countFromInput(1_000, 'Das Limit je Kunde'),
  active: flagSchema,
})

export const couponSchema = couponFieldsSchema
  .superRefine((data, ctx) => {
    if (data.type === 'percent') {
      const bp = parsePercentToBp(data.value)
      if (bp === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Bitte geben Sie einen Prozentsatz zwischen 0,01 und 100 an (Beispiel: 10).',
        })
      } else if (bp <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Ein Prozentrabatt von 0 % hätte keine Wirkung.',
        })
      }
    }

    if (data.type === 'fixed') {
      const cents = parsePriceToCents(data.value)
      if (cents === null || cents < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Bitte geben Sie einen Betrag an (Beispiel: 5,00).',
        })
      } else if (cents === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Ein Rabatt von 0,00 € hätte keine Wirkung.',
        })
      } else if (cents > MAX_MONEY_CENTS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Der Rabattbetrag ist unrealistisch hoch.',
        })
      }
    }

    if (data.startsAt && data.endsAt && data.endsAt.getTime() <= data.startsAt.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'Das Ende der Gültigkeit muss nach dem Beginn liegen.',
      })
    }

    if (data.usageLimit > 0 && data.perCustomerLimit > data.usageLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['perCustomerLimit'],
        message: 'Das Limit je Kunde kann nicht über dem Nutzungslimit gesamt liegen.',
      })
    }

    if (
      data.type === 'fixed' &&
      data.minOrderValueCents > 0 &&
      (parsePriceToCents(data.value) ?? 0) > data.minOrderValueCents
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minOrderValueCents'],
        message: 'Der Mindestbestellwert liegt unter dem Rabattbetrag — der Warenwert wäre negativ.',
      })
    }
  })
  .transform((data) => {
    // Der Speicherwert entsteht erst hier: Prozent als Basispunkte, Festbetrag
    // als Cent, Versandkostenfreiheit ohne eigenen Wert.
    let value = 0
    if (data.type === 'percent') value = parsePercentToBp(data.value) ?? 0
    if (data.type === 'fixed') value = parsePriceToCents(data.value) ?? 0

    return {
      code: data.code,
      description: data.description ?? null,
      type: data.type,
      value,
      minOrderValueCents: data.minOrderValueCents,
      // Eine Deckelung kennt nur der Prozentrabatt; sonst bleibt sie ohne Wirkung
      // und wird deshalb gar nicht erst gespeichert.
      maxDiscountCents: data.type === 'percent' ? data.maxDiscountCents : 0,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      usageLimit: data.usageLimit,
      perCustomerLimit: data.perCustomerLimit,
      active: data.active,
    }
  })

export type CouponInput = z.infer<typeof couponSchema>

/** Schnellschalter aus der Liste: nur die Aktivierung wird umgestellt. */
export const couponActivationSchema = z.object({
  intent: z.literal('activation'),
  active: z.boolean(),
})
