'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { parsePriceToCents } from '@/lib/money'
import { COUPON_TYPES, COUPON_TYPE_LABELS, type CouponType } from '@/lib/domain/enums'
import {
  describeCouponInWords,
  parsePercentToBp,
} from '@/lib/validation/coupon'
import { Button, ButtonLink, IconButton } from '@/components/ui/button'
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, FormHint, Input, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * Gutscheinformular und Zeilenaktionen der Gutscheinliste.
 *
 * Die Schluessel von `CouponFormValues` entsprechen exakt den Feldnamen des
 * Zod-Schemas (src/lib/validation/coupon.ts). Der Formularzustand geht
 * unveraendert als Anfragekoerper zum Server, und jede serverseitige
 * Feldmeldung findet ohne Umweg ihr Feld.
 *
 * Eingegeben werden fachliche Einheiten — Prozent und Euro. Die Umrechnung in
 * Basispunkte und Cent macht ausschliesslich der Server; die Vorschau nutzt
 * dieselben Funktionen, damit sie nicht abweichen kann.
 */

export interface CouponFormValues {
  code: string
  description: string
  type: string
  value: string
  minOrderValueCents: string
  maxDiscountCents: string
  startsAt: string
  endsAt: string
  usageLimit: string
  perCustomerLimit: string
  active: boolean
}

export const EMPTY_COUPON_FORM_VALUES: CouponFormValues = {
  code: '',
  description: '',
  type: 'percent',
  value: '',
  minOrderValueCents: '',
  maxDiscountCents: '',
  startsAt: '',
  endsAt: '',
  usageLimit: '',
  perCustomerLimit: '1',
  active: true,
}

export interface CouponFormProps {
  mode: 'create' | 'edit'
  /** Nur im Bearbeitungsmodus gesetzt. */
  couponId?: string
  initialValues: CouponFormValues
  /** Anzahl der Einlösungen — sperrt das Löschen. */
  redemptionCount?: number
  /** Bereits erfolgte Einlösungen; Untergrenze für das Nutzungslimit. */
  usageCount?: number
}

export function CouponForm({
  mode,
  couponId,
  initialValues,
  redemptionCount = 0,
  usageCount = 0,
}: CouponFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [values, setValues] = useState<CouponFormValues>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState<'delete' | 'deactivate' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const type = values.type as CouponType
  const deletionBlocked = redemptionCount > 0

  function update<K extends keyof CouponFormValues>(key: K, value: CouponFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  /** Springt zum ersten beanstandeten Feld, damit die Meldung nicht übersehen wird. */
  function focusFirstError(fieldErrors: Record<string, string>) {
    const first = Object.keys(fieldErrors)[0]
    if (!first) return
    const element = document.querySelector<HTMLElement>(`[name="${first}"]`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element?.focus({ preventScroll: true })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setFormError(null)

    const result = await apiRequest<{ id: string; redirectTo: string; message?: string }>(
      mode === 'create' ? '/api/admin/gutscheine' : `/api/admin/gutscheine/${couponId}`,
      { method: mode === 'create' ? 'POST' : 'PATCH', body: values },
    )

    if (!result.ok) {
      setSaving(false)
      setFormError(result.error)
      if (result.fieldErrors) {
        setErrors(result.fieldErrors)
        focusFirstError(result.fieldErrors)
      }
      toast.error('Speichern nicht möglich', result.error)
      return
    }

    if (mode === 'create') {
      toast.success('Gutschein angelegt', result.data.message)
      router.push(result.data.redirectTo)
      router.refresh()
      return
    }

    setSaving(false)
    toast.success('Änderungen gespeichert', result.data.message)
    router.refresh()
  }

  async function deleteCoupon() {
    if (!couponId) return
    setBusyAction('delete')
    const result = await apiRequest<{ redirectTo: string; message?: string }>(
      `/api/admin/gutscheine/${couponId}`,
      { method: 'DELETE' },
    )
    if (!result.ok) {
      setBusyAction(null)
      setDeleteOpen(false)
      toast.error('Löschen nicht möglich', result.error)
      return
    }
    toast.success('Gutschein gelöscht', result.data.message)
    router.push(result.data.redirectTo)
    router.refresh()
  }

  async function deactivate() {
    if (!couponId) return
    setBusyAction('deactivate')
    const result = await apiRequest<{ active: boolean; message?: string }>(
      `/api/admin/gutscheine/${couponId}`,
      { method: 'PATCH', body: { intent: 'activation', active: false } },
    )
    setBusyAction(null)
    if (!result.ok) {
      toast.error('Deaktivieren nicht möglich', result.error)
      return
    }
    setDeleteOpen(false)
    setValues((current) => ({ ...current, active: false }))
    toast.success('Gutschein deaktiviert', result.data.message)
    router.refresh()
  }

  // --- Vorschau -------------------------------------------------------------
  const preview = useMemo(() => buildPreview(values), [values])

  const usageSentence = useMemo(() => {
    const total = Number.parseInt(values.usageLimit.trim(), 10)
    const perCustomer = Number.parseInt(values.perCustomerLimit.trim(), 10)
    const totalText =
      Number.isFinite(total) && total > 0
        ? `Insgesamt ${total.toLocaleString('de-DE')}-mal einlösbar`
        : 'Beliebig oft einlösbar'
    const perCustomerText =
      Number.isFinite(perCustomer) && perCustomer > 0
        ? `höchstens ${perCustomer.toLocaleString('de-DE')}-mal je Kunde`
        : 'ohne Begrenzung je Kunde'
    return `${totalText}, ${perCustomerText}.`
  }, [values.usageLimit, values.perCustomerLimit])

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-5 pb-24">
        {formError && (
          <FormError>
            {formError}
            {Object.keys(errors).length > 0 && (
              <span className="mt-1 block text-xs">Die betroffenen Felder sind unten rot markiert.</span>
            )}
          </FormError>
        )}

        {/* 1 — Gutschein */}
        <FormSection
          title="Gutschein"
          description="Code und Rabattregel. Der Code wird im Warenkorb eingegeben und muss eindeutig sein."
        >
          <Field
            label="Code"
            required
            error={errors.code}
            description="Wird automatisch in Großbuchstaben geführt, Leerzeichen entfallen."
          >
            <Input
              name="code"
              value={values.code}
              onChange={(e) => update('code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              placeholder="z. B. RAUCHSTART10"
              className="tabular font-medium"
            />
          </Field>

          <Field
            label="Beschreibung"
            error={errors.description}
            description="Interner Verwendungszweck, z. B. „Newsletter-Willkommensrabatt“."
          >
            <Textarea
              name="description"
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
              maxLength={200}
              rows={2}
            />
          </Field>

          <Field label="Art" required error={errors.type}>
            <Select name="type" value={values.type} onChange={(e) => update('type', e.target.value)}>
              {COUPON_TYPES.map((option) => (
                <option key={option} value={option}>
                  {COUPON_TYPE_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>

          {type === 'free_shipping' ? (
            <div className="flex items-end">
              <FormHint>
                Versandkostenfreiheit kennt keinen Wert: Die Versandkosten der Bestellung entfallen
                vollständig, der Warenwert bleibt unverändert.
              </FormHint>
            </div>
          ) : (
            <Field
              label={type === 'percent' ? 'Rabatt in Prozent' : 'Rabattbetrag'}
              required
              error={errors.value}
              description={
                type === 'percent'
                  ? 'Eingabe in Prozent, z. B. 10 für 10 % auf den Warenwert.'
                  : 'Fester Betrag in Euro, Eingabe mit Komma (Beispiel: 5,00).'
              }
            >
              <Input
                name="value"
                value={values.value}
                onChange={(e) => update('value', e.target.value)}
                inputMode="decimal"
                maxLength={20}
                autoComplete="off"
                placeholder={type === 'percent' ? '10' : '5,00'}
                trailing={type === 'percent' ? '%' : '€'}
                className="tabular"
              />
            </Field>
          )}

          <Field
            label="Mindestbestellwert"
            error={errors.minOrderValueCents}
            description="Warenwert, ab dem der Gutschein greift. Leer oder 0 bedeutet: keine Schwelle."
          >
            <Input
              name="minOrderValueCents"
              value={values.minOrderValueCents}
              onChange={(e) => update('minOrderValueCents', e.target.value)}
              inputMode="decimal"
              maxLength={12}
              autoComplete="off"
              placeholder="0,00"
              trailing="€"
              className="tabular"
            />
          </Field>

          {type === 'percent' && (
            <Field
              label="Maximaler Rabattbetrag"
              error={errors.maxDiscountCents}
              description="Deckelt den Prozentrabatt nach oben. Leer oder 0 bedeutet: keine Deckelung."
            >
              <Input
                name="maxDiscountCents"
                value={values.maxDiscountCents}
                onChange={(e) => update('maxDiscountCents', e.target.value)}
                inputMode="decimal"
                maxLength={12}
                autoComplete="off"
                placeholder="0,00"
                trailing="€"
                className="tabular"
              />
            </Field>
          )}
        </FormSection>

        {/* 2 — Gültigkeit */}
        <FormSection
          title="Gültigkeit"
          description="Ohne Angaben gilt der Gutschein zeitlich unbegrenzt. Zeiten in Ortszeit."
        >
          <Field label="Gültig ab" error={errors.startsAt}>
            <Input
              name="startsAt"
              type="datetime-local"
              value={values.startsAt}
              onChange={(e) => update('startsAt', e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Gültig bis" error={errors.endsAt}>
            <Input
              name="endsAt"
              type="datetime-local"
              value={values.endsAt}
              onChange={(e) => update('endsAt', e.target.value)}
              className="tabular"
            />
          </Field>
        </FormSection>

        {/* 3 — Nutzung */}
        <FormSection
          title="Nutzung"
          description="Begrenzt, wie oft der Code insgesamt und je Kundin oder Kunde eingelöst werden darf."
        >
          <Field
            label="Nutzungslimit gesamt"
            error={errors.usageLimit}
            description={
              usageCount > 0
                ? `Bereits ${usageCount.toLocaleString('de-DE')}-mal eingelöst. 0 bedeutet: unbegrenzt.`
                : '0 oder leer bedeutet: unbegrenzt.'
            }
          >
            <Input
              name="usageLimit"
              value={values.usageLimit}
              onChange={(e) => update('usageLimit', e.target.value)}
              inputMode="numeric"
              maxLength={9}
              autoComplete="off"
              placeholder="0"
              className="tabular"
            />
          </Field>

          <Field
            label="Limit je Kunde"
            error={errors.perCustomerLimit}
            description="Gezählt wird je E-Mail-Adresse. 0 oder leer bedeutet: unbegrenzt."
          >
            <Input
              name="perCustomerLimit"
              value={values.perCustomerLimit}
              onChange={(e) => update('perCustomerLimit', e.target.value)}
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              placeholder="0"
              className="tabular"
            />
          </Field>

          <div className="sm:col-span-2">
            <Checkbox
              name="active"
              checked={values.active}
              onChange={(e) => update('active', e.target.checked)}
              label="Gutschein ist aktiv"
              description="Nur aktive Gutscheine werden im Warenkorb angenommen. Deaktivierte Codes lehnt der Shop mit einem Hinweis ab."
            />
          </div>
        </FormSection>

        {/* Vorschau */}
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle as="h2">Vorschau</CardTitle>
              <CardDescription>So wirkt der Gutschein nach dem Speichern.</CardDescription>
            </div>
          </CardHeader>
          <CardBody>
            {preview === null ? (
              <p className="text-sm text-ink-muted">
                Sobald ein gültiger Wert eingetragen ist, erscheint hier die Zusammenfassung.
              </p>
            ) : (
              <>
                <p className="font-display text-lg leading-snug font-semibold text-ink">{preview}</p>
                <p className="mt-1.5 text-sm text-ink-muted">{usageSentence}</p>
                {!values.active && (
                  <p className="mt-1.5 text-sm font-medium text-warning-700">
                    Derzeit deaktiviert — der Code wird im Shop abgelehnt.
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* Entfernen bzw. deaktivieren */}
        {mode === 'edit' && (
          <Card className="border-danger-100">
            <CardHeader>
              <div className="min-w-0">
                <CardTitle as="h2">Gutschein entfernen</CardTitle>
                <CardDescription>
                  {deletionBlocked
                    ? 'Eingelöste Gutscheine bleiben erhalten und werden stattdessen deaktiviert.'
                    : 'Ein noch nie eingelöster Gutschein kann vollständig gelöscht werden.'}
                </CardDescription>
              </div>
            </CardHeader>
            <CardBody className="flex flex-wrap items-center gap-4">
              {deletionBlocked ? (
                <>
                  <p className="flex min-w-0 flex-1 items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-500" aria-hidden="true" />
                    <span>
                      Dieser Gutschein wurde {redemptionCount.toLocaleString('de-DE')}-mal eingelöst. Die
                      Einlösungen begründen den Rabatt der zugehörigen Bestellungen und müssen erhalten
                      bleiben — Löschen ist deshalb nicht möglich.
                    </span>
                  </p>
                  {values.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void deactivate()}
                      loading={busyAction === 'deactivate'}
                      disabled={busyAction !== null}
                    >
                      <EyeOff className="size-4" aria-hidden="true" />
                      Gutschein deaktivieren
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft">
                    Der Code wird dauerhaft entfernt und steht danach zur Neuvergabe zur Verfügung.
                    Dieser Schritt lässt sich nicht rückgängig machen.
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                    disabled={busyAction !== null}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Gutschein löschen
                  </Button>
                </>
              )}
            </CardBody>
          </Card>
        )}

        {/* Aktionsleiste — bleibt am unteren Rand erreichbar. */}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-page)]/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <ButtonLink href="/admin/gutscheine" variant="ghost" size="sm">
            Abbrechen
          </ButtonLink>
          <div className="ml-auto flex items-center gap-2">
            <Button type="submit" size="sm" loading={saving} disabled={busyAction !== null}>
              {mode === 'create' ? 'Gutschein anlegen' : 'Änderungen speichern'}
            </Button>
          </div>
        </div>
      </form>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Gutschein endgültig löschen?"
        size="sm"
        dismissible={busyAction !== 'delete'}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={busyAction !== null}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void deleteCoupon()}
              loading={busyAction === 'delete'}
              disabled={busyAction !== null}
            >
              Endgültig löschen
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Der Gutschein „{values.code}“ wird vollständig entfernt. Kundinnen und Kunden, denen der Code
          bereits vorliegt, erhalten künftig die Meldung, dass der Code unbekannt ist.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Wurde der Code bereits verteilt, ist Deaktivieren der schonendere Weg: Der Gutschein bleibt in
          der Übersicht sichtbar und lässt sich jederzeit wieder freigeben.
        </p>
        {values.active && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void deactivate()}
            loading={busyAction === 'deactivate'}
            disabled={busyAction !== null}
          >
            <EyeOff className="size-4" aria-hidden="true" />
            Stattdessen deaktivieren
          </Button>
        )}
      </Dialog>
    </>
  )
}

/**
 * Baut denselben Satz, den auch die Liste und die Detailseite zeigen — aus den
 * noch ungeprueften Formularwerten. Ist der Wert unbrauchbar, gibt es keine
 * Vorschau statt einer erfundenen.
 */
function buildPreview(values: CouponFormValues): string | null {
  const type = values.type as CouponType
  let value = 0

  if (type === 'percent') {
    const bp = parsePercentToBp(values.value)
    if (bp === null || bp <= 0) return null
    value = bp
  } else if (type === 'fixed') {
    const cents = parsePriceToCents(values.value)
    if (cents === null || cents <= 0) return null
    value = cents
  } else if (type !== 'free_shipping') {
    return null
  }

  return describeCouponInWords({
    type,
    value,
    minOrderValueCents: moneyOrZero(values.minOrderValueCents),
    maxDiscountCents: type === 'percent' ? moneyOrZero(values.maxDiscountCents) : 0,
    startsAt: dateOrNull(values.startsAt),
    endsAt: dateOrNull(values.endsAt),
  })
}

function moneyOrZero(input: string): number {
  const trimmed = input.trim()
  if (trimmed.length === 0) return 0
  const cents = parsePriceToCents(trimmed)
  return cents !== null && cents > 0 ? cents : 0
}

function dateOrNull(input: string): Date | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle as="h2">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardBody className="grid gap-5 sm:grid-cols-2">{children}</CardBody>
    </Card>
  )
}

/**
 * Zeilenaktionen der Gutscheinliste.
 *
 * Bearbeiten ist ein echter Link, damit er sich in einem neuen Tab oeffnen
 * laesst. Der Schnellschalter erscheint nur mit der Berechtigung
 * `coupons:write` — geprueft wird sie zusaetzlich in der Route.
 */
export function CouponRowActions({
  couponId,
  code,
  active,
  canWrite,
}: {
  couponId: string
  code: string
  active: boolean
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function toggleActive() {
    setBusy(true)
    const result = await apiRequest<{ active: boolean; message?: string }>(
      `/api/admin/gutscheine/${couponId}`,
      { method: 'PATCH', body: { intent: 'activation', active: !active } },
    )
    setBusy(false)
    if (!result.ok) {
      toast.error(active ? 'Deaktivieren nicht möglich' : 'Aktivieren nicht möglich', result.error)
      return
    }
    toast.success(active ? 'Gutschein deaktiviert' : 'Gutschein aktiviert', result.data.message)
    router.refresh()
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <ButtonLink
        href={`/admin/gutscheine/${couponId}`}
        variant="ghost"
        size="sm"
        aria-label={`Gutschein „${code}“ bearbeiten`}
      >
        <Pencil className="size-4" aria-hidden="true" />
        <span className="hidden xl:inline">Bearbeiten</span>
      </ButtonLink>

      {canWrite && (
        <IconButton
          label={active ? `Gutschein „${code}“ deaktivieren` : `Gutschein „${code}“ aktivieren`}
          onClick={() => void toggleActive()}
          disabled={busy}
        >
          {active ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </IconButton>
      )}
    </div>
  )
}
