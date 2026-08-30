'use client'

import { useState } from 'react'
import { KeyRound, Printer } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Field, FormHint, Input } from '@/components/ui/field'
import { formatDate, formatLength, formatTenthMm, formatWeight } from '@/lib/utils/text'
import { formatNumber } from '@/lib/money'

/**
 * Technischer Entwurf einer Sonderanfertigung.
 *
 * Die Angaben stehen erst nach Eingabe der E-Mail-Adresse zur Verfuegung, mit
 * der die Anfrage gestellt wurde — Projektnummern sind fortlaufend und damit
 * erratbar (siehe die Route dahinter). Geprueft wird ausschliesslich auf dem
 * Server; der Browser bekommt entweder die Daten oder eine Absage.
 *
 * Der Entwurf ist bewusst so gebaut, dass er sich ausdrucken laesst: Er ist
 * die Gespraechsgrundlage fuer die technische Abstimmung. Die Bedienelemente
 * tragen `no-print` und verschwinden im Ausdruck.
 */

interface ProjectDetails {
  projectNumber: string
  projectName: string
  contactName: string
  company: string | null
  foodType: string
  purpose: string
  targetLoadGrams: number | null
  goalDescription: string
  totalLengthMm: number | null
  wireDiameterTenthMm: number | null
  prongCount: number | null
  prongLengthMm: number | null
  openingWidthMm: number | null
  shape: string | null
  additionalDimensions: string | null
  material: string
  tipFinish: string | null
  surface: string | null
  quantity: number
  wantsConsultation: boolean
  status: string
  createdAt: string
  updatedAt: string
  attachmentCount: number
}

/** Eine Zeile des Datenblatts. Fehlende Angaben werden benannt, nicht verschwiegen. */
function SpecRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-0.5 border-b border-[var(--border-subtle)] py-2 last:border-b-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={value ? 'text-sm font-medium' : 'text-sm text-ink-faint italic'}>
        {value ?? 'noch offen'}
      </dd>
    </div>
  )
}

export function ProjectStatusLookup({ projectNumber }: { projectNumber: string }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<ProjectDetails | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    const result = await apiRequest<ProjectDetails>(
      `/api/sonderanfertigung/${encodeURIComponent(projectNumber)}`,
      { method: 'POST', body: { email } },
    )

    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDetails(result.data)
  }

  if (!details) {
    return (
      <form onSubmit={submit} noValidate className="max-w-md">
        <Field
          label="E-Mail-Adresse der Anfrage"
          required
          description="Dieselbe Adresse, die Sie im Anfrageformular angegeben haben."
          error={error}
        >
          {/*
            Kein eigenes id-Attribut: Field vergibt die Kennung und verbindet
            damit Label, Beschreibung und Fehlermeldung. Eine eigene Kennung
            wuerde diese Verbindung zerschneiden — das Feld haette dann keinen
            zugaenglichen Namen mehr.
          */}
          <Input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" className="mt-4" loading={loading}>
          <KeyRound className="size-4" aria-hidden="true" />
          Entwurf anzeigen
        </Button>
        <FormHint className="mt-3">
          Ohne diese Angabe zeigen wir nur den Bearbeitungsstand. Die technischen Angaben gehören
          Ihnen und sollen nicht offenliegen, nur weil jemand eine Projektnummer errät.
        </FormHint>
      </form>
    )
  }

  const dimensions = [
    { label: 'Gesamtlänge', value: details.totalLengthMm ? formatLength(details.totalLengthMm) : null },
    {
      label: 'Drahtdurchmesser',
      value: details.wireDiameterTenthMm ? formatTenthMm(details.wireDiameterTenthMm) : null,
    },
    { label: 'Anzahl Dornen', value: details.prongCount ? formatNumber(details.prongCount) : null },
    { label: 'Dornenlänge', value: details.prongLengthMm ? formatLength(details.prongLengthMm) : null },
    { label: 'Öffnungsmaß', value: details.openingWidthMm ? formatLength(details.openingWidthMm) : null },
    { label: 'Form', value: details.shape },
  ]

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Stand: {formatDate(new Date(details.updatedAt))}
        </p>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden="true" />
          Entwurf drucken
        </Button>
      </div>

      <article className="print-avoid-break rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 sm:p-8">
        <header className="border-b border-[var(--border-subtle)] pb-5">
          <p className="text-2xs font-semibold tracking-[0.14em] text-ink-faint uppercase">
            Technischer Entwurf
          </p>
          <h2 className="mt-1.5 font-display text-2xl font-semibold">{details.projectName}</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Projektnummer {details.projectNumber} · Eingegangen am{' '}
            {formatDate(new Date(details.createdAt))}
          </p>
        </header>

        <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <section>
            <h3 className="font-display text-sm font-semibold">Anfragende Stelle</h3>
            <dl className="mt-2">
              <SpecRow label="Ansprechpartner" value={details.contactName} />
              <SpecRow label="Betrieb" value={details.company} />
            </dl>
          </section>

          <section>
            <h3 className="font-display text-sm font-semibold">Anwendung</h3>
            <dl className="mt-2">
              <SpecRow label="Räuchergut" value={details.foodType} />
              <SpecRow label="Einsatzzweck" value={details.purpose} />
              <SpecRow
                label="Geplante Belastung"
                value={details.targetLoadGrams ? formatWeight(details.targetLoadGrams) : null}
              />
            </dl>
          </section>

          <section>
            <h3 className="font-display text-sm font-semibold">Maße</h3>
            <dl className="mt-2">
              {dimensions.map((row) => (
                <SpecRow key={row.label} label={row.label} value={row.value} />
              ))}
            </dl>
          </section>

          <section>
            <h3 className="font-display text-sm font-semibold">Ausführung</h3>
            <dl className="mt-2">
              <SpecRow label="Werkstoff" value={details.material} />
              <SpecRow label="Spitzenausführung" value={details.tipFinish} />
              <SpecRow label="Oberfläche" value={details.surface} />
              <SpecRow label="Stückzahl" value={formatNumber(details.quantity)} />
              <SpecRow
                label="Anhänge"
                value={
                  details.attachmentCount === 0
                    ? null
                    : `${formatNumber(details.attachmentCount)} ${details.attachmentCount === 1 ? 'Datei' : 'Dateien'}`
                }
              />
            </dl>
          </section>
        </div>

        <section className="mt-6">
          <h3 className="font-display text-sm font-semibold">Zielbeschreibung</h3>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
            {details.goalDescription}
          </p>
        </section>

        {details.additionalDimensions && (
          <section className="mt-6">
            <h3 className="font-display text-sm font-semibold">Weitere Maße und Hinweise</h3>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
              {details.additionalDimensions}
            </p>
          </section>
        )}

        <footer className="mt-8 border-t border-[var(--border-subtle)] pt-4">
          <p className="text-xs leading-relaxed text-ink-faint">
            Dieser Entwurf gibt ausschließlich Ihre eigenen Angaben wieder. Er ist weder ein Angebot
            noch eine Zusage über Machbarkeit, Preis oder Liefertermin. Verbindlich wird erst ein
            schriftliches Angebot des Betriebs.
            {details.wantsConsultation
              ? ' Sie haben um eine technische Rückmeldung gebeten.'
              : ''}
          </p>
        </footer>
      </article>
    </div>
  )
}
