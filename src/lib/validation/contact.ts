import { z } from 'zod'
import {
  consentSchema,
  emailSchema,
  honeypotSchema,
  optionalString,
  phoneSchema,
  trimmedString,
} from '@/lib/validation/common'
import { SUPPORT_TOPICS } from '@/lib/domain/enums'

export const contactSchema = z.object({
  name: trimmedString(2, 120, 'Ihr Name'),
  email: emailSchema,
  phone: phoneSchema,
  company: optionalString(120, 'Der Firmenname'),
  topic: z.enum(SUPPORT_TOPICS, { errorMap: () => ({ message: 'Bitte wählen Sie ein Anliegen.' }) }),
  orderNumber: optionalString(40, 'Die Bestellnummer'),
  subject: trimmedString(4, 160, 'Der Betreff'),
  message: trimmedString(20, 4000, 'Ihre Nachricht'),
  privacy: consentSchema('Bitte stimmen Sie der Datenschutzerklärung zu.'),
  website: honeypotSchema,
})

export type ContactInput = z.infer<typeof contactSchema>
