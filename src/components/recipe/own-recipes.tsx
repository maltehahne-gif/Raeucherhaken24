'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  HardDriveDownload,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardBody, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Field, FormError, FormHint, Input, Select, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/utils/text'
import { cn } from '@/lib/utils/cn'
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  FOOD_TYPE_LABELS,
  FOOD_TYPES,
  SMOKE_METHOD_LABELS,
  SMOKE_METHODS,
  WOOD_TYPE_LABELS,
  WOOD_TYPES,
} from '@/lib/domain/enums'
import { formatDuration } from '@/components/recipe/recipe-card'
import {
  emptyOwnRecipe,
  OWN_RECIPE_LIMITS,
  ownRecipeMinutes,
  ownRecipeStorage,
  storageErrorMessage,
  toLines,
  validateOwnRecipe,
  type OwnRecipe,
  type OwnRecipeInput,
} from '@/components/recipe/own-recipes-store'

/**
 * Persoenliches Rezeptbuch.
 *
 * Die Rezepte liegen ausschliesslich im Browser des Besuchers. Diese
 * Komponente kennt die Speichertechnik nicht — sie spricht nur mit
 * `ownRecipeStorage` (siehe own-recipes-store.ts). Eine spaetere
 * serverseitige Ablage ersetzt dort die Umsetzung, ohne dass hier etwas
 * geaendert werden muss.
 */

const PAGE_SIZE = 8

const SORT_OPTIONS = [
  { value: 'updated', label: 'Zuletzt geändert' },
  { value: 'created', label: 'Zuletzt angelegt' },
  { value: 'title', label: 'Titel A–Z' },
  { value: 'duration', label: 'Kürzeste Zubereitung' },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]['value']

/** Zahlenfelder werden als Text gefuehrt, damit sie beim Tippen leer sein duerfen. */
interface Draft {
  title: string
  method: string
  foodType: string
  woodType: string
  difficulty: string
  prepMinutes: string
  brineHours: string
  smokeMinutes: string
  servings: string
  ingredients: string
  steps: string
  notes: string
}

function toDraft(recipe: OwnRecipeInput): Draft {
  return {
    title: recipe.title,
    method: recipe.method,
    foodType: recipe.foodType,
    woodType: recipe.woodType,
    difficulty: recipe.difficulty,
    prepMinutes: String(recipe.prepMinutes),
    brineHours: String(recipe.brineHours),
    smokeMinutes: String(recipe.smokeMinutes),
    servings: String(recipe.servings),
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    notes: recipe.notes,
  }
}

/**
 * Nur eine vollstaendige Ganzzahl wird uebernommen. `Number.parseInt` wuerde
 * aus "3,5" eine 3 machen — der Eintrag saehe gespeichert anders aus als
 * eingegeben.
 */
function toWholeNumber(value: string): number {
  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN
}

function toInput(draft: Draft): OwnRecipeInput {
  return {
    title: draft.title,
    method: draft.method,
    foodType: draft.foodType,
    woodType: draft.woodType,
    difficulty: draft.difficulty,
    prepMinutes: toWholeNumber(draft.prepMinutes),
    brineHours: toWholeNumber(draft.brineHours),
    smokeMinutes: toWholeNumber(draft.smokeMinutes),
    servings: toWholeNumber(draft.servings),
    ingredients: draft.ingredients,
    steps: draft.steps,
    notes: draft.notes,
  }
}

function labelOf(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value
}

export function OwnRecipes() {
  const toast = useToast()

  const [recipes, setRecipes] = useState<OwnRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [sort, setSort] = useState<SortValue>('updated')
  const [page, setPage] = useState(1)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(() => toDraft(emptyOwnRecipe()))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [viewing, setViewing] = useState<OwnRecipe | null>(null)
  const [pendingDelete, setPendingDelete] = useState<OwnRecipe | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const list = await ownRecipeStorage.list()
      setRecipes(list)
      setLoadError(null)
    } catch (error) {
      setLoadError(storageErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setAvailable(ownRecipeStorage.isAvailable())
    void reload()
  }, [reload])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de-DE')
    const list = recipes.filter((recipe) => {
      if (methodFilter && recipe.method !== methodFilter) return false
      if (!needle) return true
      return (
        recipe.title.toLocaleLowerCase('de-DE').includes(needle) ||
        recipe.ingredients.toLocaleLowerCase('de-DE').includes(needle) ||
        recipe.steps.toLocaleLowerCase('de-DE').includes(needle) ||
        recipe.notes.toLocaleLowerCase('de-DE').includes(needle)
      )
    })

    return list.sort((a, b) => {
      switch (sort) {
        case 'title':
          return a.title.localeCompare(b.title, 'de')
        case 'created':
          return b.createdAt.localeCompare(a.createdAt)
        case 'duration':
          return ownRecipeMinutes(a) - ownRecipeMinutes(b) || a.title.localeCompare(b.title, 'de')
        default:
          return b.updatedAt.localeCompare(a.updatedAt)
      }
    })
  }, [recipes, query, methodFilter, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Nach jeder Aenderung an Suche oder Filter wieder vorne beginnen.
  useEffect(() => {
    setPage(1)
  }, [query, methodFilter, sort])

  function openCreate() {
    setEditingId(null)
    setDraft(toDraft(emptyOwnRecipe()))
    setErrors({})
    setFormError(null)
    setEditorOpen(true)
  }

  function openEdit(recipe: OwnRecipe) {
    setEditingId(recipe.id)
    setDraft(toDraft(recipe))
    setErrors({})
    setFormError(null)
    setViewing(null)
    setEditorOpen(true)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const input = toInput(draft)
    const validation = validateOwnRecipe(input)
    if (Object.keys(validation).length > 0) {
      setErrors(validation)
      setFormError('Bitte prüfen Sie die markierten Felder.')
      return
    }

    setErrors({})
    setSaving(true)
    try {
      if (editingId) {
        await ownRecipeStorage.update(editingId, input)
        toast.success('Rezept gespeichert', 'Ihre Änderungen liegen auf diesem Gerät.')
      } else {
        await ownRecipeStorage.create(input)
        toast.success('Rezept angelegt', 'Das Rezept liegt ausschließlich auf diesem Gerät.')
      }
      await reload()
      setEditorOpen(false)
    } catch (error) {
      setFormError(storageErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await ownRecipeStorage.remove(pendingDelete.id)
      await reload()
      toast.success('Rezept gelöscht', `„${pendingDelete.title}“ wurde von diesem Gerät entfernt.`)
      setPendingDelete(null)
    } catch (error) {
      toast.error('Löschen nicht möglich', storageErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmClear() {
    setBusy(true)
    try {
      await ownRecipeStorage.clear()
      await reload()
      toast.success('Rezeptbuch geleert', 'Alle eigenen Rezepte wurden von diesem Gerät entfernt.')
      setClearOpen(false)
    } catch (error) {
      toast.error('Löschen nicht möglich', storageErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-wrap items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-hover)]">
            <HardDriveDownload className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold">Diese Rezepte liegen nur auf diesem Gerät</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              Ihr Rezeptbuch wird im Speicher dieses Browsers abgelegt. Es wird nicht an uns übertragen und ist
              auf anderen Geräten oder in anderen Browsern nicht vorhanden. Löschen Sie die Websitedaten Ihres
              Browsers oder nutzen Sie ein privates Fenster, sind die Rezepte unwiderruflich verloren. Notieren
              Sie sich Wichtiges deshalb zusätzlich außerhalb des Browsers.
            </p>
          </div>
        </CardBody>
      </Card>

      {!available && (
        <FormError>
          Ihr Browser lässt keine lokale Speicherung zu — etwa im privaten Modus oder bei blockierten
          Websitedaten. Sie können hier deshalb derzeit keine Rezepte anlegen.
        </FormError>
      )}
      {loadError && <FormError>{loadError}</FormError>}

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle as="h2">Ihre Rezepte</CardTitle>
            <CardDescription>
              {loading
                ? 'Rezepte werden geladen …'
                : recipes.length === 1
                  ? '1 Rezept auf diesem Gerät'
                  : `${recipes.length} Rezepte auf diesem Gerät`}
            </CardDescription>
          </div>
          <Button onClick={openCreate} disabled={!available}>
            <Plus className="size-4" aria-hidden="true" />
            Rezept anlegen
          </Button>
        </CardHeader>

        {recipes.length > 0 && (
          <CardBody className="border-b border-[var(--border-subtle)]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Suche" hideLabel>
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="In Titel, Zutaten und Schritten suchen"
                  leading={<Search className="size-4" aria-hidden="true" />}
                />
              </Field>
              <Field label="Räuchermethode" hideLabel>
                <Select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
                  <option value="">Alle Räuchermethoden</option>
                  {SMOKE_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {SMOKE_METHOD_LABELS[method]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sortierung" hideLabel>
                <Select value={sort} onChange={(event) => setSort(event.target.value as SortValue)}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </CardBody>
        )}

        <CardBody>
          {loading ? (
            <p className="py-6 text-center text-sm text-ink-muted" aria-busy="true">
              Rezepte werden geladen …
            </p>
          ) : recipes.length === 0 ? (
            <EmptyState
              compact
              icon={<NotebookPen className="size-5" aria-hidden="true" />}
              title="Noch kein eigenes Rezept"
              description="Halten Sie Ihre eigenen Ansätze fest: Zutaten, Zeiten und Arbeitsschritte. Alles bleibt auf diesem Gerät."
              action={available ? { label: 'Erstes Rezept anlegen', onClick: openCreate } : undefined}
              secondaryAction={{ label: 'Rezepte der Redaktion ansehen', href: '/rezepte' }}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              compact
              icon={<Search className="size-5" aria-hidden="true" />}
              title="Kein Treffer in Ihrem Rezeptbuch"
              description="Zu dieser Suche oder Auswahl gibt es kein Rezept. Ändern Sie den Suchbegriff oder setzen Sie den Filter zurück."
              action={{
                label: 'Suche zurücksetzen',
                onClick: () => {
                  setQuery('')
                  setMethodFilter('')
                },
              }}
            />
          ) : (
            <>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Titel</Th>
                      <Th>Methode</Th>
                      <Th>Lebensmittel</Th>
                      <Th align="right">Gesamtdauer</Th>
                      <Th align="right">Portionen</Th>
                      <Th>Geändert</Th>
                      <Th align="right">Aktionen</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {visible.map((recipe) => (
                      <Tr key={recipe.id}>
                        <Td className="font-medium text-ink">
                          <button
                            type="button"
                            onClick={() => setViewing(recipe)}
                            className="text-left underline-offset-2 hover:underline"
                          >
                            {recipe.title}
                          </button>
                          <span className="mt-0.5 block text-xs font-normal text-ink-faint">
                            {toLines(recipe.ingredients).length} Zutaten ·{' '}
                            {toLines(recipe.steps).length} Schritte
                          </span>
                        </Td>
                        <Td>
                          <Badge tone="accent">{labelOf(SMOKE_METHOD_LABELS, recipe.method)}</Badge>
                        </Td>
                        <Td>{labelOf(FOOD_TYPE_LABELS, recipe.foodType)}</Td>
                        <Td align="right" className="tabular whitespace-nowrap">
                          {formatDuration(ownRecipeMinutes(recipe))}
                        </Td>
                        <Td align="right" className="tabular">
                          {recipe.servings}
                        </Td>
                        <Td className="tabular whitespace-nowrap text-ink-muted">
                          {formatDate(recipe.updatedAt)}
                        </Td>
                        <Td align="right">
                          <div className="flex items-center justify-end gap-1">
                            <IconButton label="Rezept ansehen" onClick={() => setViewing(recipe)}>
                              <Eye className="size-4" aria-hidden="true" />
                            </IconButton>
                            <IconButton label="Rezept bearbeiten" onClick={() => openEdit(recipe)}>
                              <Pencil className="size-4" aria-hidden="true" />
                            </IconButton>
                            <IconButton label="Rezept löschen" onClick={() => setPendingDelete(recipe)}>
                              <Trash2 className="size-4 text-danger-500" aria-hidden="true" />
                            </IconButton>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>

              <LocalPagination page={currentPage} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </CardBody>

        {recipes.length > 0 && (
          <CardFooter>
            <Button variant="ghost" size="sm" onClick={() => setClearOpen(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
              Rezeptbuch leeren
            </Button>
          </CardFooter>
        )}
      </Card>

      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? 'Rezept bearbeiten' : 'Eigenes Rezept anlegen'}
        description="Die Angaben werden ausschließlich im Speicher dieses Browsers abgelegt."
        size="xl"
        dismissible={!saving}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" form="eigenes-rezept-formular" loading={saving}>
              {editingId ? 'Änderungen speichern' : 'Rezept speichern'}
            </Button>
          </>
        }
      >
        <form id="eigenes-rezept-formular" onSubmit={(event) => void save(event)} className="space-y-5" noValidate>
          {formError && <FormError>{formError}</FormError>}

          <Field label="Titel" required error={errors.title}>
            <Input
              data-autofocus
              value={draft.title}
              maxLength={OWN_RECIPE_LIMITS.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="z. B. Forelle nach Art meines Großvaters"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Räuchermethode" required error={errors.method}>
              <Select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}>
                {SMOKE_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {SMOKE_METHOD_LABELS[method]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lebensmittel" required error={errors.foodType}>
              <Select
                value={draft.foodType}
                onChange={(event) => setDraft({ ...draft, foodType: event.target.value })}
              >
                {FOOD_TYPES.map((foodType) => (
                  <option key={foodType} value={foodType}>
                    {FOOD_TYPE_LABELS[foodType]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Holzart" required error={errors.woodType}>
              <Select
                value={draft.woodType}
                onChange={(event) => setDraft({ ...draft, woodType: event.target.value })}
              >
                {WOOD_TYPES.map((woodType) => (
                  <option key={woodType} value={woodType}>
                    {WOOD_TYPE_LABELS[woodType]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Schwierigkeit" required error={errors.difficulty}>
              <Select
                value={draft.difficulty}
                onChange={(event) => setDraft({ ...draft, difficulty: event.target.value })}
              >
                {DIFFICULTIES.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {DIFFICULTY_LABELS[difficulty]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Vorbereitung (Min.)" required error={errors.prepMinutes}>
              <Input
                inputMode="numeric"
                value={draft.prepMinutes}
                onChange={(event) => setDraft({ ...draft, prepMinutes: event.target.value })}
              />
            </Field>
            <Field label="In der Lake (Std.)" required error={errors.brineHours}>
              <Input
                inputMode="numeric"
                value={draft.brineHours}
                onChange={(event) => setDraft({ ...draft, brineHours: event.target.value })}
              />
            </Field>
            <Field label="Räucherdauer (Min.)" required error={errors.smokeMinutes}>
              <Input
                inputMode="numeric"
                value={draft.smokeMinutes}
                onChange={(event) => setDraft({ ...draft, smokeMinutes: event.target.value })}
              />
            </Field>
            <Field label="Portionen" required error={errors.servings}>
              <Input
                inputMode="numeric"
                value={draft.servings}
                onChange={(event) => setDraft({ ...draft, servings: event.target.value })}
              />
            </Field>
          </div>

          <Field
            label="Zutaten"
            required
            description="Eine Zutat je Zeile, zum Beispiel: 4 Forellen, küchenfertig"
            error={errors.ingredients}
          >
            <Textarea
              rows={6}
              value={draft.ingredients}
              maxLength={OWN_RECIPE_LIMITS.ingredients}
              onChange={(event) => setDraft({ ...draft, ingredients: event.target.value })}
            />
          </Field>

          <Field
            label="Arbeitsschritte"
            required
            description="Ein Schritt je Zeile. Die Nummerierung entsteht beim Anzeigen automatisch."
            error={errors.steps}
          >
            <Textarea
              rows={8}
              value={draft.steps}
              maxLength={OWN_RECIPE_LIMITS.steps}
              onChange={(event) => setDraft({ ...draft, steps: event.target.value })}
            />
          </Field>

          <Field label="Notiz" hint="Optional" error={errors.notes}>
            <Textarea
              rows={3}
              value={draft.notes}
              maxLength={OWN_RECIPE_LIMITS.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              placeholder="Was beim nächsten Mal anders laufen soll"
            />
          </Field>

          <FormHint>
            Höchstens {OWN_RECIPE_LIMITS.maxRecipes} Rezepte je Gerät. Die Angaben verlassen Ihren Browser nicht.
          </FormHint>
        </form>
      </Dialog>

      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? ''}
        size="lg"
        footer={
          viewing ? (
            <>
              <Button variant="outline" onClick={() => setViewing(null)}>
                Schließen
              </Button>
              <Button onClick={() => openEdit(viewing)}>
                <Pencil className="size-4" aria-hidden="true" />
                Bearbeiten
              </Button>
            </>
          ) : null
        }
      >
        {viewing && <OwnRecipeDetail recipe={viewing} />}
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Rezept löschen?"
        description={
          pendingDelete
            ? `„${pendingDelete.title}“ wird endgültig von diesem Gerät entfernt. Da das Rezept nur hier gespeichert ist, lässt es sich danach nicht wiederherstellen.`
            : ''
        }
        confirmLabel="Endgültig löschen"
        destructive
        loading={busy}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => void confirmClear()}
        title="Alle eigenen Rezepte löschen?"
        description={`Alle ${recipes.length} Rezepte werden endgültig von diesem Gerät entfernt. Es gibt keine Kopie auf unseren Servern, eine Wiederherstellung ist nicht möglich.`}
        confirmLabel="Alles löschen"
        destructive
        loading={busy}
      />
    </div>
  )
}

/** Leseansicht eines eigenen Rezeptes. */
function OwnRecipeDetail({ recipe }: { recipe: OwnRecipe }) {
  const ingredients = toLines(recipe.ingredients)
  const steps = toLines(recipe.steps)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="accent">{labelOf(SMOKE_METHOD_LABELS, recipe.method)}</Badge>
        <Badge tone="neutral">{labelOf(FOOD_TYPE_LABELS, recipe.foodType)}</Badge>
        <Badge tone="outline">{labelOf(WOOD_TYPE_LABELS, recipe.woodType)}</Badge>
        <Badge tone="outline">{labelOf(DIFFICULTY_LABELS, recipe.difficulty)}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KeyFigure label="Vorbereitung" value={formatDuration(recipe.prepMinutes)} />
        <KeyFigure
          label="In der Lake"
          value={recipe.brineHours > 0 ? formatDuration(recipe.brineHours * 60) : 'Ohne Lake'}
        />
        <KeyFigure label="Räucherdauer" value={formatDuration(recipe.smokeMinutes)} />
        <KeyFigure label="Portionen" value={String(recipe.servings)} />
      </dl>

      <section>
        <h3 className="font-display text-base font-semibold">Zutaten</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
          {ingredients.map((line, index) => (
            <li key={`${index}-${line}`} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-[var(--accent)]" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-base font-semibold">Arbeitsschritte</h3>
        <ol className="mt-2 space-y-3 text-sm leading-relaxed text-ink-soft">
          {steps.map((line, index) => (
            <li key={`${index}-${line}`} className="flex gap-3">
              <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-paper-sunken text-xs font-semibold text-ink">
                {index + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </section>

      {recipe.notes && (
        <section>
          <h3 className="font-display text-base font-semibold">Notiz</h3>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{recipe.notes}</p>
        </section>
      )}

      <p className="text-xs text-ink-faint">
        Angelegt am {formatDate(recipe.createdAt)} · zuletzt geändert am {formatDate(recipe.updatedAt)}
      </p>
    </div>
  )
}

function KeyFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-paper-sunken/60 px-3 py-2.5">
      <dt className="text-2xs font-semibold tracking-wide text-ink-faint uppercase">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}

/**
 * Seitenwechsel im Browser. Das Rezeptbuch lebt vollstaendig im Speicher
 * dieses Geraets — es gibt keine URL, die eine Seite abbilden koennte.
 */
function LocalPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  const buttonClass =
    'inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-md px-3 text-sm font-medium transition-colors disabled:text-ink-faint'

  return (
    <nav aria-label="Seitennavigation" className="mt-5 flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className={cn(buttonClass, page > 1 && 'text-ink-soft hover:bg-paper-sunken')}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Zurück</span>
      </button>

      {Array.from({ length: totalPages }, (_, index) => index + 1).map((entry) => (
        <button
          key={entry}
          type="button"
          onClick={() => onChange(entry)}
          aria-current={entry === page ? 'page' : undefined}
          aria-label={`Seite ${entry}`}
          className={cn(
            buttonClass,
            'tabular',
            entry === page ? 'bg-steel-800 text-steel-50' : 'text-ink-soft hover:bg-paper-sunken',
          )}
        >
          {entry}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(buttonClass, page < totalPages && 'text-ink-soft hover:bg-paper-sunken')}
      >
        <span className="hidden sm:inline">Weiter</span>
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  )
}
