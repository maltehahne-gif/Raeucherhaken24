'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, History, Minus, Plus, X } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { formatNumber } from '@/lib/money'
import { cn } from '@/lib/utils/cn'
import { StockBadge } from '@/components/admin/status-badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Field, FormError, Input, Select } from '@/components/ui/field'
import { SortableTh, Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'

/**
 * Bestandsliste mit Einzel- und Sammelbearbeitung.
 *
 * Die Liste rendert im Client, weil Auswahl und Eingaben einen gemeinsamen
 * Zustand brauchen. Filter, Sortierung und Seite bleiben dagegen in der URL und
 * werden serverseitig ausgewertet — die Spaltenköpfe sind echte Links.
 *
 * Alles, was hier angeboten wird, prüft der Server erneut: Diese Oberfläche ist
 * eine Arbeitshilfe, kein Schutz.
 */

export interface StockEditorRow {
  id: string
  name: string
  sku: string
  articleNumber: string
  categoryName: string
  stock: number
  reservedStock: number
  lowStockThreshold: number
  allowBackorder: boolean
  active: boolean
}

export interface StockSortLink {
  href: string
  active: boolean
  direction: 'asc' | 'desc'
}

type BulkMode = 'set' | 'increase' | 'decrease'

const BULK_MODE_LABELS: Record<BulkMode, string> = {
  set: 'Auf festen Wert setzen',
  increase: 'Bestand erhöhen um',
  decrease: 'Bestand verringern um',
}

interface RowError {
  stock?: string
  lowStockThreshold?: string
  form?: string
}

interface EditorState {
  /** Rohtext der Eingabefelder, nur für angefasste Zeilen. */
  edits: Record<string, { stock: string; threshold: string }>
  /** Zuletzt erfolgreich gespeicherte Werte — Bezugsgröße bis zum Neuladen. */
  saved: Record<string, { stock: number; threshold: number }>
  selected: string[]
  errors: Record<string, RowError>
}

const EMPTY_STATE: EditorState = { edits: {}, saved: {}, selected: [], errors: {} }

interface SingleResponse {
  productId: string
  stock: number
  lowStockThreshold: number
  delta: number
  message: string
}

interface BulkResponse {
  changed: number
  unchanged: number
  clamped: number
  message: string
}

export function StockEditor({
  rows,
  canWrite,
  nameSort,
  stockSort,
  thresholdSort,
}: {
  rows: StockEditorRow[]
  canWrite: boolean
  nameSort: StockSortLink
  stockSort: StockSortLink
  thresholdSort: StockSortLink
}) {
  const router = useRouter()
  const toast = useToast()

  const [state, setState] = useState<EditorState>(EMPTY_STATE)
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const [bulkMode, setBulkMode] = useState<BulkMode>('set')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkErrors, setBulkErrors] = useState<{ value?: string; form?: string }>({})
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Kommen neue Daten vom Server (Seitenwechsel, Filter, Neuladen), verlieren
  // Auswahl und Zwischenstände ihren Bezug und werden verworfen.
  const rowsKey = rows.map((row) => `${row.id}:${row.stock}:${row.lowStockThreshold}`).join('|')
  const previousKey = useRef(rowsKey)
  if (previousKey.current !== rowsKey) {
    previousKey.current = rowsKey
    setState(EMPTY_STATE)
    setBusyRow(null)
  }

  const selected = new Set(state.selected)
  const selectedRows = rows.filter((row) => selected.has(row.id))

  function baseline(row: StockEditorRow) {
    return state.saved[row.id] ?? { stock: row.stock, threshold: row.lowStockThreshold }
  }

  function draft(row: StockEditorRow) {
    const base = baseline(row)
    return (
      state.edits[row.id] ?? { stock: String(base.stock), threshold: String(base.threshold) }
    )
  }

  function isDirty(row: StockEditorRow): boolean {
    const base = baseline(row)
    const current = draft(row)
    return current.stock !== String(base.stock) || current.threshold !== String(base.threshold)
  }

  function setDraft(row: StockEditorRow, patch: Partial<{ stock: string; threshold: string }>) {
    // Bezugsgroesse aus dem Aktualisierungsschritt lesen, damit zwei schnelle
    // Eingaben in derselben Zeile sich nicht gegenseitig ueberschreiben.
    setState((current) => {
      const base = current.saved[row.id] ?? { stock: row.stock, threshold: row.lowStockThreshold }
      const existing = current.edits[row.id] ?? {
        stock: String(base.stock),
        threshold: String(base.threshold),
      }
      return { ...current, edits: { ...current.edits, [row.id]: { ...existing, ...patch } } }
    })
  }

  function toggleRow(id: string, checked: boolean) {
    setState((current) => ({
      ...current,
      selected: checked
        ? [...current.selected, id]
        : current.selected.filter((entry) => entry !== id),
    }))
  }

  function toggleAll(checked: boolean) {
    setState((current) => ({ ...current, selected: checked ? rows.map((row) => row.id) : [] }))
  }

  async function saveRow(row: StockEditorRow) {
    const current = draft(row)
    setBusyRow(row.id)
    setState((prev) => ({ ...prev, errors: { ...prev.errors, [row.id]: {} } }))

    const result = await apiRequest<SingleResponse>('/api/admin/lager', {
      method: 'PATCH',
      body: {
        action: 'single',
        productId: row.id,
        stock: current.stock,
        lowStockThreshold: current.threshold,
        note,
      },
    })
    setBusyRow(null)

    if (!result.ok) {
      const fieldErrors = result.fieldErrors ?? {}
      const stockError = fieldErrors.stock
      const thresholdError = fieldErrors.lowStockThreshold
      setState((prev) => ({
        ...prev,
        errors: {
          ...prev.errors,
          [row.id]: {
            stock: stockError,
            lowStockThreshold: thresholdError,
            // Alles, was sich keinem der beiden Felder zuordnen laesst, muss
            // trotzdem an der Zeile stehen — sonst bliebe der Fehler unsichtbar.
            form: stockError || thresholdError ? undefined : result.error,
          },
        },
      }))
      toast.error('Die Buchung wurde nicht gespeichert', result.error)
      return
    }

    const { productId, stock, lowStockThreshold } = result.data
    setState((prev) => {
      const edits = { ...prev.edits }
      delete edits[productId]
      const errors = { ...prev.errors }
      delete errors[productId]
      return {
        ...prev,
        edits,
        errors,
        saved: { ...prev.saved, [productId]: { stock, threshold: lowStockThreshold } },
      }
    })
    toast.success(result.data.message)
  }

  // --- Sammelaenderung ------------------------------------------------------
  const parsedBulkValue = Number.parseInt(bulkValue.trim(), 10)
  const bulkValueValid =
    /^\d+$/.test(bulkValue.trim()) && Number.isFinite(parsedBulkValue) &&
    (bulkMode === 'set' ? parsedBulkValue >= 0 : parsedBulkValue >= 1)

  const preview = selectedRows.map((row) => {
    const from = baseline(row).stock
    const raw =
      bulkMode === 'set'
        ? parsedBulkValue
        : bulkMode === 'increase'
          ? from + parsedBulkValue
          : from - parsedBulkValue
    return { from, to: Math.max(0, raw), clamped: raw < 0 }
  })
  const previewChanged = preview.filter((entry) => entry.to !== entry.from).length
  const previewClamped = preview.filter((entry) => entry.clamped).length

  function openConfirm() {
    if (selectedRows.length === 0) return
    if (!bulkValueValid) {
      setBulkErrors({
        value:
          bulkMode === 'set'
            ? 'Bitte geben Sie eine ganze Zahl ab 0 an.'
            : 'Bitte geben Sie eine ganze Zahl ab 1 an.',
      })
      return
    }
    setBulkErrors({})
    setConfirmOpen(true)
  }

  async function submitBulk() {
    setBulkBusy(true)
    setBulkErrors({})

    const result = await apiRequest<BulkResponse>('/api/admin/lager', {
      method: 'PATCH',
      body: {
        action: 'bulk',
        mode: bulkMode,
        value: bulkValue.trim(),
        productIds: selectedRows.map((row) => row.id),
        note,
      },
    })
    setBulkBusy(false)

    if (!result.ok) {
      setConfirmOpen(false)
      setBulkErrors({
        value: result.fieldErrors?.value,
        form: result.fieldErrors?.value ? undefined : result.error,
      })
      toast.error('Die Sammeländerung wurde nicht ausgeführt', result.error)
      return
    }

    setConfirmOpen(false)
    setBulkValue('')
    setState((current) => ({ ...current, selected: [] }))
    toast.success('Sammeländerung ausgeführt', result.data.message)
    // Neu laden, damit Filter, Sortierung und Kennzahlen wieder stimmen.
    router.refresh()
  }

  const confirmDescription = buildConfirmDescription({
    count: selectedRows.length,
    mode: bulkMode,
    value: parsedBulkValue,
    changed: previewChanged,
    clamped: previewClamped,
    note: note.trim(),
  })

  const allSelected = rows.length > 0 && selectedRows.length === rows.length
  const someSelected = selectedRows.length > 0 && !allSelected

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field
              label="Notiz für Ihre Buchungen"
              description="Wird bei jeder Buchung dieser Seite im Bestandsjournal gespeichert, etwa „Inventur“ oder „Wareneingang Lieferschein 4711“."
              hint="Optional"
            >
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={240}
                placeholder="Grund der Buchung"
                className="h-10"
              />
            </Field>
            <p className="text-xs text-ink-muted sm:pb-3">
              {selectedRows.length === 0
                ? 'Wählen Sie Zeilen aus, um mehrere Artikel gemeinsam zu buchen.'
                : `${formatNumber(selectedRows.length)} von ${formatNumber(rows.length)} Zeilen ausgewählt`}
            </p>
          </div>

          {selectedRows.length > 0 && (
            <div className="mt-4 space-y-3 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Art der Änderung" className="min-w-[14rem] flex-1">
                  <Select
                    value={bulkMode}
                    onChange={(event) => setBulkMode(event.target.value as BulkMode)}
                    className="h-10"
                  >
                    {(Object.keys(BULK_MODE_LABELS) as BulkMode[]).map((mode) => (
                      <option key={mode} value={mode}>
                        {BULK_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Stückzahl" error={bulkErrors.value} className="w-32">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={bulkMode === 'set' ? 0 : 1}
                    step={1}
                    value={bulkValue}
                    onChange={(event) => setBulkValue(event.target.value)}
                    className="tabular h-10"
                  />
                </Field>

                <Button size="sm" onClick={openConfirm} disabled={bulkBusy}>
                  {bulkMode === 'decrease' ? (
                    <Minus className="size-4" aria-hidden="true" />
                  ) : (
                    <Plus className="size-4" aria-hidden="true" />
                  )}
                  Auf {formatNumber(selectedRows.length)} Artikel anwenden
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setState((current) => ({ ...current, selected: [] }))}
                >
                  <X className="size-4" aria-hidden="true" />
                  Auswahl aufheben
                </Button>
              </div>

              {bulkErrors.form && <FormError>{bulkErrors.form}</FormError>}
            </div>
          )}
        </div>
      )}

      <TableWrap>
        <Table className="min-w-[64rem]">
          <Thead>
            <Tr>
              {canWrite && (
                <Th className="w-12 py-0">
                  {/* Das Label vergroessert die Trefferflaeche auf 40 px. */}
                  <label className="flex size-10 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = someSelected
                      }}
                      onChange={(event) => toggleAll(event.target.checked)}
                      aria-label="Alle Zeilen dieser Seite auswählen"
                      className="size-[18px] cursor-pointer rounded-xs border border-[var(--border-strong)] accent-[var(--accent)]"
                    />
                  </label>
                </Th>
              )}
              <SortableTh
                label="Artikel"
                href={nameSort.href}
                active={nameSort.active}
                direction={nameSort.direction}
              />
              <Th>Kategorie</Th>
              <SortableTh
                label="Bestand"
                href={stockSort.href}
                active={stockSort.active}
                direction={stockSort.direction}
              />
              <Th align="right">Reserviert</Th>
              <SortableTh
                label="Meldegrenze"
                href={thresholdSort.href}
                active={thresholdSort.active}
                direction={thresholdSort.direction}
              />
              <Th>Status</Th>
              <Th align="right">{canWrite ? 'Speichern' : 'Journal'}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row) => {
              const base = baseline(row)
              const current = draft(row)
              const dirty = isDirty(row)
              const error = state.errors[row.id]
              // Gleiche Rechnung wie availableStock() im Server-Modul; dieses
              // laesst sich hier nicht importieren, weil es die Datenbank mitbringt.
              const available = Math.max(0, base.stock - row.reservedStock)

              return (
                <Tr key={row.id} className={cn(selected.has(row.id) && 'bg-[var(--accent-soft)]/60')}>
                  {canWrite && (
                    <Td className="py-0">
                      <label className="flex size-10 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={(event) => toggleRow(row.id, event.target.checked)}
                          aria-label={`${row.name} auswählen`}
                          className="size-[18px] cursor-pointer rounded-xs border border-[var(--border-strong)] accent-[var(--accent)]"
                        />
                      </label>
                    </Td>
                  )}

                  <Td>
                    <Link
                      href={`/admin/produkte/${row.id}`}
                      className="font-medium text-ink hover:text-[var(--accent)]"
                    >
                      {row.name}
                    </Link>
                    <span className="tabular mt-0.5 block text-xs text-ink-faint">
                      {row.sku} · {row.articleNumber}
                    </span>
                    {!row.active && (
                      <Badge tone="neutral" className="mt-1">
                        Inaktiv
                      </Badge>
                    )}
                  </Td>

                  <Td className="text-sm">{row.categoryName}</Td>

                  <Td>
                    {canWrite ? (
                      <Field label={`Bestand von ${row.name}`} hideLabel error={error?.stock}>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={current.stock}
                          onChange={(event) => setDraft(row, { stock: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && dirty) void saveRow(row)
                          }}
                          className="tabular h-10 w-24"
                        />
                      </Field>
                    ) : (
                      <span className="tabular font-semibold">{formatNumber(base.stock)}</span>
                    )}
                  </Td>

                  <Td align="right">
                    <span className="tabular text-sm">{formatNumber(row.reservedStock)}</span>
                    <span className="tabular mt-0.5 block text-xs text-ink-faint">
                      {formatNumber(available)} verfügbar
                    </span>
                  </Td>

                  <Td>
                    {canWrite ? (
                      <Field
                        label={`Meldegrenze von ${row.name}`}
                        hideLabel
                        error={error?.lowStockThreshold}
                      >
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={current.threshold}
                          onChange={(event) => setDraft(row, { threshold: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && dirty) void saveRow(row)
                          }}
                          className="tabular h-10 w-24"
                        />
                      </Field>
                    ) : (
                      <span className="tabular text-sm">{formatNumber(base.threshold)}</span>
                    )}
                  </Td>

                  <Td>
                    <StockBadge stock={base.stock} threshold={base.threshold} />
                    {row.allowBackorder && base.stock <= 0 && (
                      <span className="mt-0.5 block text-xs text-ink-faint">
                        Lieferbar ohne Bestand
                      </span>
                    )}
                    {error?.form && (
                      <span role="alert" className="mt-1 block text-xs font-medium text-danger-700">
                        {error.form}
                      </span>
                    )}
                  </Td>

                  <Td align="right">
                    <span className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/lager/bewegungen?artikel=${row.id}`}
                        aria-label={`Bestandsjournal von ${row.name} öffnen`}
                        title="Bestandsjournal dieses Artikels"
                        className="inline-flex size-10 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
                      >
                        <History className="size-4" aria-hidden="true" />
                      </Link>
                      {canWrite && (
                        <Button
                          size="sm"
                          variant={dirty ? 'primary' : 'outline'}
                          disabled={!dirty}
                          loading={busyRow === row.id}
                          onClick={() => void saveRow(row)}
                        >
                          {busyRow !== row.id && <Check className="size-4" aria-hidden="true" />}
                          Speichern
                        </Button>
                      )}
                    </span>
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      </TableWrap>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submitBulk}
        loading={bulkBusy}
        title="Sammeländerung ausführen?"
        description={confirmDescription}
        confirmLabel={`${formatNumber(selectedRows.length)} Artikel buchen`}
        cancelLabel="Abbrechen"
      />
    </div>
  )
}

/** Formuliert die Folgen der Sammelaenderung, bevor sie ausgefuehrt wird. */
function buildConfirmDescription({
  count,
  mode,
  value,
  changed,
  clamped,
  note,
}: {
  count: number
  mode: BulkMode
  value: number
  changed: number
  clamped: number
  note: string
}): string {
  const articles = count === 1 ? 'einem Artikel' : `${count.toLocaleString('de-DE')} Artikeln`
  const head =
    mode === 'set'
      ? `Der Bestand von ${articles} wird auf ${value.toLocaleString('de-DE')} Stück gesetzt.`
      : mode === 'increase'
        ? `Der Bestand von ${articles} wird um ${value.toLocaleString('de-DE')} Stück erhöht.`
        : `Der Bestand von ${articles} wird um ${value.toLocaleString('de-DE')} Stück verringert.`

  const parts = [head]

  if (changed === 0) parts.push('Kein Artikel ändert sich dadurch — alle stehen bereits auf diesem Wert.')
  else if (changed < count) {
    parts.push(
      `Tatsächlich ${changed === 1 ? 'ändert sich ein Artikel' : `ändern sich ${changed.toLocaleString('de-DE')} Artikel`}; die übrigen stehen bereits auf dem Zielwert.`,
    )
  }

  if (clamped > 0) {
    parts.push(
      clamped === 1
        ? 'Bei einem Artikel reicht der Bestand nicht aus; er wird auf 0 gesetzt.'
        : `Bei ${clamped.toLocaleString('de-DE')} Artikeln reicht der Bestand nicht aus; sie werden auf 0 gesetzt.`,
    )
  }

  parts.push(
    note.length > 0
      ? `Jede Buchung wird mit der Notiz „${note}“ im Bestandsjournal festgehalten.`
      : 'Jede Buchung wird im Bestandsjournal festgehalten.',
  )
  parts.push('Rückgängig machen lässt sich das nur durch eine neue Buchung.')

  return parts.join(' ')
}
