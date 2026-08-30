'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Info } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { cn } from '@/lib/utils/cn'
import { SEASONAL_THEMES, SEASONAL_THEME_LABELS, type SeasonalThemeKey } from '@/lib/domain/enums'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, FormError, FormHint, Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * Saison- und Bannersteuerung der Storefront.
 *
 * Die Farbfelder und die Vorschau setzen `data-season` auf ein Element und
 * lesen die Farben ueber die Design-Tokens (--accent, --banner-bg …). Damit
 * zeigt die Vorschau genau die Werte aus src/app/globals.css — es gibt keine
 * zweite Farbliste, die veralten koennte.
 *
 * Die Feldnamen entsprechen dem Zod-Schema der API
 * (src/app/api/admin/saison/route.ts), damit Feldmeldungen ihr Feld finden.
 */

export interface SeasonFormValues {
  theme: string
  bannerText: string
  bannerLink: string
  bannerActive: boolean
}

/** Ein Satz je Modus: was sich gegenueber dem Standard aendert. */
const SEASON_EFFECTS: Record<SeasonalThemeKey, string> = {
  normal:
    'Ganzjährige Gestaltung: Glut-Kupfer als Akzent, dunkles Stahlgrau im Hinweisbanner.',
  advent:
    'Warmes Kupferbraun als Akzent, tannengrüner Banner mit Goldton — ruhige Adventsstimmung ohne Deko.',
  nikolaus:
    'Gedecktes Rot als Akzent, dunkelbrauner Banner mit warmem Goldton für die erste Dezemberwoche.',
  weihnachten:
    'Tannengrün als Akzent, sehr dunkler grüner Banner mit Gold — der festlichste der Modi.',
  silvester:
    'Goldocker als Akzent, nachtblauer Banner mit hellem Gold für die Tage zwischen den Jahren.',
  neujahr:
    'Kühles Blaugrau als Akzent, dunkelblauer Banner — sachlicher Jahresauftakt.',
  ostern:
    'Olivgrün als Akzent, dunkelgrüner Banner mit hellem Grün für das Frühjahrsgeschäft.',
  'black-week':
    'Schwarz als Akzent und Bannerfarbe, goldener Signalton — Rabattwoche mit maximalem Kontrast.',
  'black-friday':
    'Wie Black Week, zusätzlich ein kräftiges Rot für alle Aktionspreise im Shop.',
}

export function SeasonForm({ initialValues }: { initialValues: SeasonFormValues }) {
  const router = useRouter()
  const toast = useToast()

  const [values, setValues] = useState<SeasonFormValues>(initialValues)
  const [saved, setSaved] = useState<SeasonFormValues>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function update<K extends keyof SeasonFormValues>(key: K, value: SeasonFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const dirty =
    values.theme !== saved.theme ||
    values.bannerText !== saved.bannerText ||
    values.bannerLink !== saved.bannerLink ||
    values.bannerActive !== saved.bannerActive

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setFormError(null)

    const result = await apiRequest<{ theme: string; message?: string }>('/api/admin/saison', {
      method: 'POST',
      body: values,
    })

    setSaving(false)

    if (!result.ok) {
      setFormError(result.error)
      if (result.fieldErrors) {
        setErrors(result.fieldErrors)
        const first = Object.keys(result.fieldErrors)[0]
        const element = first ? document.querySelector<HTMLElement>(`[name="${first}"]`) : null
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        element?.focus({ preventScroll: true })
      }
      toast.error('Speichern nicht möglich', result.error)
      return
    }

    setSaved(values)
    toast.success('Darstellung umgestellt', result.data.message)
    router.refresh()
  }

  const previewText =
    values.bannerText.trim().length > 0
      ? values.bannerText.trim()
      : 'Beispieltext — so erscheint der Hinweis über der Kopfzeile.'

  return (
    <form onSubmit={submit} noValidate className="space-y-5 pb-24">
      {formError && <FormError>{formError}</FormError>}

      <p className="flex items-start gap-2.5 rounded-lg border border-info-100 bg-info-50 px-4 py-3 text-sm leading-relaxed text-info-700">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Gespeicherte Änderungen gelten sofort für alle Besucherinnen und Besucher des Shops — es gibt
          keinen Freigabeschritt und keine Vorlaufzeit.
        </span>
      </p>

      {/* 1 — Saisonmodus */}
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle as="h2">Saisonmodus</CardTitle>
            <CardDescription>
              Der Modus verschiebt ausschließlich Farbtöne: Akzentfarbe, Bannerfarbe und ein sehr feiner
              Farbschleier im Kopfbereich. Aufbau, Schrift und Preise bleiben unverändert.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <fieldset>
            <legend className="sr-only">Saisonmodus wählen</legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {SEASONAL_THEMES.map((theme) => {
                const active = values.theme === theme
                return (
                  <label
                    key={theme}
                    className={cn(
                      'group flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-all duration-200',
                      '[transition-timing-function:var(--ease-out-soft)]',
                      'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]',
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-subtle)]'
                        : 'border-[var(--border-default)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)]',
                    )}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={theme}
                      checked={active}
                      onChange={() => update('theme', theme)}
                      className="mt-0.5 size-[18px] shrink-0 rounded-full accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">
                          {SEASONAL_THEME_LABELS[theme]}
                        </span>
                        <ColorSwatches theme={theme} />
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                        {SEASON_EFFECTS[theme]}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          {errors.theme && (
            <p role="alert" className="mt-3 text-xs font-medium text-danger-700">
              {errors.theme}
            </p>
          )}
        </CardBody>
      </Card>

      {/* 2 — Hinweisbanner */}
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle as="h2">Hinweisbanner</CardTitle>
            <CardDescription>
              Schmaler Streifen über der Kopfzeile — für Lieferhinweise, Aktionen oder Betriebsferien.
              Er erscheint auf jeder Seite des Shops.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Checkbox
              name="bannerActive"
              checked={values.bannerActive}
              onChange={(e) => update('bannerActive', e.target.checked)}
              label="Banner anzeigen"
              description="Ohne Häkchen bleibt der Text gespeichert, wird aber nicht ausgespielt."
            />
          </div>

          <Field
            label="Bannertext"
            error={errors.bannerText}
            description="Ein Satz, höchstens 160 Zeichen. Kurze Sätze bleiben auf dem Telefon in einer Zeile."
            className="sm:col-span-2"
          >
            <Input
              name="bannerText"
              value={values.bannerText}
              onChange={(e) => update('bannerText', e.target.value)}
              maxLength={160}
              placeholder="z. B. Bestellungen bis 12 Uhr gehen am selben Werktag raus."
            />
          </Field>

          <Field
            label="Bannerlink"
            error={errors.bannerLink}
            description="Optional. Pfad im Shop (Beispiel: /kategorie/raeuchermehl) oder vollständige https-Adresse."
            className="sm:col-span-2"
          >
            <Input
              name="bannerLink"
              value={values.bannerLink}
              onChange={(e) => update('bannerLink', e.target.value)}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              placeholder="/kategorie/raeuchermehl"
            />
          </Field>

          <div className="sm:col-span-2">
            <FormHint>
              Ohne Link ist der Banner reiner Text. Mit Link wird der gesamte Streifen anklickbar und
              erhält einen Pfeil als Hinweis.
            </FormHint>
          </div>
        </CardBody>
      </Card>

      {/* 3 — Vorschau */}
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle as="h2">Vorschau</CardTitle>
            <CardDescription>
              So wirken Banner und Akzentfarbe nach dem Speichern. Die Farben stammen aus denselben
              Tokens wie der Shop.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <div
            data-season={values.theme}
            className="overflow-hidden rounded-lg border border-[var(--border-subtle)]"
          >
            {values.bannerActive ? (
              <div
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-center"
                style={{ backgroundColor: 'var(--banner-bg)', color: 'var(--banner-fg)' }}
              >
                <span className="text-xs leading-relaxed font-medium">{previewText}</span>
                {values.bannerLink.trim().length > 0 && (
                  <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                )}
              </div>
            ) : (
              <div className="border-b border-dashed border-[var(--border-default)] bg-paper-sunken px-4 py-2.5 text-center text-xs text-ink-muted">
                Banner ausgeblendet — Besucher sehen diesen Streifen nicht.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 bg-[var(--surface-raised)] px-4 py-5">
              <span
                className="inline-flex h-11 items-center rounded-md px-5 text-sm font-medium"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                In den Warenkorb
              </span>
              <span
                className="inline-flex h-11 items-center rounded-md border px-5 text-sm font-medium"
                style={{
                  borderColor: 'var(--accent-border)',
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent-hover)',
                }}
              >
                Merken
              </span>
              <span className="text-sm text-ink-muted">
                Akzentfarbe für Schaltflächen, Links und Hervorhebungen
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Aktionsleiste — bleibt am unteren Rand erreichbar. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-page)]/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <p className="min-w-0 flex-1 text-sm text-ink-muted" aria-live="polite">
          {dirty ? 'Noch nicht gespeichert — der Shop zeigt weiterhin die bisherige Einstellung.' : 'Alle Einstellungen sind gespeichert.'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setValues(saved)
            setErrors({})
            setFormError(null)
          }}
          disabled={!dirty || saving}
        >
          Verwerfen
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!dirty}>
          Für den Shop übernehmen
        </Button>
      </div>
    </form>
  )
}

/**
 * Farbfelder eines Modus: Akzent, Bannergrund, Bannerakzent.
 * `data-season` auf dem Element selbst laesst die Saison-Tokens greifen, ohne
 * dass eine Farbe hier noch einmal genannt werden muesste.
 */
function ColorSwatches({ theme }: { theme: SeasonalThemeKey }) {
  return (
    <span data-season={theme} className="flex shrink-0 items-center gap-1" aria-hidden="true">
      <span
        className="size-4 rounded-full ring-1 ring-[var(--border-default)] ring-inset"
        style={{ backgroundColor: 'var(--accent)' }}
      />
      <span
        className="size-4 rounded-full ring-1 ring-[var(--border-default)] ring-inset"
        style={{ backgroundColor: 'var(--banner-bg)' }}
      />
      <span
        className="size-4 rounded-full ring-1 ring-[var(--border-default)] ring-inset"
        style={{ backgroundColor: 'var(--banner-accent)' }}
      />
    </span>
  )
}
