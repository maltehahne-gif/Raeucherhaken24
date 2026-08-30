'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, RotateCcw } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { formatPrice } from '@/lib/money'
import {
  CARRIERS,
  CARRIER_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/domain/enums'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, FormHint, Input, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * Aktionsbereich der Bestelldetailseite.
 *
 * Angeboten wird nur, was fachlich und rechtlich möglich ist: Statuswechsel
 * ausschließlich entlang der erlaubten Übergänge, Stornierung und Erstattung
 * nur mit der jeweiligen Berechtigung. Die endgültige Prüfung erfolgt trotzdem
 * serverseitig — diese Oberfläche ist kein Schutzmechanismus, sondern eine
 * Arbeitshilfe.
 */

/** Zahlungsstati, die von Hand gesetzt werden dürfen. Erstattungen laufen über den eigenen Dialog. */
const PAYMENT_TARGETS: readonly PaymentStatus[] = ['pending', 'paid', 'failed']

interface ApiState {
  message: string
  status: string | null
  paymentStatus: string | null
  refundedCents: number
}

export interface OrderActionsProps {
  orderId: string
  orderNumber: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  totalCents: number
  refundedCents: number
  carrier: string | null
  trackingNumber: string | null
  couponCode: string | null
  canWrite: boolean
  canCancel: boolean
  canRefund: boolean
}

export function OrderActions({
  orderId,
  orderNumber,
  status,
  paymentStatus,
  totalCents,
  refundedCents,
  carrier,
  trackingNumber,
  couponCode,
  canWrite,
  canCancel,
  canRefund,
}: OrderActionsProps) {
  const router = useRouter()
  const toast = useToast()

  const allowed = ORDER_STATUS_TRANSITIONS[status]
  const forwardTransitions = allowed.filter((target) => target !== 'cancelled')
  const cancellable = allowed.includes('cancelled')
  const refundable = totalCents - refundedCents

  // --- Bearbeitungsstatus ---------------------------------------------------
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>(forwardTransitions[0] ?? '')
  const [statusNote, setStatusNote] = useState('')
  const [carrierValue, setCarrierValue] = useState(carrier ?? '')
  const [trackingValue, setTrackingValue] = useState(trackingNumber ?? '')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusErrors, setStatusErrors] = useState<Record<string, string>>({})
  const [statusFormError, setStatusFormError] = useState<string | null>(null)

  // Nach einem erfolgreichen Wechsel liefert der Server einen neuen Zustand —
  // die Auswahl muss dann wieder auf den ersten möglichen Folgeschritt zeigen.
  useEffect(() => {
    setNextStatus(ORDER_STATUS_TRANSITIONS[status].filter((t) => t !== 'cancelled')[0] ?? '')
    setStatusNote('')
    setStatusErrors({})
    setStatusFormError(null)
  }, [status])

  // --- Zahlung --------------------------------------------------------------
  const [nextPayment, setNextPayment] = useState<PaymentStatus>(
    PAYMENT_TARGETS.find((p) => p !== paymentStatus) ?? 'paid',
  )
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({})
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null)

  useEffect(() => {
    setNextPayment(PAYMENT_TARGETS.find((p) => p !== paymentStatus) ?? 'paid')
    setPaymentNote('')
    setPaymentErrors({})
    setPaymentFormError(null)
  }, [paymentStatus])

  // --- Dialoge --------------------------------------------------------------
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundRestock, setRefundRestock] = useState(false)
  const [refundNote, setRefundNote] = useState('')
  const [refundBusy, setRefundBusy] = useState(false)
  const [refundErrors, setRefundErrors] = useState<Record<string, string>>({})
  const [refundFormError, setRefundFormError] = useState<string | null>(null)

  async function send(body: Record<string, unknown>) {
    return apiRequest<ApiState>(`/api/admin/bestellungen/${orderId}`, { method: 'PATCH', body })
  }

  async function submitStatus() {
    if (nextStatus === '') return
    setStatusBusy(true)
    setStatusErrors({})
    setStatusFormError(null)
    const result = await send({
      action: 'status',
      status: nextStatus,
      note: statusNote,
      carrier: carrierValue,
      trackingNumber: trackingValue,
    })
    setStatusBusy(false)
    if (!result.ok) {
      setStatusErrors(result.fieldErrors ?? {})
      if (!result.fieldErrors) setStatusFormError(result.error)
      toast.error('Der Statuswechsel wurde nicht ausgeführt', result.error)
      return
    }
    toast.success(result.data.message)
    router.refresh()
  }

  async function submitPayment() {
    setPaymentBusy(true)
    setPaymentErrors({})
    setPaymentFormError(null)
    const result = await send({ action: 'payment', paymentStatus: nextPayment, note: paymentNote })
    setPaymentBusy(false)
    if (!result.ok) {
      setPaymentErrors(result.fieldErrors ?? {})
      if (!result.fieldErrors) setPaymentFormError(result.error)
      toast.error('Der Zahlungsstatus wurde nicht geändert', result.error)
      return
    }
    toast.success(result.data.message)
    router.refresh()
  }

  async function submitCancel() {
    setCancelBusy(true)
    setCancelError(null)
    const result = await send({ action: 'status', status: 'cancelled', note: cancelNote })
    setCancelBusy(false)
    if (!result.ok) {
      setCancelError(result.fieldErrors?.status ?? result.error)
      return
    }
    setCancelOpen(false)
    setCancelNote('')
    toast.success(result.data.message)
    router.refresh()
  }

  async function submitRefund() {
    setRefundBusy(true)
    setRefundErrors({})
    setRefundFormError(null)
    const result = await send({
      action: 'refund',
      amount: refundAmount,
      restock: refundRestock,
      note: refundNote,
    })
    setRefundBusy(false)
    if (!result.ok) {
      setRefundErrors(result.fieldErrors ?? {})
      if (!result.fieldErrors) setRefundFormError(result.error)
      return
    }
    setRefundOpen(false)
    setRefundAmount('')
    setRefundRestock(false)
    setRefundNote('')
    toast.success(result.data.message)
    router.refresh()
  }

  if (!canWrite && !canCancel && !canRefund) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Bearbeitung</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-ink-muted">
            Sie können diese Bestellung einsehen. Für Statuswechsel, Stornierungen und Erstattungen
            fehlen Ihnen die Berechtigungen.
          </p>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Bearbeitungsstatus</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {forwardTransitions.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {status === 'cancelled'
                  ? 'Die Bestellung ist storniert. Weitere Bearbeitungsschritte sind nicht vorgesehen.'
                  : `Die Bestellung ist mit „${ORDER_STATUS_LABELS[status]}“ abgeschlossen. Ein weiterer Schritt ist nicht vorgesehen.`}
              </p>
            ) : (
              <>
                {statusFormError && <FormError>{statusFormError}</FormError>}

                <Field label="Nächster Schritt" error={statusErrors.status} required>
                  <Select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
                    disabled={statusBusy}
                  >
                    {forwardTransitions.map((target) => (
                      <option key={target} value={target}>
                        {ORDER_STATUS_LABELS[target]}
                      </option>
                    ))}
                  </Select>
                </Field>

                {nextStatus === 'shipped' && (
                  <>
                    <Field label="Versanddienstleister" error={statusErrors.carrier} required>
                      <Select
                        value={carrierValue}
                        onChange={(e) => setCarrierValue(e.target.value)}
                        disabled={statusBusy}
                      >
                        <option value="">Bitte wählen …</option>
                        {CARRIERS.map((value) => (
                          <option key={value} value={value}>
                            {CARRIER_LABELS[value]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label="Sendungsnummer"
                      error={statusErrors.trackingNumber}
                      required
                      description="Wird auf der Bestellung hinterlegt und für die Sendungsverfolgung verwendet."
                    >
                      <Input
                        value={trackingValue}
                        onChange={(e) => setTrackingValue(e.target.value)}
                        disabled={statusBusy}
                        maxLength={60}
                        autoComplete="off"
                      />
                    </Field>
                  </>
                )}

                <Field label="Interne Notiz" error={statusErrors.note} hint="Optional">
                  <Textarea
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    disabled={statusBusy}
                    rows={2}
                    maxLength={500}
                    placeholder="Wird in der Statushistorie vermerkt."
                  />
                </Field>

                <Button size="sm" loading={statusBusy} onClick={() => void submitStatus()}>
                  Status übernehmen
                </Button>
              </>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Zahlung</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-ink-soft">
            Aktuell: <span className="font-medium text-ink">{PAYMENT_STATUS_LABELS[paymentStatus]}</span>
            {refundedCents > 0 && (
              <>
                {' · '}
                bereits erstattet: <span className="tabular font-medium">{formatPrice(refundedCents)}</span>
              </>
            )}
          </p>

          {canWrite &&
            (refundedCents > 0 ? (
              <FormHint>
                Für diese Bestellung wurde bereits eine Erstattung erfasst. Der Zahlungsstatus ergibt
                sich daraus und wird nicht mehr von Hand gesetzt.
              </FormHint>
            ) : (
              <>
                {paymentFormError && <FormError>{paymentFormError}</FormError>}
                <Field label="Zahlungsstatus setzen" error={paymentErrors.paymentStatus} required>
                  <Select
                    value={nextPayment}
                    onChange={(e) => setNextPayment(e.target.value as PaymentStatus)}
                    disabled={paymentBusy}
                  >
                    {PAYMENT_TARGETS.map((value) => (
                      <option key={value} value={value}>
                        {PAYMENT_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Interne Notiz" error={paymentErrors.note} hint="Optional">
                  <Textarea
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    disabled={paymentBusy}
                    rows={2}
                    maxLength={500}
                    placeholder="Zum Beispiel Zahlungseingang laut Kontoauszug."
                  />
                </Field>
                <Button size="sm" loading={paymentBusy} onClick={() => void submitPayment()}>
                  Zahlungsstatus übernehmen
                </Button>
              </>
            ))}

          {canRefund && (
            <div className="border-t border-[var(--border-subtle)] pt-4">
              {refundable > 0 ? (
                <>
                  <p className="mb-3 text-sm text-ink-muted">
                    Noch erstattbar: <span className="tabular font-medium text-ink">{formatPrice(refundable)}</span>
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRefundErrors({})
                      setRefundFormError(null)
                      setRefundOpen(true)
                    }}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    Erstattung erfassen
                  </Button>
                </>
              ) : (
                <p className="text-sm text-ink-muted">
                  Diese Bestellung ist vollständig erstattet.
                </p>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {canCancel && cancellable && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Stornierung</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-ink-muted">
              Eine Stornierung beendet die Bestellung endgültig. Sie lässt sich nicht rückgängig machen.
            </p>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setCancelError(null)
                setCancelOpen(true)
              }}
            >
              <Ban className="size-4" aria-hidden="true" />
              Bestellung stornieren
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Stornierung: Folgen ausdrücklich benennen, bevor bestätigt wird. */}
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Bestellung ${orderNumber} stornieren?`}
        size="sm"
        dismissible={!cancelBusy}
        footer={
          <>
            <Button variant="outline" size="sm" disabled={cancelBusy} onClick={() => setCancelOpen(false)}>
              Abbrechen
            </Button>
            <Button variant="danger" size="sm" loading={cancelBusy} onClick={() => void submitCancel()}>
              Endgültig stornieren
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {cancelError && <FormError>{cancelError}</FormError>}
          <p className="text-sm leading-relaxed text-ink-soft">Mit der Stornierung geschieht Folgendes:</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
            <li>
              Alle noch nicht zurückgebuchten Positionen werden dem Lagerbestand wieder gutgeschrieben
              und im Bestandsjournal als Rückbuchung erfasst.
            </li>
            <li>
              {couponCode
                ? `Die Einlösung des Gutscheins „${couponCode}“ wird freigegeben — der Code ist danach wieder verwendbar.`
                : 'Eine hinterlegte Gutscheineinlösung wird freigegeben, der Code ist danach wieder verwendbar.'}
            </li>
            <li>
              Bestellanzahl und Umsatz der Kundenakte werden um diese Bestellung
              ({formatPrice(totalCents)}) verringert.
            </li>
            <li>Der Vorgang ist endgültig und lässt sich nicht zurücknehmen.</li>
          </ul>
          <Field label="Interne Notiz zur Stornierung" hint="Optional">
            <Textarea
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              disabled={cancelBusy}
              rows={2}
              maxLength={500}
              placeholder="Grund der Stornierung, z. B. Kundenwunsch."
            />
          </Field>
        </div>
      </Dialog>

      {/* Erstattung */}
      <Dialog
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Erstattung erfassen"
        description={`Bestellung ${orderNumber} · noch erstattbar ${formatPrice(refundable)}`}
        size="sm"
        dismissible={!refundBusy}
        footer={
          <>
            <Button variant="outline" size="sm" disabled={refundBusy} onClick={() => setRefundOpen(false)}>
              Abbrechen
            </Button>
            <Button size="sm" loading={refundBusy} onClick={() => void submitRefund()}>
              Erstattung buchen
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {refundFormError && <FormError>{refundFormError}</FormError>}
          <Field
            label="Erstattungsbetrag in Euro"
            error={refundErrors.amount}
            required
            description="Bereits erstattete Beträge sind abgezogen. Beispiel: 24,90"
          >
            <Input
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              disabled={refundBusy}
              inputMode="decimal"
              autoComplete="off"
              placeholder={formatPrice(refundable).replace(' €', '')}
              trailing={<span className="text-sm">€</span>}
            />
          </Field>
          <Checkbox
            label="Ware zurück ins Lager buchen"
            description="Bucht alle noch nicht zurückgegebenen Positionen dieser Bestellung dem Bestand gut."
            checked={refundRestock}
            onChange={(e) => setRefundRestock(e.target.checked)}
            disabled={refundBusy}
            error={refundErrors.restock}
          />
          <Field label="Interne Notiz zur Erstattung" error={refundErrors.note} hint="Optional">
            <Textarea
              value={refundNote}
              onChange={(e) => setRefundNote(e.target.value)}
              disabled={refundBusy}
              rows={2}
              maxLength={500}
              placeholder="Zum Beispiel Retoure eingetroffen, Ware einwandfrei."
            />
          </Field>
        </div>
      </Dialog>
    </div>
  )
}
