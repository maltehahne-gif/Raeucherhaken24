'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EyeOff, Mail, Send, StickyNote } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import {
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  type SupportPriority,
  type SupportStatus,
} from '@/lib/domain/enums'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, FormHint, OptionCard, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * Bearbeitung einer Supportanfrage: Status, Prioritaet, interne Notizen und
 * Antwortentwuerfe.
 *
 * Die Oberflaeche versendet grundsaetzlich keine E-Mail. Ein Antwortentwurf
 * wird ausschliesslich dokumentiert — der Versand erfolgt bis auf Weiteres von
 * Hand aus dem E-Mail-Programm. Dieser Umstand steht sichtbar an jedem
 * Eingabefeld, damit niemand einen Entwurf fuer eine gesendete Antwort haelt.
 *
 * Die angezeigten Moeglichkeiten richten sich nach der Berechtigung; die
 * verbindliche Pruefung erfolgt trotzdem in der API.
 */

const MAX_BODY_LENGTH = 5_000

interface SupportState {
  message: string
  status: SupportStatus
  priority: SupportPriority
}

/** Statuswechsel, nach denen die Anfrage als abgeschlossen gilt. */
const CLOSING_STATUSES: readonly SupportStatus[] = ['resolved', 'closed']

export interface SupportStatusFormProps {
  requestId: string
  ticketNumber: string
  status: SupportStatus
  priority: SupportPriority
  /** Berechtigung `support:write` des angemeldeten Kontos. */
  canWrite: boolean
}

export function SupportStatusForm({
  requestId,
  ticketNumber,
  status,
  priority,
  canWrite,
}: SupportStatusFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [nextStatus, setNextStatus] = useState<SupportStatus>(status)
  const [nextPriority, setNextPriority] = useState<SupportPriority>(priority)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Nach dem Speichern liefert der Server den neuen Zustand; die Auswahl folgt
  // ihm, damit das Formular nie einen veralteten Stand behauptet.
  useEffect(() => {
    setNextStatus(status)
    setNextPriority(priority)
    setErrors({})
    setFormError(null)
  }, [status, priority])

  const dirty = nextStatus !== status || nextPriority !== priority

  async function submit() {
    setBusy(true)
    setErrors({})
    setFormError(null)
    const result = await apiRequest<SupportState>(`/api/admin/support/${requestId}`, {
      method: 'PATCH',
      body: { action: 'status', status: nextStatus, priority: nextPriority },
    })
    setBusy(false)
    setConfirmOpen(false)

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      if (!result.fieldErrors) setFormError(result.error)
      toast.error('Die Änderung wurde nicht übernommen', result.error)
      return
    }

    toast.success(result.data.message, `Ticket ${ticketNumber}`)
    router.refresh()
  }

  if (!canWrite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Bearbeitung</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm">
          <p className="text-ink-soft">
            Status: <span className="font-medium text-ink">{SUPPORT_STATUS_LABELS[status]}</span>
          </p>
          <p className="text-ink-soft">
            Priorität: <span className="font-medium text-ink">{SUPPORT_PRIORITY_LABELS[priority]}</span>
          </p>
          <FormHint>
            Sie können diese Anfrage einsehen. Für Statuswechsel, Notizen und Antwortentwürfe fehlt
            Ihnen die Berechtigung „Support bearbeiten“.
          </FormHint>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Status und Priorität</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {formError && <FormError>{formError}</FormError>}

        <Field label="Bearbeitungsstatus" error={errors.status} required>
          <Select
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as SupportStatus)}
            disabled={busy}
          >
            {SUPPORT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Priorität"
          error={errors.priority}
          required
          description="Steuert die Reihenfolge in der Anfrageliste, nicht den Inhalt der Antwort."
        >
          <Select
            value={nextPriority}
            onChange={(e) => setNextPriority(e.target.value as SupportPriority)}
            disabled={busy}
          >
            {SUPPORT_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Button
          size="sm"
          loading={busy}
          disabled={!dirty}
          onClick={() => {
            // Abschliessende Status ausdruecklich bestaetigen lassen.
            if (CLOSING_STATUSES.includes(nextStatus) && !CLOSING_STATUSES.includes(status)) {
              setConfirmOpen(true)
              return
            }
            void submit()
          }}
        >
          Änderungen übernehmen
        </Button>

        {!dirty && (
          <p className="text-xs text-ink-faint">
            Status und Priorität entsprechen dem gespeicherten Stand.
          </p>
        )}
      </CardBody>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void submit()}
        loading={busy}
        title={`Anfrage ${ticketNumber} auf „${SUPPORT_STATUS_LABELS[nextStatus]}“ setzen?`}
        confirmLabel="Status setzen"
        description={
          `Die Anfrage gilt damit als abgeschlossen und rückt in der Liste hinter die offenen Vorgänge. ` +
          `Der Absender wird dadurch nicht benachrichtigt — eine Antwort müssen Sie separat versenden. ` +
          `Sie können den Status später wieder auf einen offenen Wert zurücksetzen.`
        }
      />
    </Card>
  )
}

export interface SupportComposerProps {
  requestId: string
  ticketNumber: string
  status: SupportStatus
  /** Berechtigung `support:write` des angemeldeten Kontos. */
  canWrite: boolean
}

export function SupportComposer({ requestId, ticketNumber, status, canWrite }: SupportComposerProps) {
  const router = useRouter()
  const toast = useToast()

  const [kind, setKind] = useState<'internal' | 'reply'>('internal')
  const [body, setBody] = useState('')
  const [startProgress, setStartProgress] = useState(status === 'new')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => setStartProgress(status === 'new'), [status])

  async function submit() {
    setBusy(true)
    setErrors({})
    setFormError(null)
    const result = await apiRequest<SupportState>(`/api/admin/support/${requestId}`, {
      method: 'PATCH',
      body: {
        action: 'message',
        kind,
        body,
        startProgress: status === 'new' ? startProgress : false,
      },
    })
    setBusy(false)

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      if (!result.fieldErrors) setFormError(result.error)
      toast.error('Der Eintrag wurde nicht gespeichert', result.error)
      return
    }

    setBody('')
    toast.success(result.data.message, `Ticket ${ticketNumber}`)
    router.refresh()
  }

  if (!canWrite) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Notiz oder Antwortentwurf erfassen</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {formError && <FormError>{formError}</FormError>}

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-ink">Art des Eintrags</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <OptionCard
              name="support-entry-kind"
              value="internal"
              checked={kind === 'internal'}
              onChange={() => setKind('internal')}
              disabled={busy}
              label="Interne Notiz"
              description="Nur für den Betrieb sichtbar. Erreicht den Absender nie."
            />
            <OptionCard
              name="support-entry-kind"
              value="reply"
              checked={kind === 'reply'}
              onChange={() => setKind('reply')}
              disabled={busy}
              label="Antwortentwurf"
              description="Text, der an den Absender gehen soll. Wird hier nur festgehalten."
            />
          </div>
        </fieldset>

        <Field
          label={kind === 'reply' ? 'Antwortentwurf an den Absender' : 'Interne Notiz'}
          error={errors.body}
          required
          hint={`${body.length.toLocaleString('de-DE')} von ${MAX_BODY_LENGTH.toLocaleString('de-DE')} Zeichen`}
          description={
            kind === 'reply'
              ? 'Formulieren Sie den Text so, wie der Absender ihn lesen soll.'
              : 'Absprachen, Rückfragen an Kolleginnen und Kollegen, Zwischenstände.'
          }
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={busy}
            rows={6}
            maxLength={MAX_BODY_LENGTH}
            placeholder={
              kind === 'reply'
                ? 'Guten Tag …'
                : 'Zum Beispiel: Rückfrage zur Chargennummer telefonisch geklärt.'
            }
          />
        </Field>

        {status === 'new' && (
          <Checkbox
            label="Anfrage zugleich auf „In Bearbeitung“ setzen"
            description="Macht für alle sichtbar, dass sich jemand des Vorgangs angenommen hat."
            checked={startProgress}
            onChange={(e) => setStartProgress(e.target.checked)}
            disabled={busy}
          />
        )}

        <MailDeliveryHint kind={kind} />

        <Button size="sm" loading={busy} disabled={body.trim().length === 0} onClick={() => void submit()}>
          {kind === 'reply' ? (
            <Send className="size-4" aria-hidden="true" />
          ) : (
            <StickyNote className="size-4" aria-hidden="true" />
          )}
          {kind === 'reply' ? 'Antwortentwurf speichern' : 'Notiz speichern'}
        </Button>
      </CardBody>
    </Card>
  )
}

/**
 * Der Hinweis auf den fehlenden Mailversand gehoert unmittelbar an das
 * Eingabefeld — nicht in eine Fussnote, die niemand liest.
 */
function MailDeliveryHint({ kind }: { kind: 'internal' | 'reply' }) {
  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-paper-sunken/70 px-4 py-3 text-xs leading-relaxed text-ink-muted">
      {kind === 'reply' ? (
        <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span>
        {kind === 'reply' ? (
          <>
            Diese Anwendung versendet keine E-Mails. Der automatische Versand setzt einen
            konfigurierten Mailserver voraus, der derzeit nicht eingerichtet ist. Der Entwurf wird
            nur gespeichert — bitte versenden Sie ihn aus Ihrem E-Mail-Programm.
          </>
        ) : (
          <>
            Interne Notizen sind ausschließlich für den Betrieb bestimmt. Sie erscheinen weder in
            E-Mails noch an irgendeiner Stelle für den Absender der Anfrage.
          </>
        )}
      </span>
    </p>
  )
}
