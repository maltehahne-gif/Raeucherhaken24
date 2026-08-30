'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Star } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FormError, FormHint, Input, Textarea } from '@/components/ui/field'
import { RatingInput } from '@/components/ui/rating'
import { useToast } from '@/components/ui/toast'

/**
 * Bewertung eines Rezeptes.
 *
 * Je Besucher zaehlt genau eine Bewertung; der Server erkennt ihn ueber ein
 * eigenes HttpOnly-Cookie. Eine bereits abgegebene Bewertung wird beim Laden
 * geholt und im Formular vorbelegt — dadurch ist sofort sichtbar, dass eine
 * erneute Abgabe die bisherige ersetzt und keine zweite Stimme erzeugt.
 *
 * Der Durchschnitt steht bewusst nur einmal auf der Seite, naemlich im Kopf
 * des Rezeptes. Nach dem Speichern wird die Seite neu angefordert, damit dort
 * kein ueberholter Wert stehen bleibt.
 */

const MAX_COMMENT = 1_000
const MAX_NAME = 60

interface OwnRating {
  stars: number
  comment: string | null
  authorName: string | null
}

interface RatingState {
  average: number | null
  count: number
  own: OwnRating | null
}

interface RatingResponse extends RatingState {
  message: string
}

export function RecipeRating({ slug }: { slug: string }) {
  const router = useRouter()
  const toast = useToast()

  const [stars, setStars] = useState(0)
  const [hasOwnRating, setHasOwnRating] = useState(false)
  const [comment, setComment] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [website, setWebsite] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  /*
   * Die eigene Bewertung haengt am HttpOnly-Cookie. Sie serverseitig zu
   * rendern wuerde bedeuten, die Rezeptseite fuer jeden Besucher einzeln
   * aufzubauen — deshalb wird sie hier nachgeladen.
   */
  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      const result = await apiRequest<RatingState>(`/api/rezepte/${encodeURIComponent(slug)}/bewertung`, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return

      if (result.ok && result.data.own) {
        setStars(result.data.own.stars)
        setHasOwnRating(true)
        setComment(result.data.own.comment ?? '')
        setAuthorName(result.data.own.authorName ?? '')
      }
      // Ein Fehler beim Nachladen bleibt ohne Meldung: Das Formular ist auch
      // ohne vorbelegte Werte vollstaendig bedienbar.
      setLoading(false)
    }

    void load()
    return () => controller.abort()
  }, [slug])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setConfirmation(null)

    if (stars < 1) {
      setErrors({ stars: 'Bitte wählen Sie zwischen einem und fünf Sternen.' })
      return
    }

    setErrors({})
    setSaving(true)

    const result = await apiRequest<RatingResponse>(`/api/rezepte/${encodeURIComponent(slug)}/bewertung`, {
      method: 'POST',
      body: { stars, comment: comment.trim(), authorName: authorName.trim(), website },
    })

    setSaving(false)

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      setFormError(result.error)
      toast.error('Die Bewertung wurde nicht gespeichert', result.error)
      return
    }

    // Die Antwort des Servers ist massgeblich und ueberschreibt die Eingabe.
    setHasOwnRating(true)
    setStars(result.data.own?.stars ?? stars)
    setComment(result.data.own?.comment ?? '')
    setAuthorName(result.data.own?.authorName ?? '')
    setConfirmation(result.data.message)
    toast.success(result.data.message)

    // Durchschnitt und Erfahrungsberichte stammen vom Server — neu anfordern,
    // damit dort nicht der alte Stand stehen bleibt.
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle as="h2">Rezept bewerten</CardTitle>
          <CardDescription>
            {hasOwnRating
              ? 'Sie haben dieses Rezept bereits bewertet. Eine erneute Abgabe ersetzt Ihre bisherige Bewertung.'
              : 'Ihre Bewertung hilft anderen bei der Auswahl. Eine Anmeldung ist dafür nicht nötig.'}
          </CardDescription>
        </div>
      </CardHeader>

      <CardBody>
        <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
          {formError && <FormError>{formError}</FormError>}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">
              Ihre Bewertung
              <span className="ml-0.5 text-[var(--accent)]" aria-hidden="true">
                *
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <RatingInput
                name="rezept-sterne"
                value={stars}
                onChange={(value) => {
                  setStars(value)
                  setErrors((current) => ({ ...current, stars: '' }))
                }}
                disabled={loading || saving}
              />
              <span className="tabular text-sm text-ink-muted">
                {stars > 0 ? `${stars} von 5 Sternen` : 'Noch keine Auswahl'}
              </span>
            </div>
            {errors.stars && (
              <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-danger-700">
                <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>{errors.stars}</span>
              </p>
            )}
          </div>

          <Field
            label="Ihre Erfahrung"
            hint="Optional"
            error={errors.comment}
            description="Erscheint öffentlich unter dem Rezept. Was hat gut funktioniert, was würden Sie anders machen?"
          >
            <Textarea
              value={comment}
              maxLength={MAX_COMMENT}
              rows={4}
              disabled={loading || saving}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Zum Beispiel Räucherdauer, Holzart oder Anpassungen an der Lake"
            />
          </Field>

          <Field
            label="Name"
            hint="Optional"
            error={errors.authorName}
            description="Wird neben Ihrer Erfahrung angezeigt. Ohne Angabe bleibt die Bewertung anonym."
          >
            <Input
              value={authorName}
              maxLength={MAX_NAME}
              autoComplete="nickname"
              disabled={loading || saving}
              onChange={(event) => setAuthorName(event.target.value)}
              placeholder="z. B. Martin K."
            />
          </Field>

          {/* Honigtopf: von Menschen nie ausgefuellt, von einfachen Bots oft. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website-rezept">Bitte nicht ausfüllen</label>
            <input
              id="website-rezept"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <FormHint className="max-w-md">
              Wir speichern zu Ihrer Bewertung weder E-Mail-Adresse noch IP-Adresse. Damit jede Person nur
              einmal zählt, legen wir ein technisches Cookie an.
            </FormHint>
            <Button type="submit" loading={saving} disabled={loading}>
              <Star className="size-4" aria-hidden="true" />
              {hasOwnRating ? 'Bewertung aktualisieren' : 'Bewertung abgeben'}
            </Button>
          </div>

          <p aria-live="polite" className="text-sm font-medium text-success-700">
            {confirmation}
          </p>
        </form>
      </CardBody>
    </Card>
  )
}
