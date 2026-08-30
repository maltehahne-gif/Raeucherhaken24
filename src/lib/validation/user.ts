import { z } from 'zod'
import { emailSchema } from '@/lib/validation/common'

/**
 * Validierung der Mitarbeiterkonten.
 *
 * Die Feldnamen entsprechen exakt den Namen im Formular
 * (src/components/admin/user-form.tsx), damit jede Zod-Meldung ueber
 * `zodErrorResponse` ohne Uebersetzungsschicht an dem Feld landet, das sie
 * verursacht hat.
 *
 * Die Datei bleibt frei von Datenbank- und Server-Importen: Formular und API
 * bewerten ein Passwort mit derselben Funktion, damit der angezeigte
 * Staerkehinweis und die serverseitige Annahme niemals auseinanderlaufen.
 */

/** Untergrenze fuer neue Passwoerter. Gilt im Formular wie in der API. */
export const PASSWORD_MIN_LENGTH = 12
/** Obergrenze: scrypt rechnet ueber die gesamte Eingabe, das begrenzt den Aufwand. */
export const PASSWORD_MAX_LENGTH = 200
/** Ab dieser Bewertung wird ein Passwort angenommen (siehe assessPassword). */
export const PASSWORD_MIN_SCORE = 2

export const PASSWORD_STRENGTH_LABELS = [
  'Sehr schwach',
  'Schwach',
  'Ausreichend',
  'Stark',
  'Sehr stark',
] as const

export interface PasswordAssessment {
  /** 0 (sehr schwach) bis 4 (sehr stark). */
  score: number
  label: string
  /** Konkrete, umsetzbare Hinweise — leer, wenn nichts zu verbessern ist. */
  hints: string[]
  /** Erfuellt die Mindestanforderung des Servers. */
  acceptable: boolean
}

const CHARACTER_CLASSES: RegExp[] = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u]

/**
 * Bewertet ein Passwort nach Laenge und Zeichenvielfalt.
 *
 * Bewusst ohne Wortlisten: Laenge schlaegt Komplexitaet. Eine lange Wortfolge
 * erreicht deshalb ohne Sonderzeichen dieselbe Bewertung wie ein kurzes
 * Passwort mit vier Zeichenarten — das ist merkbarer und in der Praxis
 * widerstandsfaehiger.
 */
export function assessPassword(password: string): PasswordAssessment {
  const value = password.normalize('NFKC')
  const characters = [...value]
  const length = characters.length
  const classes = CHARACTER_CLASSES.filter((pattern) => pattern.test(value)).length
  const distinct = new Set(characters).size

  const hints: string[] = []

  if (length === 0) {
    return { score: 0, label: PASSWORD_STRENGTH_LABELS[0], hints: [], acceptable: false }
  }

  if (length < PASSWORD_MIN_LENGTH) {
    return {
      score: 0,
      label: PASSWORD_STRENGTH_LABELS[0],
      hints: [`Mindestens ${PASSWORD_MIN_LENGTH} Zeichen verwenden.`],
      acceptable: false,
    }
  }

  const lengthPoints = length >= 24 ? 3 : length >= 18 ? 2 : length >= 14 ? 1 : 0
  const classPoints = classes >= 4 ? 2 : classes >= 2 ? 1 : 0
  let score = Math.min(4, lengthPoints + classPoints)

  // Wenige verschiedene Zeichen ("aaaaaaaaaaaa") sind trotz Laenge schwach.
  if (distinct < 6) {
    score = Math.min(score, 1)
    hints.push('Mehr unterschiedliche Zeichen verwenden.')
  }

  if (score < PASSWORD_MIN_SCORE) {
    hints.push(
      classes < 2
        ? 'Groß- und Kleinschreibung, Ziffern oder Sonderzeichen mischen — oder mindestens 18 Zeichen verwenden.'
        : 'Das Passwort verlängern oder eine weitere Zeichenart ergänzen.',
    )
  } else if (score < 4) {
    hints.push('Eine Folge aus mehreren Wörtern ist leichter zu merken und schwerer zu erraten.')
  }

  return {
    score,
    label: PASSWORD_STRENGTH_LABELS[score],
    hints,
    acceptable: score >= PASSWORD_MIN_SCORE,
  }
}

// ---------------------------------------------------------------------------
// Formularschema
// ---------------------------------------------------------------------------

/** Fehlende Werte wie ein leeres Feld behandeln, damit die deutsche Meldung greift. */
const asText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

const flagSchema = z
  .union([z.boolean(), z.string(), z.null(), z.undefined()])
  .transform((v) => v === true || v === 'on' || v === 'true')

const nameSchema = (label: string) =>
  z.preprocess(
    asText,
    z
      .string()
      .transform((v) => v.trim().replace(/\s+/g, ' '))
      .pipe(
        z
          .string()
          .min(1, `${label} ist erforderlich.`)
          .max(60, `${label} darf höchstens 60 Zeichen haben.`),
      ),
  )

const roleIdSchema = z.preprocess(
  asText,
  z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, 'Bitte wählen Sie eine Rolle.')
        .max(64, 'Die gewählte Rolle ist ungültig.'),
    ),
)

const passwordFieldSchema = z.preprocess(
  asText,
  z.string().max(PASSWORD_MAX_LENGTH, `Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen haben.`),
)

/**
 * Prueft Passwort und Bestaetigung.
 *
 * Beim Bearbeiten sind beide Felder optional: bleiben sie leer, behaelt das
 * Konto sein bisheriges Passwort. Sobald eines der beiden befuellt ist, gelten
 * dieselben Anforderungen wie bei der Neuanlage.
 */
function refinePassword(
  password: string,
  confirmation: string,
  required: boolean,
  ctx: z.RefinementCtx,
): void {
  if (!required && password.length === 0 && confirmation.length === 0) return

  if (password.length < PASSWORD_MIN_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen haben.`,
    })
    return
  }

  const assessment = assessPassword(password)
  if (!assessment.acceptable) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: `Das Passwort ist zu leicht zu erraten (${assessment.label}). ${assessment.hints[0] ?? ''}`.trim(),
    })
  }

  if (confirmation !== password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['passwordConfirm'],
      message: 'Die beiden Passwörter stimmen nicht überein.',
    })
  }
}

const userFieldsSchema = z.object({
  firstName: nameSchema('Der Vorname'),
  lastName: nameSchema('Der Nachname'),
  email: z.preprocess(asText, emailSchema),
  roleId: roleIdSchema,
  active: flagSchema,
  password: passwordFieldSchema,
  passwordConfirm: passwordFieldSchema,
})

/** Neuanlage: ein Passwort ist Pflicht, sonst hätte das Konto keinen Zugang. */
export const userCreateSchema = userFieldsSchema.superRefine((data, ctx) => {
  refinePassword(data.password, data.passwordConfirm, true, ctx)
})

/** Bearbeitung: das Passwort wird nur gesetzt, wenn das Feld befüllt ist. */
export const userUpdateSchema = userFieldsSchema.superRefine((data, ctx) => {
  refinePassword(data.password, data.passwordConfirm, false, ctx)
})

export type UserInput = z.infer<typeof userCreateSchema>

/** Schnellschalter aus der Liste: nur die Aktivierung wird umgestellt. */
export const userActivationSchema = z.object({
  intent: z.literal('activation'),
  active: z.boolean(),
})

/** Erzwungene Abmeldung eines Kontos an allen Geräten. */
export const userSessionRevokeSchema = z.object({
  intent: z.literal('sessions'),
})
