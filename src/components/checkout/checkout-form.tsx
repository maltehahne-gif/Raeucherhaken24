'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Field, Input, Textarea, Checkbox, FormError, FormHint } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/client/api'
import { useCart } from '@/components/cart/cart-provider'

/**
 * Checkout-Formular.
 *
 * Merkmale:
 *  - Feldbezogene Fehlermeldungen kommen vom Server; die Validierung liegt
 *    dort und wird nicht im Browser dupliziert.
 *  - Ein Idempotenzschluessel wird einmal je Formular erzeugt. Mehrfachklick
 *    oder ein Netzwerk-Retry erzeugen dadurch keine zweite Bestellung.
 *  - Das Feld "website" ist eine Spamfalle: es ist fuer Menschen unsichtbar
 *    und muss leer bleiben.
 */

interface CheckoutResponse {
  orderNumber: string
  redirectTo: string
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `co_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `co_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

export function CheckoutForm({ couponCode }: { couponCode: string | null }) {
  const router = useRouter()
  const { refresh } = useCart()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const idempotencyKey = useRef(newIdempotencyKey())
  const formRef = useRef<HTMLFormElement>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    const data = new FormData(event.currentTarget)
    const payload = {
      firstName: String(data.get('firstName') ?? ''),
      lastName: String(data.get('lastName') ?? ''),
      company: String(data.get('company') ?? ''),
      email: String(data.get('email') ?? ''),
      phone: String(data.get('phone') ?? ''),
      street: String(data.get('street') ?? ''),
      postalCode: String(data.get('postalCode') ?? ''),
      city: String(data.get('city') ?? ''),
      note: String(data.get('note') ?? ''),
      terms: data.get('terms') === 'on',
      privacy: data.get('privacy') === 'on',
      website: String(data.get('website') ?? ''),
      couponCode: couponCode ?? null,
      idempotencyKey: idempotencyKey.current,
    }

    const result = await apiRequest<CheckoutResponse>('/api/checkout', { method: 'POST', body: payload })

    if (!result.ok) {
      setSubmitting(false)
      setFormError(result.error)
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors)
        // Fokus auf das erste fehlerhafte Feld setzen.
        const firstField = Object.keys(result.fieldErrors)[0]
        const el = formRef.current?.querySelector<HTMLElement>(`[name="${firstField}"]`)
        el?.focus()
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } else {
        formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
      // Bestand koennte sich geaendert haben — Warenkorb neu laden.
      if (result.code === 'out_of_stock' || result.code === 'item_unavailable') void refresh()
      return
    }

    // Bewusst kein setSubmitting(false): der Knopf bleibt bis zum
    // Seitenwechsel gesperrt, damit kein zweiter Versuch startet.
    await refresh()
    router.push(result.data.redirectTo)
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-8">
      {formError && <FormError>{formError}</FormError>}

      <section aria-labelledby="kontakt">
        <h2 id="kontakt" className="font-display text-xl font-semibold">
          Kontakt
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          An diese Adresse schicken wir die Bestellbestätigung.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="E-Mail" required error={fieldErrors.email} className="sm:col-span-2">
            <Input name="email" type="email" autoComplete="email" inputMode="email" required />
          </Field>
          <Field label="Telefon" error={fieldErrors.phone} hint="Optional" className="sm:col-span-2">
            <Input name="phone" type="tel" autoComplete="tel" inputMode="tel" />
          </Field>
        </div>
        <FormHint className="mt-2">
          Wir melden uns telefonisch nur bei Rückfragen zur Lieferung.
        </FormHint>
      </section>

      <section aria-labelledby="lieferung">
        <h2 id="lieferung" className="font-display text-xl font-semibold">
          Lieferadresse
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Vorname" required error={fieldErrors.firstName}>
            <Input name="firstName" autoComplete="given-name" required />
          </Field>
          <Field label="Nachname" required error={fieldErrors.lastName}>
            <Input name="lastName" autoComplete="family-name" required />
          </Field>
          <Field label="Firma" error={fieldErrors.company} hint="Optional" className="sm:col-span-2">
            <Input name="company" autoComplete="organization" />
          </Field>
          <Field label="Straße und Hausnummer" required error={fieldErrors.street} className="sm:col-span-2">
            <Input name="street" autoComplete="street-address" required />
          </Field>
          <Field label="Postleitzahl" required error={fieldErrors.postalCode}>
            <Input name="postalCode" autoComplete="postal-code" inputMode="numeric" maxLength={5} required />
          </Field>
          <Field label="Ort" required error={fieldErrors.city}>
            <Input name="city" autoComplete="address-level2" required />
          </Field>
        </div>
        <FormHint className="mt-3">
          Wir liefern derzeit ausschließlich innerhalb Deutschlands. Für Lieferungen ins Ausland
          schreiben Sie uns bitte über das{' '}
          <Link href="/kontakt" className="underline underline-offset-2">
            Kontaktformular
          </Link>
          .
        </FormHint>
      </section>

      <section aria-labelledby="hinweis">
        <h2 id="hinweis" className="font-display text-xl font-semibold">
          Bestellhinweis
        </h2>
        <div className="mt-5">
          <Field
            label="Anmerkung zur Bestellung"
            hideLabel
            error={fieldErrors.note}
            description="Wunschtermin, Ablageort oder Hinweise zur Fertigung – optional."
          >
            <Textarea name="note" rows={3} maxLength={1000} placeholder="Optionale Anmerkung …" />
          </Field>
        </div>
      </section>

      {/* Spamfalle: fuer Menschen unsichtbar, fuer einfache Bots verlockend. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Bitte nicht ausfüllen</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <section aria-labelledby="abschluss" className="space-y-4">
        <h2 id="abschluss" className="font-display text-xl font-semibold">
          Abschluss
        </h2>

        <Checkbox
          name="terms"
          error={fieldErrors.terms}
          label={
            <>
              Ich habe die{' '}
              <Link href="/agb" target="_blank" className="underline underline-offset-2">
                AGB
              </Link>{' '}
              und die{' '}
              <Link href="/widerruf" target="_blank" className="underline underline-offset-2">
                Widerrufsbelehrung
              </Link>{' '}
              gelesen und stimme ihnen zu.
            </>
          }
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

        <div className="rounded-lg border border-[var(--border-subtle)] bg-paper-sunken/70 p-4">
          <h3 className="text-sm font-semibold">Zahlungsart</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            Vorkasse per Überweisung. Nach dem Absenden erhalten Sie die Bestellbestätigung mit allen
            Zahlungsdaten. Wir versenden, sobald der Betrag eingegangen ist.
          </p>
        </div>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          <Lock className="size-4.5" aria-hidden="true" />
          Zahlungspflichtig bestellen
        </Button>

        <p className="text-center text-xs text-ink-faint">
          Mit dem Absenden geben Sie eine verbindliche Bestellung ab.
        </p>
      </section>
    </form>
  )
}
