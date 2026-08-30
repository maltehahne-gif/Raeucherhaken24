'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileUp, Paperclip, Ruler, Send, Trash2 } from 'lucide-react'
import { Field, Input, Textarea, Select, Checkbox, FormError, FormHint, OptionCard } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/client/api'
import { cn } from '@/lib/utils/cn'

/**
 * Formular für Sonderanfertigungen.
 *
 * Die Herausforderung: komplexe technische Anforderungen erfassen, ohne
 * Kunden abzuschrecken, die noch keine Zeichnung haben. Der Aufbau folgt
 * deshalb einem Gefälle:
 *
 *   Pflicht:  Was soll das Teil können? (in eigenen Worten)
 *   Optional: Konkrete Maße, aufklappbar und mit Skizzenhilfe
 *   Optional: Anhänge
 *
 * Wer nur den ersten Teil ausfüllt, bekommt trotzdem eine Rückmeldung.
 */

const MAX_FILES = 5
const MAX_BYTES_PER_FILE = 8 * 1024 * 1024
const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif,.pdf'

interface ProjectResponse {
  projectNumber: string
  redirectTo: string
  attachmentCount: number
}

export function ProjectForm() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [material, setMaterial] = useState('V4A')
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFiles(selected: FileList | null) {
    if (!selected) return
    setFileError(null)

    const incoming = Array.from(selected)
    const oversized = incoming.find((f) => f.size > MAX_BYTES_PER_FILE)
    if (oversized) {
      setFileError(`„${oversized.name}“ ist größer als 8 MB.`)
      return
    }
    const combined = [...files, ...incoming].slice(0, MAX_FILES)
    if (files.length + incoming.length > MAX_FILES) {
      setFileError(`Es sind höchstens ${MAX_FILES} Dateien möglich. Die übrigen wurden nicht übernommen.`)
    }
    setFiles(combined)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    const data = new FormData(event.currentTarget)
    // Die Dateien werden separat verwaltet, damit die Auswahl sichtbar bleibt.
    data.delete('attachments')
    for (const file of files) data.append('attachments', file)

    const csrfMatch = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`))

    let response: Response
    try {
      response = await fetch('/api/sonderanfertigung', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { [CSRF_HEADER]: csrfMatch ? decodeURIComponent(csrfMatch[1]) : '' },
        body: data,
      })
    } catch {
      setSubmitting(false)
      setFormError('Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.')
      return
    }

    let payload: { error?: string; fieldErrors?: Record<string, string> } & Partial<ProjectResponse>
    try {
      payload = await response.json()
    } catch {
      setSubmitting(false)
      setFormError('Die Antwort des Servers konnte nicht gelesen werden. Bitte versuchen Sie es erneut.')
      return
    }

    if (!response.ok) {
      setSubmitting(false)
      setFormError(payload.error ?? 'Ihre Anfrage konnte nicht übermittelt werden.')
      if (payload.fieldErrors) {
        setFieldErrors(payload.fieldErrors)
        const firstField = Object.keys(payload.fieldErrors)[0]
        const el = formRef.current?.querySelector<HTMLElement>(`[name="${firstField}"]`)
        el?.focus()
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } else {
        formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
      return
    }

    if (payload.redirectTo) router.push(payload.redirectTo)
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-10">
      {formError && <FormError>{formError}</FormError>}

      {/* Schritt 1: Was soll das Teil können? */}
      <section aria-labelledby="anwendung" className="space-y-5">
        <div>
          <h2 id="anwendung" className="font-display text-xl font-semibold">
            1. Worum geht es?
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Beschreiben Sie in eigenen Worten, was das Teil leisten soll. Maße können Sie später
            ergänzen — auch ohne Zeichnung kommen wir weiter.
          </p>
        </div>

        <Field label="Projektname" required error={fieldErrors.projectName}
          description="Ein kurzer Name, unter dem wir Ihr Projekt führen – zum Beispiel „Aalhaken Räucherei Nord“.">
          <Input name="projectName" required maxLength={120} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lebensmittel bzw. Anwendung" required error={fieldErrors.foodType}>
            <Input name="foodType" required maxLength={120} placeholder="z. B. Aal, Lachsseiten, Rohschinken" />
          </Field>
          <Field label="Einsatzzweck" required error={fieldErrors.purpose}>
            <Input name="purpose" required maxLength={200} placeholder="z. B. Kalträuchern im Altonaer Ofen" />
          </Field>
        </div>

        <Field
          label="Gewünschte Belastung je Haken"
          error={fieldErrors.targetLoadGrams}
          hint="Optional"
          description="In Gramm. Falls unbekannt: leer lassen, wir schätzen aus der Anwendung."
        >
          <Input name="targetLoadGrams" type="number" inputMode="numeric" min={0} max={500000} placeholder="z. B. 4000" />
        </Field>

        <Field
          label="Was soll erreicht werden?"
          required
          error={fieldErrors.goalDescription}
          description="Je konkreter, desto besser. Was funktioniert an bisherigen Lösungen nicht? Woran scheitert es heute?"
        >
          <Textarea
            name="goalDescription"
            required
            rows={5}
            minLength={20}
            maxLength={3000}
            placeholder="Beispiel: Unsere jetzigen Haken biegen sich bei ganzen Aalen auf und die Spitze reißt beim Aufhängen aus. Wir brauchen etwas Stabileres, das trotzdem noch durch die Kiemen passt."
          />
        </Field>
      </section>

      {/* Schritt 2: Werkstoff und Ausführung */}
      <section aria-labelledby="werkstoff" className="space-y-5">
        <div>
          <h2 id="werkstoff" className="font-display text-xl font-semibold">
            2. Werkstoff und Ausführung
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            V4A enthält Molybdän und ist gegenüber chloridhaltiger Umgebung – Pökellake und Salz –
            widerstandsfähiger als V2A.
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">
            Werkstoff
            <span className="ml-0.5 text-[var(--accent)]" aria-hidden="true">
              *
            </span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { value: 'VA', label: 'VA', description: 'Edelstahl rostfrei, Grundausführung' },
              { value: 'V2A', label: 'V2A (1.4301)', description: 'Standard ohne Dauersalzkontakt' },
              { value: 'V4A', label: 'V4A (1.4404)', description: 'Für Lake, Salz und Dauerbetrieb' },
            ].map((option) => (
              <OptionCard
                key={option.value}
                name="material"
                value={option.value}
                label={option.label}
                description={option.description}
                checked={material === option.value}
                onChange={() => setMaterial(option.value)}
              />
            ))}
          </div>
          {fieldErrors.material && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger-700">
              {fieldErrors.material}
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Spitzenausführung" error={fieldErrors.tipFinish} hint="Optional">
            <Select name="tipFinish" defaultValue="">
              <option value="">Keine Vorgabe</option>
              <option value="angespitzt">Angespitzt</option>
              <option value="handgeschliffen">Handgeschliffen</option>
              <option value="abgerundet">Abgerundet</option>
              <option value="widerhaken">Mit Widerhaken</option>
            </Select>
          </Field>
          <Field label="Oberfläche" error={fieldErrors.surface} hint="Optional">
            <Select name="surface" defaultValue="">
              <option value="">Keine Vorgabe</option>
              <option value="wie gewalzt">Wie gewalzt</option>
              <option value="gebuerstet">Gebürstet</option>
              <option value="elektropoliert">Elektropoliert</option>
            </Select>
          </Field>
          <Field label="Stückzahl" error={fieldErrors.quantity} hint="Optional">
            <Input name="quantity" type="number" inputMode="numeric" min={1} max={100000} placeholder="z. B. 250" />
          </Field>
        </div>
      </section>

      {/* Schritt 3: Maße — aufklappbar, damit das Formular nicht erschlägt */}
      <section aria-labelledby="masse">
        <div className="mb-3">
          <h2 id="masse" className="font-display text-xl font-semibold">
            3. Maße
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Alles optional. Wenn Sie noch keine Maße haben, überspringen Sie diesen Abschnitt —
            wir klären ihn im Gespräch.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5">
          <Disclosure
            title="Maße angeben"
            defaultOpen={false}
            meta={<Ruler className="size-4 text-ink-faint" aria-hidden="true" />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Gesamtlänge" error={fieldErrors.totalLengthMm} hint="in mm">
                <Input name="totalLengthMm" type="number" inputMode="numeric" min={10} max={3000} placeholder="z. B. 260" />
              </Field>
              <Field
                label="Drahtdurchmesser"
                error={fieldErrors.wireDiameterTenthMm}
                hint="in Zehntelmillimetern"
                description="30 entspricht 3,0 mm. So lassen sich auch Zwischengrößen wie 3,5 mm (= 35) angeben."
              >
                <Input name="wireDiameterTenthMm" type="number" inputMode="numeric" min={5} max={300} placeholder="z. B. 35" />
              </Field>
              <Field label="Anzahl der Dornen" error={fieldErrors.prongCount}>
                <Input name="prongCount" type="number" inputMode="numeric" min={1} max={24} placeholder="z. B. 2" />
              </Field>
              <Field label="Dornenlänge" error={fieldErrors.prongLengthMm} hint="in mm">
                <Input name="prongLengthMm" type="number" inputMode="numeric" min={5} max={1000} placeholder="z. B. 45" />
              </Field>
              <Field
                label="Öffnungsmaß"
                error={fieldErrors.openingWidthMm}
                hint="in mm"
                description="Lichter Abstand zwischen Schaft und Spitze."
              >
                <Input name="openingWidthMm" type="number" inputMode="numeric" min={1} max={1000} placeholder="z. B. 28" />
              </Field>
              <Field label="Form" error={fieldErrors.shape} hint="Optional">
                <Select name="shape" defaultValue="">
                  <option value="">Keine Vorgabe</option>
                  <option value="S-Form">S-Form</option>
                  <option value="J-Form">J-Form</option>
                  <option value="Doppelhaken">Doppelhaken</option>
                  <option value="Mehrzinker">Mehrzinker</option>
                  <option value="Gerade mit Widerhaken">Gerade mit Widerhaken</option>
                  <option value="Schiene / Leiste">Schiene / Leiste</option>
                  <option value="Sonderform">Sonderform (siehe Beschreibung)</option>
                </Select>
              </Field>
              <Field
                label="Weitere Maße und Hinweise"
                error={fieldErrors.additionalDimensions}
                hint="Optional"
                className="sm:col-span-2"
              >
                <Textarea
                  name="additionalDimensions"
                  rows={3}
                  maxLength={1000}
                  placeholder="Radien, Winkel, Ösendurchmesser, Abstände bei Leisten …"
                />
              </Field>
            </div>
          </Disclosure>
        </div>
      </section>

      {/* Schritt 4: Anhänge */}
      <section aria-labelledby="anhaenge" className="space-y-4">
        <div>
          <h2 id="anhaenge" className="font-display text-xl font-semibold">
            4. Skizzen und Unterlagen
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Eine Handskizze auf Papier reicht völlig. Fotos vorhandener Haken helfen uns oft mehr als
            eine technische Zeichnung.
          </p>
        </div>

        <div
          className={cn(
            'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
            fileError ? 'border-danger-500 bg-danger-50/50' : 'border-[var(--border-default)] bg-paper-sunken/50',
          )}
        >
          <FileUp className="mx-auto size-7 text-ink-faint" aria-hidden="true" />
          <label htmlFor="attachments" className="mt-3 block cursor-pointer">
            <span className="text-sm font-medium text-[var(--accent)] underline underline-offset-4">
              Dateien auswählen
            </span>
            <input
              ref={fileInputRef}
              id="attachments"
              name="attachments"
              type="file"
              multiple
              accept={ACCEPTED}
              onChange={(e) => addFiles(e.target.files)}
              className="sr-only"
            />
          </label>
          <p className="mt-1.5 text-xs text-ink-muted">
            JPG, PNG, WEBP, GIF oder PDF · höchstens {MAX_FILES} Dateien · je bis 8 MB
          </p>
          {fileError && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger-700">
              {fileError}
            </p>
          )}
        </div>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2.5"
              >
                <Paperclip className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="tabular block text-xs text-ink-faint">
                    {(file.size / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 2 })} MB
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  aria-label={`${file.name} entfernen`}
                  className="shrink-0 rounded p-1.5 text-ink-faint transition-colors hover:bg-paper-sunken hover:text-danger-500"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Schritt 5: Kontakt und Abschluss */}
      <section aria-labelledby="kontakt" className="space-y-5">
        <div>
          <h2 id="kontakt" className="font-display text-xl font-semibold">
            5. Ihre Kontaktdaten
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={fieldErrors.contactName}>
            <Input name="contactName" autoComplete="name" required maxLength={120} />
          </Field>
          <Field label="Firma" error={fieldErrors.company} hint="Optional">
            <Input name="company" autoComplete="organization" maxLength={120} />
          </Field>
          <Field label="E-Mail" required error={fieldErrors.email}>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Telefon" error={fieldErrors.phone} hint="Optional">
            <Input name="phone" type="tel" autoComplete="tel" />
          </Field>
        </div>

        {/* Spamfalle */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website-project">Bitte nicht ausfüllen</label>
          <input id="website-project" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-5">
          <Checkbox
            name="wantsConsultation"
            label="Ich wünsche ein telefonisches Beratungsgespräch vor dem Angebot."
          />
          <Checkbox
            name="allowCatalogRelease"
            label="Diese Sonderanfertigung darf später ins Standardsortiment aufgenommen werden."
            description="Freiwillig. Ohne diese Freigabe fertigen wir das Teil ausschließlich für Sie."
          />
          <Checkbox
            name="specConfirmed"
            error={fieldErrors.specConfirmed}
            label="Ich bestätige, dass meine technischen Angaben nach bestem Wissen zutreffen."
            description="Wir prüfen die Angaben vor der Fertigung und melden uns bei Unstimmigkeiten."
          />
          <Checkbox
            name="privacy"
            error={fieldErrors.privacy}
            label={
              <>
                Ich habe die{' '}
                <Link href="/datenschutz" target="_blank" className="underline underline-offset-2">
                  Datenschutzerklärung
                </Link>{' '}
                zur Kenntnis genommen.
              </>
            }
          />
        </div>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          <Send className="size-4.5" aria-hidden="true" />
          Projekt einreichen
        </Button>

        <FormHint className="text-center">
          Nach dem Absenden erhalten Sie einen strukturierten Projektentwurf, den Sie ausdrucken und
          intern abstimmen können. Ein verbindliches Angebot folgt gesondert.
        </FormHint>
      </section>
    </form>
  )
}
