import { z } from 'zod'
import {
  consentSchema,
  couponCodeSchema,
  emailSchema,
  honeypotSchema,
  optionalString,
  phoneSchema,
  postalCodeSchema,
  trimmedString,
} from '@/lib/validation/common'

/** Kontakt- und Lieferdaten des Checkouts. */
export const checkoutSchema = z.object({
  firstName: trimmedString(2, 60, 'Der Vorname'),
  lastName: trimmedString(2, 60, 'Der Nachname'),
  company: optionalString(120, 'Der Firmenname'),
  email: emailSchema,
  phone: phoneSchema,
  street: trimmedString(4, 140, 'Straße und Hausnummer'),
  postalCode: postalCodeSchema,
  city: trimmedString(2, 80, 'Der Ort'),
  note: optionalString(1000, 'Der Bestellhinweis'),
  couponCode: couponCodeSchema.nullable().optional(),
  terms: consentSchema('Bitte stimmen Sie den AGB und der Widerrufsbelehrung zu.'),
  privacy: consentSchema('Bitte stimmen Sie der Datenschutzerklärung zu.'),
  /** Spamfalle — muss leer bleiben. */
  website: honeypotSchema,
  /** Verhindert Doppelbestellungen bei Mehrfachklick. */
  idempotencyKey: z
    .string()
    .min(16, 'Die Anfrage konnte nicht zugeordnet werden. Bitte laden Sie die Seite neu.')
    .max(80),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>

/** Warenkorb-Operationen. */
export const addToCartSchema = z.object({
  productId: z.string().min(1, 'Produkt nicht gefunden.'),
  variantId: z.string().min(1).nullable().optional(),
  quantity: z
    .number({ invalid_type_error: 'Bitte geben Sie eine gültige Menge an.' })
    .int('Die Menge muss eine ganze Zahl sein.')
    .min(1, 'Bitte wählen Sie mindestens 1 Stück.')
    .max(999, 'Pro Position sind maximal 999 Stück möglich.'),
  /** Konfigurator-Auswahl: Gruppenschlüssel -> Optionsschlüssel */
  configuration: z.record(z.string().max(60), z.string().max(60)).nullable().optional(),
})

export const updateCartItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(0).max(999),
})

export const applyCouponSchema = z.object({
  code: couponCodeSchema,
})
