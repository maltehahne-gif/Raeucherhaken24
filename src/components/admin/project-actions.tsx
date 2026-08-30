'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EyeOff } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain/enums'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Field, FormError, FormHint, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * Bearbeitung einer Sonderanfertigung: Status und interne Notiz.
 *
 * Der Statuswechsel ist frei waehlbar — eine Sonderanfertigung durchlaeuft die
 * Stufen nicht zwingend in fester Reihenfolge (ein Angebot kann etwa direkt
 * abgelehnt werden). Fuer die Ablehnung wird ausdruecklich nachgefragt, weil
 * sie den Vorgang gegenueber dem Anfragenden beendet.
 *
 * Die Notiz ist rein intern; der Hinweis darauf steht am Feld selbst.
 */

const MAX_NOTE_LENGTH = 5_000

interface ProjectState {
  message: string
  status: ProjectStatus
  internalNote: string
}

export interface ProjectActionsProps {
  projectId: string
  projectNumber: string
  status: ProjectStatus
  initialNote: string
  /** Berechtigung `projects:write` des angemeldeten Kontos. */
  canWrite: boolean
}

export function ProjectActions({
  projectId,
  projectNumber,
  status,
  initialNote,
  canWrite,
}: ProjectActionsProps) {
  const router = useRouter()
  const toast = useToast()

  // --- Status ---------------------------------------------------------------
  const [nextStatus, setNextStatus] = useState<ProjectStatus>(status)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusErrors, setStatusErrors] = useState<Record<string, string>>({})
  const [statusFormError, setStatusFormError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Nach dem Speichern liefert der Server den neuen Zustand; die Auswahl folgt
  // ihm, damit das Formular nie einen veralteten Stand behauptet.
  useEffect(() => {
    setNextStatus(status)
    setStatusErrors({})
    setStatusFormError(null)
  }, [status])

  // --- Interne Notiz --------------------------------------------------------
  const [note, setNote] = useState(initialNote)
  const [savedNote, setSavedNote] = useState(initialNote)
  const [noteBusy, setNoteBusy] = useState(false)
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({})
  const [noteFormError, setNoteFormError] = useState<string | null>(null)

  useEffect(() => {
    setNote(initialNote)
    setSavedNote(initialNote)
  }, [initialNote])

  async function submitStatus() {
    setStatusBusy(true)
    setStatusErrors({})
    setStatusFormError(null)
    const result = await apiRequest<ProjectState>(`/api/admin/projekte/${projectId}`, {
      method: 'PATCH',
      body: { action: 'status', status: nextStatus },
    })
    setStatusBusy(false)
    setConfirmOpen(false)

    if (!result.ok) {
      setStatusErrors(result.fieldErrors ?? {})
      if (!result.fieldErrors) setStatusFormError(result.error)
      toast.error('Der Statuswechsel wurde nicht ausgeführt', result.error)
      return
    }

    toast.success(result.data.message, `Projekt ${projectNumber}`)
    router.refresh()
  }

  async function submitNote() {
    setNoteBusy(true)
    setNoteErrors({})
    setNoteFormError(null)
    const result = await apiRequest<ProjectState>(`/api/admin/projekte/${projectId}`, {
      method: 'PATCH',
      body: { action: 'note', internalNote: note },
    })
    setNoteBusy(false)

    if (!result.ok) {
      setNoteErrors(result.fieldErrors ?? {})
      if (!result.fieldErrors) setNoteFormError(result.error)
      toast.error('Die Notiz wurde nicht gespeichert', result.error)
      return
    }

    setNote(result.data.internalNote)
    setSavedNote(result.data.internalNote)
    toast.success(result.data.message, `Projekt ${projectNumber}`)
    router.refresh()
  }

  if (!canWrite) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h2">Bearbeitung</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <p className="text-ink-soft">
            Status: <span className="font-medium text-ink">{PROJECT_STATUS_LABELS[status]}</span>
          </p>
          <div>
            <p className="text-2xs font-semibold tracking-wider text-ink-muted uppercase">
              Interne Notiz
            </p>
            {savedNote.length === 0 ? (
              <p className="mt-1.5 text-sm text-ink-faint">Keine Notiz hinterlegt.</p>
            ) : (
              <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">
                {savedNote}
              </p>
            )}
          </div>
          <FormHint>
            Sie können dieses Projekt einsehen. Für Statuswechsel und Notizen fehlt Ihnen die
            Berechtigung „Sonderanfertigungen bearbeiten“.
          </FormHint>
        </CardBody>
      </Card>
    )
  }

  const noteDirty = note !== savedNote

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Status</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {statusFormError && <FormError>{statusFormError}</FormError>}

          <Field
            label="Bearbeitungsstand"
            error={statusErrors.status}
            required
            description="Bestimmt, wie das Projekt in der Übersicht geführt wird."
          >
            <Select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as ProjectStatus)}
              disabled={statusBusy}
            >
              {PROJECT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {PROJECT_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Button
            size="sm"
            loading={statusBusy}
            disabled={nextStatus === status}
            onClick={() => {
              // Die Ablehnung beendet den Vorgang — dafuer wird nachgefragt.
              if (nextStatus === 'rejected') {
                setConfirmOpen(true)
                return
              }
              void submitStatus()
            }}
          >
            Status übernehmen
          </Button>

          {nextStatus === status && (
            <p className="text-xs text-ink-faint">Der Status entspricht dem gespeicherten Stand.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Interne Notiz</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {noteFormError && <FormError>{noteFormError}</FormError>}

          <p className="flex items-start gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-paper-sunken/70 px-4 py-3 text-xs leading-relaxed text-ink-muted">
            <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Die Notiz ist ausschließlich für den Betrieb bestimmt. Sie erscheint weder im Angebot
              noch in einer E-Mail an den Anfragenden.
            </span>
          </p>

          <Field
            label="Notiz zur Fertigung"
            hideLabel
            error={noteErrors.internalNote}
            hint={`${note.length.toLocaleString('de-DE')} von ${MAX_NOTE_LENGTH.toLocaleString('de-DE')} Zeichen`}
          >
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={noteBusy}
              rows={8}
              maxLength={MAX_NOTE_LENGTH}
              placeholder="Zum Beispiel: Materialstärke mit der Werkstatt abgestimmt, Muster am 12.03. versandt."
            />
          </Field>
        </CardBody>
        <CardFooter>
          <span className="mr-auto text-xs text-ink-faint" aria-live="polite">
            {noteDirty ? 'Nicht gespeicherte Änderungen' : 'Alle Änderungen gespeichert'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNote(savedNote)
              setNoteErrors({})
              setNoteFormError(null)
            }}
            disabled={noteBusy || !noteDirty}
          >
            Verwerfen
          </Button>
          <Button size="sm" loading={noteBusy} disabled={!noteDirty} onClick={() => void submitNote()}>
            Notiz speichern
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void submitStatus()}
        loading={statusBusy}
        destructive
        title={`Projekt ${projectNumber} ablehnen?`}
        confirmLabel="Projekt ablehnen"
        description={
          'Das Projekt wird als abgelehnt geführt und verschwindet aus den offenen Vorgängen. ' +
          'Anfrage, technische Angaben und Anhänge bleiben vollständig erhalten, und Sie können den ' +
          'Status jederzeit wieder ändern. Der Anfragende wird dadurch nicht benachrichtigt — die ' +
          'Absage müssen Sie selbst versenden.'
        }
      />
    </div>
  )
}
