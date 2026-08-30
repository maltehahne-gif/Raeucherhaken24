'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Send } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, FormError, FormHint, Input, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { SUPPORT_TOPIC_LABELS, SUPPORT_TOPICS, type SupportTopic } from '@/lib/domain/enums'

/**
 * Kontaktformular.
 *
 * Die eigentliche Pruefung liegt vollstaendig auf dem Server
 * (contactSchema in @/lib/validation/contact). Der Browser bekommt die
 * feldbezogenen Meldungen zurueck und zeigt sie am jeweiligen Feld — es gibt
 * also nur eine Regelquelle, die nicht auseinanderlaufen kann.
 *
 * Die Bestellnummer erscheint nur beim Anliegen „Frage zu einer Bestellung“.
 * Wird das Anliegen wieder gewechselt, wird der Wert verworfen, damit keine
 * unsichtbare Eingabe mitgesendet wird.
 */

const MAX = {
  name: 120,
  company: 120,
  phone: 32,
  subject: 160,
  message: 4_000,
  orderNumber: 40,
} as const

interface ContactResponse {
  ticketNumber: string
  message: string
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  company: '',
  topic: 'general' as SupportTopic,
  orderNumber: '',
  subject: '',
  message: '',
}

export function ContactForm() {
  const toast = useToast()

  const [form, setForm] = useState(EMPTY_FORM)
  const [privacy, setPrivacy] = useState(false)
  const [website, setWebsite] = useState('')

  const [sending, setSending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => (current[key] ? { ...current, [key]: '' } : current))
  }

  function changeTopic(value: string) {
    const topic = (SUPPORT_TOPICS as readonly string[]).includes(value)
      ? (value as SupportTopic)
      : 'general'
    setForm((current) => ({
      ...current,
      topic,
      orderNumber: topic === 'order' ? current.orderNumber : '',
    }))
    setErrors((current) => ({ ...current, topic: '', orderNumber: '' }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setErrors({})
    setSending(true)

    const result = await apiRequest<ContactResponse>('/api/kontakt', {
      method: 'POST',
      body: {
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        topic: form.topic,
        orderNumber: form.topic === 'order' ? form.orderNumber : '',
        subject: form.subject,
        message: form.message,
        privacy,
        website,
      },
    })

    setSending(false)

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      setFormError(result.error)
      toast.error('Ihre Anfrage wurde nicht gesendet', result.error)
      return
    }

    setTicketNumber(result.data.ticketNumber)
    setForm(EMPTY_FORM)
    setPrivacy(false)
    toast.success('Anfrage eingegangen', `Ticketnummer ${result.data.ticketNumber}`)
  }

  if (ticketNumber) {
    return (
      <Card>
        <CardBody className="py-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-50 text-success-700">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold">Ihre Anfrage ist eingegangen</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            Wir haben Ihre Nachricht aufgenommen und melden uns innerhalb der Servicezeiten. Bitte
            notieren Sie sich die Ticketnummer – damit ordnen wir jede Rückfrage sofort zu.
          </p>

          <p className="mt-6 inline-flex flex-col items-center rounded-lg border border-[var(--border-default)] bg-paper-sunken/70 px-6 py-4">
            <span className="text-2xs font-semibold tracking-[0.12em] text-ink-faint uppercase">
              Ticketnummer
            </span>
            <span className="tabular mt-1 font-display text-2xl font-semibold text-ink">
              {ticketNumber}
            </span>
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setTicketNumber(null)}>
              Weitere Anfrage stellen
            </Button>
            <Link
              href="/wissen"
              className="text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              Zum Wissensbereich
            </Link>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle as="h2">Nachricht schreiben</CardTitle>
          <CardDescription>
            Felder mit * sind Pflichtangaben. Sie erhalten sofort eine Ticketnummer.
          </CardDescription>
        </div>
      </CardHeader>

      <CardBody>
        <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
          {formError && <FormError>{formError}</FormError>}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" required error={errors.name}>
              <Input
                value={form.name}
                maxLength={MAX.name}
                autoComplete="name"
                disabled={sending}
                onChange={(event) => update('name', event.target.value)}
                placeholder="Vor- und Nachname"
              />
            </Field>

            <Field label="E-Mail-Adresse" required error={errors.email}>
              <Input
                type="email"
                inputMode="email"
                value={form.email}
                maxLength={160}
                autoComplete="email"
                disabled={sending}
                onChange={(event) => update('email', event.target.value)}
                placeholder="name@beispiel.de"
              />
            </Field>

            <Field
              label="Telefon"
              hint="Optional"
              error={errors.phone}
              description="Nur für Rückfragen, die sich schneller im Gespräch klären lassen."
            >
              <Input
                type="tel"
                inputMode="tel"
                value={form.phone}
                maxLength={MAX.phone}
                autoComplete="tel"
                disabled={sending}
                onChange={(event) => update('phone', event.target.value)}
              />
            </Field>

            <Field label="Firma" hint="Optional" error={errors.company}>
              <Input
                value={form.company}
                maxLength={MAX.company}
                autoComplete="organization"
                disabled={sending}
                onChange={(event) => update('company', event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Anliegen"
            required
            error={errors.topic}
            description="Die Zuordnung entscheidet, wer Ihre Anfrage bearbeitet."
          >
            <Select value={form.topic} disabled={sending} onChange={(event) => changeTopic(event.target.value)}>
              {SUPPORT_TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {SUPPORT_TOPIC_LABELS[topic]}
                </option>
              ))}
            </Select>
          </Field>

          {form.topic === 'order' && (
            <Field
              label="Bestellnummer"
              hint="Optional"
              error={errors.orderNumber}
              description="Steht in der Bestellbestätigung, zum Beispiel RH-2025-10023. Mit ihr entfällt die erste Rückfrage."
            >
              <Input
                value={form.orderNumber}
                maxLength={MAX.orderNumber}
                disabled={sending}
                onChange={(event) => update('orderNumber', event.target.value)}
                placeholder="RH-JJJJ-NNNNN"
              />
            </Field>
          )}

          <Field label="Betreff" required error={errors.subject}>
            <Input
              value={form.subject}
              maxLength={MAX.subject}
              disabled={sending}
              onChange={(event) => update('subject', event.target.value)}
              placeholder="Worum geht es in einem Satz?"
            />
          </Field>

          <Field
            label="Nachricht"
            required
            error={errors.message}
            description="Mindestens 20 Zeichen. Je genauer Sie Räuchergut, Menge und Ofen beschreiben, desto konkreter fällt unsere Antwort aus."
          >
            <Textarea
              value={form.message}
              maxLength={MAX.message}
              rows={7}
              disabled={sending}
              onChange={(event) => update('message', event.target.value)}
            />
          </Field>

          <Checkbox
            checked={privacy}
            disabled={sending}
            error={errors.privacy}
            onChange={(event) => {
              setPrivacy(event.target.checked)
              setErrors((current) => (current.privacy ? { ...current, privacy: '' } : current))
            }}
            label={
              <>
                Ich habe die{' '}
                <Link
                  href="/datenschutz"
                  className="font-medium underline underline-offset-2 hover:text-ink"
                >
                  Datenschutzerklärung
                </Link>{' '}
                gelesen und bin mit der Verarbeitung meiner Angaben zur Bearbeitung dieser Anfrage
                einverstanden. *
              </>
            }
          />

          {/* Honigtopf: von Menschen nie ausgefuellt, von einfachen Bots oft. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website-kontakt">Bitte nicht ausfüllen</label>
            <input
              id="website-kontakt"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-5">
            <FormHint className="max-w-sm">
              Wir verwenden Ihre Angaben ausschließlich zur Bearbeitung dieser Anfrage.
            </FormHint>
            <Button type="submit" loading={sending}>
              <Send className="size-4" aria-hidden="true" />
              Anfrage senden
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
