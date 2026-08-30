import { z } from 'zod'
import {
  consentSchema,
  emailSchema,
  honeypotSchema,
  optionalIntFromInput,
  optionalString,
  phoneSchema,
  trimmedString,
} from '@/lib/validation/common'

/**
 * Anfrage für eine Sonderanfertigung.
 *
 * Technische Maße sind optional — wer noch keine Zeichnung hat, soll trotzdem
 * anfragen können. Was angegeben wird, muss aber plausibel sein: Ein Haken mit
 * 12 Metern Länge ist ein Tippfehler, keine Anforderung.
 */
export const projectSchema = z.object({
  projectName: trimmedString(3, 120, 'Der Projektname'),

  contactName: trimmedString(2, 120, 'Ihr Name'),
  company: optionalString(120, 'Der Firmenname'),
  email: emailSchema,
  phone: phoneSchema,

  foodType: trimmedString(2, 120, 'Das Lebensmittel bzw. die Anwendung'),
  purpose: trimmedString(3, 200, 'Der Einsatzzweck'),
  targetLoadGrams: optionalIntFromInput(0, 500_000, 'Die gewünschte Belastung'),
  goalDescription: trimmedString(20, 3000, 'Die Zielbeschreibung'),

  totalLengthMm: optionalIntFromInput(10, 3_000, 'Die Gesamtlänge'),
  /** In Zehntelmillimetern, damit 1,2 mm exakt abbildbar ist. */
  wireDiameterTenthMm: optionalIntFromInput(5, 300, 'Der Drahtdurchmesser'),
  prongCount: optionalIntFromInput(1, 24, 'Die Anzahl der Dornen'),
  prongLengthMm: optionalIntFromInput(5, 1_000, 'Die Dornenlänge'),
  openingWidthMm: optionalIntFromInput(1, 1_000, 'Das Öffnungsmaß'),
  shape: optionalString(120, 'Die Form'),
  additionalDimensions: optionalString(1000, 'Die weiteren Maße'),

  material: z.enum(['VA', 'V2A', 'V4A'], {
    errorMap: () => ({ message: 'Bitte wählen Sie einen Werkstoff.' }),
  }),
  tipFinish: optionalString(120, 'Die Spitzenausführung'),
  surface: optionalString(120, 'Der Oberflächenwunsch'),
  quantity: optionalIntFromInput(1, 100_000, 'Die Stückzahl'),

  wantsConsultation: z.boolean().optional().default(false),
  allowCatalogRelease: z.boolean().optional().default(false),
  specConfirmed: consentSchema(
    'Bitte bestätigen Sie, dass Ihre technischen Angaben nach bestem Wissen zutreffen.',
  ),
  privacy: consentSchema('Bitte stimmen Sie der Datenschutzerklärung zu.'),

  website: honeypotSchema,
})

export type ProjectInput = z.infer<typeof projectSchema>

/** Erlaubte Dateitypen und Grenzen für Anhänge. */
export const UPLOAD_LIMITS = {
  maxFiles: 5,
  maxBytesPerFile: 8 * 1024 * 1024,
  maxBytesTotal: 24 * 1024 * 1024,
  /** MIME-Typen, die wir annehmen — zusätzlich wird der Inhalt geprüft. */
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ] as const,
  allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'] as const,
} as const
