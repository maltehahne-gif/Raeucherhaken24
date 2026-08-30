'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { OptionCard } from '@/components/ui/field'
import { ProductCard, type ProductCardData } from '@/components/product/product-card'
import { Spinner } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

/**
 * Geführter Kaufberater in fünf Schritten.
 *
 * Jeder Schritt beantwortet genau eine Frage — das hält die Abbruchquote
 * niedrig und macht auf dem Telefon jede Antwort mit einem Daumen erreichbar.
 * Der Fortschritt ist jederzeit sichtbar, Schritte lassen sich zurückgehen
 * ohne die bisherigen Antworten zu verlieren.
 *
 * Ausgewertet wird ausschließlich serverseitig gegen den echten Katalog.
 */

interface Recommendation {
  product: ProductCardData
  reason: string
  suggestedQuantity?: number
}

interface AdvisorResponse {
  hooks: Recommendation[]
  meal: Recommendation[]
  brine: Recommendation[]
  spices: Recommendation[]
  summary: string
  notes: string[]
}

interface Answers {
  foodType?: string
  foodDetail?: string
  method?: string
  flavor?: string
  amount?: string
  experience?: string
}

interface Step {
  key: keyof Answers
  question: string
  help: string
  options: Array<{ value: string; label: string; description?: string; detail?: string }>
}

const STEPS: Step[] = [
  {
    key: 'foodType',
    question: 'Was möchten Sie räuchern?',
    help: 'Danach richten sich Hakenform, Belastbarkeit und die passende Lauge.',
    options: [
      { value: 'fisch', label: 'Fisch', description: 'Forelle, Lachs, Makrele, Aal', detail: 'Forelle' },
      { value: 'fleisch', label: 'Fleisch', description: 'Schweinelachs, Bauch, Wild' },
      { value: 'schinken', label: 'Schinken', description: 'Roh- und Kochschinken, Speck' },
      { value: 'wurst', label: 'Wurst', description: 'Mettwurst, Salami, Landjäger' },
      { value: 'gefluegel', label: 'Geflügel', description: 'Hähnchen, Ente, Gans' },
      { value: 'kaese', label: 'Käse', description: 'Kalträuchern bei niedriger Temperatur' },
    ],
  },
  {
    key: 'method',
    question: 'Wie räuchern Sie?',
    help: 'Die Methode bestimmt Dauer, Temperatur und den Verbrauch an Räuchermehl.',
    options: [
      {
        value: 'heiss',
        label: 'Heißräuchern',
        description: 'Etwa 60 bis 90 Grad, ein bis zwei Stunden. Das Räuchergut gart dabei.',
      },
      {
        value: 'warm',
        label: 'Warmräuchern',
        description: 'Etwa 25 bis 50 Grad, mehrere Stunden. Zwischenform mit kräftigem Aroma.',
      },
      {
        value: 'kalt',
        label: 'Kalträuchern',
        description: 'Unter 25 Grad über viele Stunden bis Tage. Das Räuchergut bleibt roh.',
      },
    ],
  },
  {
    key: 'flavor',
    question: 'Wie kräftig soll es schmecken?',
    help: 'Bestimmt vor allem die Holzart und die Würzung der Lauge.',
    options: [
      { value: 'mild', label: 'Mild', description: 'Zurückhaltender Rauch, das Eigenaroma bleibt vorn' },
      { value: 'klassisch', label: 'Klassisch', description: 'Ausgewogen, so wie man Räucherware kennt' },
      { value: 'kraeftig', label: 'Kräftig', description: 'Deutliches Raucharoma, dunklere Färbung' },
      { value: 'wuerzig', label: 'Würzig', description: 'Mit spürbarer Gewürznote, etwa Wacholder und Pfeffer' },
    ],
  },
  {
    key: 'amount',
    question: 'Wie viel räuchern Sie je Durchgang?',
    help: 'Daraus ergibt sich, wie viele Haken und wie viel Mehl Sie brauchen.',
    options: [
      { value: 'klein', label: 'Bis 5 Stück', description: 'Gelegentlich für den eigenen Bedarf' },
      { value: 'mittel', label: '5 bis 20 Stück', description: 'Regelmäßig, auch für Gäste und Familie' },
      { value: 'gross', label: '20 bis 50 Stück', description: 'Größere Mengen, gut ausgelasteter Ofen' },
      { value: 'gewerblich', label: 'Über 50 Stück', description: 'Gewerblicher oder halbgewerblicher Betrieb' },
    ],
  },
  {
    key: 'experience',
    question: 'Wie viel Erfahrung bringen Sie mit?',
    help: 'Bestimmt, wie ausführlich unsere Hinweise ausfallen und wie robust wir auslegen.',
    options: [
      { value: 'einsteiger', label: 'Einsteiger', description: 'Erste Versuche, Sicherheit ist wichtiger als Feinheiten' },
      { value: 'fortgeschritten', label: 'Fortgeschritten', description: 'Schon einige Durchgänge erfolgreich hinter sich' },
      { value: 'profi', label: 'Gewerblich', description: 'Täglicher Einsatz, hohe Anforderungen an Haltbarkeit' },
    ],
  },
]

const AMOUNT_MAP: Record<string, { pieceCount: number; amountGrams: number; heavyBrineUse: boolean; budget?: string }> = {
  klein: { pieceCount: 5, amountGrams: 2_000, heavyBrineUse: false },
  mittel: { pieceCount: 15, amountGrams: 6_000, heavyBrineUse: false },
  gross: { pieceCount: 35, amountGrams: 14_000, heavyBrineUse: true },
  gewerblich: { pieceCount: 80, amountGrams: 30_000, heavyBrineUse: true, budget: 'hochwertig' },
}

export function BuyingGuide() {
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [result, setResult] = useState<AdvisorResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1
  const currentAnswer = step ? answers[step.key] : undefined

  async function submit(finalAnswers: Answers) {
    setBusy(true)
    setError(null)

    const amount = finalAnswers.amount ? AMOUNT_MAP[finalAnswers.amount] : undefined
    const payload = {
      foodType: finalAnswers.foodType,
      foodDetail: finalAnswers.foodDetail,
      method: finalAnswers.method,
      flavor: finalAnswers.flavor,
      experience: finalAnswers.experience,
      pieceCount: amount?.pieceCount,
      amountGrams: amount?.amountGrams,
      heavyBrineUse: amount?.heavyBrineUse ?? finalAnswers.method === 'kalt',
      budget: amount?.budget,
    }

    const response = await apiRequest<AdvisorResponse>('/api/beratung', { method: 'POST', body: payload })
    setBusy(false)

    if (!response.ok) {
      setError(response.error)
      return
    }
    setResult(response.data)
  }

  function choose(value: string, detail?: string) {
    const next: Answers = { ...answers, [step.key]: value }
    if (detail && step.key === 'foodType') next.foodDetail = detail
    setAnswers(next)

    if (isLast) void submit(next)
    else setStepIndex((i) => i + 1)
  }

  function restart() {
    setAnswers({})
    setResult(null)
    setStepIndex(0)
    setError(null)
  }

  if (result) {
    return <GuideResult result={result} onRestart={restart} />
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Fortschritt */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink-muted">
            Schritt {stepIndex + 1} von {STEPS.length}
          </p>
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => setStepIndex((i) => i - 1)}
              className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Zurück
            </button>
          )}
        </div>
        <ol className="mt-3 flex gap-1.5" aria-label="Fortschritt">
          {STEPS.map((s, index) => (
            <li
              key={s.key}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                index < stepIndex
                  ? 'bg-[var(--accent)]'
                  : index === stepIndex
                    ? 'bg-[var(--accent)] opacity-60'
                    : 'bg-paper-muted',
              )}
            >
              <span className="sr-only">
                {s.question} — {index < stepIndex ? 'beantwortet' : index === stepIndex ? 'aktuell' : 'offen'}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <fieldset key={step.key} className="animate-fade-up">
        <legend className="font-display text-2xl font-semibold sm:text-3xl">{step.question}</legend>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.help}</p>

        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {step.options.map((option) => (
            <OptionCard
              key={option.value}
              name={step.key}
              value={option.value}
              label={option.label}
              description={option.description}
              checked={currentAnswer === option.value}
              disabled={busy}
              onChange={() => choose(option.value, option.detail)}
            />
          ))}
        </div>
      </fieldset>

      {busy && (
        <p className="mt-6 flex items-center gap-2 text-sm text-ink-muted" role="status">
          <Spinner className="size-4" />
          Wir stellen Ihre Empfehlung zusammen …
        </p>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  )
}

function GuideResult({ result, onRestart }: { result: AdvisorResponse; onRestart: () => void }) {
  const groups: Array<{ title: string; description: string; items: Recommendation[] }> = [
    {
      title: 'Räucherhaken',
      description: 'Bauform, Länge und Werkstoff passend zu Ihrem Räuchergut.',
      items: result.hooks,
    },
    {
      title: 'Räuchermehl',
      description: 'Die Holzart bestimmt Farbe und Aroma stärker als jede andere Stellschraube.',
      items: result.meal,
    },
    {
      title: 'Räucherlauge',
      description: 'Würzt, festigt das Eiweiß und bereitet auf den Rauch vor.',
      items: result.brine,
    },
    {
      title: 'Passende Gewürze',
      description: 'Klassische Begleiter, die zu Ihrer Auswahl passen.',
      items: result.spices,
    },
  ].filter((group) => group.items.length > 0)

  return (
    <div className="animate-fade-up">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <Check className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-5 font-display text-3xl font-semibold">Ihre Empfehlung</h2>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">{result.summary}</p>
      </div>

      {result.notes.length > 0 && (
        <ul className="mx-auto mt-8 max-w-2xl space-y-2.5">
          {result.notes.map((note, index) => (
            <li
              key={index}
              className="flex items-start gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-paper-sunken/70 px-4 py-3 text-sm leading-relaxed text-ink-soft"
            >
              <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-12 space-y-12">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="font-display text-xl font-semibold">{group.title}</h3>
            <p className="mt-1 text-sm text-ink-muted">{group.description}</p>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-3">
              {group.items.map((item) => (
                <li key={item.product.slug}>
                  <ProductCard product={item.product} />
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    {item.reason}
                    {item.suggestedQuantity ? ` · empfohlen: ${item.suggestedQuantity} Stück` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap justify-center gap-3 border-t border-[var(--border-subtle)] pt-8">
        <Button variant="outline" onClick={onRestart}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Beratung neu starten
        </Button>
        <Link
          href="/kategorie"
          className="inline-flex h-11 items-center gap-1.5 px-4 text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Gesamtes Sortiment ansehen
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
