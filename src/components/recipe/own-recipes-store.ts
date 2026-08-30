'use client'

import { DIFFICULTIES, FOOD_TYPES, SMOKE_METHODS, WOOD_TYPES } from '@/lib/domain/enums'

/**
 * Ablage fuer eigene Rezepte.
 *
 * Die Schnittstelle `OwnRecipeStorage` ist bewusst asynchron und kennt keine
 * Speichertechnik. Heute liegt dahinter der localStorage des Browsers; eine
 * spaetere serverseitige Ablage (Kundenkonto, Synchronisierung zwischen
 * Geraeten) kann dieselbe Schnittstelle erfuellen, ohne dass die Oberflaeche
 * angefasst werden muss.
 *
 * Jeder Zugriff auf den Speicher ist gekapselt: Ist er nicht verfuegbar
 * (privater Modus, blockierte Website-Daten, voller Speicher), entsteht ein
 * `OwnRecipeStorageError` mit einer Meldung, die der Oberflaeche direkt
 * angezeigt werden kann.
 */

const STORAGE_KEY = 'rh24:eigene-rezepte'
const STORAGE_VERSION = 1
const MAX_RECIPES = 200

export const OWN_RECIPE_LIMITS = {
  title: 120,
  ingredients: 4_000,
  steps: 8_000,
  notes: 2_000,
  prepMinutes: { min: 0, max: 1_440 },
  brineHours: { min: 0, max: 720 },
  smokeMinutes: { min: 0, max: 10_080 },
  servings: { min: 1, max: 200 },
  maxRecipes: MAX_RECIPES,
} as const

export interface OwnRecipeInput {
  title: string
  /** Werte aus SMOKE_METHODS / FOOD_TYPES / WOOD_TYPES / DIFFICULTIES. */
  method: string
  foodType: string
  woodType: string
  difficulty: string
  prepMinutes: number
  brineHours: number
  smokeMinutes: number
  servings: number
  /** Eine Zutat je Zeile. */
  ingredients: string
  /** Ein Arbeitsschritt je Zeile. */
  steps: string
  notes: string
}

export interface OwnRecipe extends OwnRecipeInput {
  id: string
  /** ISO-Zeitstempel. */
  createdAt: string
  updatedAt: string
}

export interface OwnRecipeStorage {
  /** Kurzbeschreibung des Speicherorts fuer die Oberflaeche. */
  readonly location: string
  isAvailable(): boolean
  list(): Promise<OwnRecipe[]>
  get(id: string): Promise<OwnRecipe | null>
  create(input: OwnRecipeInput): Promise<OwnRecipe>
  update(id: string, input: OwnRecipeInput): Promise<OwnRecipe>
  remove(id: string): Promise<void>
  /** Loescht alle eigenen Rezepte dieses Geraets. */
  clear(): Promise<void>
}

export class OwnRecipeStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OwnRecipeStorageError'
  }
}

export function emptyOwnRecipe(): OwnRecipeInput {
  return {
    title: '',
    method: 'heiss',
    foodType: 'fisch',
    woodType: 'buche',
    difficulty: 'einsteiger',
    prepMinutes: 30,
    brineHours: 0,
    smokeMinutes: 90,
    servings: 4,
    ingredients: '',
    steps: '',
    notes: '',
  }
}

/** Zerlegt ein mehrzeiliges Feld in einzelne, nicht leere Zeilen. */
export function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** Gesamtdauer eines eigenen Rezeptes in Minuten. */
export function ownRecipeMinutes(recipe: OwnRecipeInput): number {
  return recipe.prepMinutes + recipe.brineHours * 60 + recipe.smokeMinutes
}

/**
 * Feldbezogene Pruefung.
 *
 * Ohne Server gibt es hier keine zweite Instanz, die die Eingaben prueft —
 * die Pruefung muss deshalb an dieser Stelle vollstaendig sein und dieselben
 * deutschen Meldungen liefern, die der Shop sonst vom Server bekommt.
 */
export function validateOwnRecipe(input: OwnRecipeInput): Record<string, string> {
  const errors: Record<string, string> = {}
  const title = input.title.trim()

  if (title.length === 0) errors.title = 'Bitte geben Sie einen Titel an.'
  else if (title.length > OWN_RECIPE_LIMITS.title) {
    errors.title = `Der Titel darf höchstens ${OWN_RECIPE_LIMITS.title} Zeichen haben.`
  }

  if (!(SMOKE_METHODS as readonly string[]).includes(input.method)) {
    errors.method = 'Bitte wählen Sie eine Räuchermethode.'
  }
  if (!(FOOD_TYPES as readonly string[]).includes(input.foodType)) {
    errors.foodType = 'Bitte wählen Sie ein Lebensmittel.'
  }
  if (!(WOOD_TYPES as readonly string[]).includes(input.woodType)) {
    errors.woodType = 'Bitte wählen Sie eine Holzart.'
  }
  if (!(DIFFICULTIES as readonly string[]).includes(input.difficulty)) {
    errors.difficulty = 'Bitte wählen Sie einen Schwierigkeitsgrad.'
  }

  const numbers: Array<[keyof OwnRecipeInput, number, { min: number; max: number }, string]> = [
    ['prepMinutes', input.prepMinutes, OWN_RECIPE_LIMITS.prepMinutes, 'Die Vorbereitungszeit'],
    ['brineHours', input.brineHours, OWN_RECIPE_LIMITS.brineHours, 'Die Zeit in der Lake'],
    ['smokeMinutes', input.smokeMinutes, OWN_RECIPE_LIMITS.smokeMinutes, 'Die Räucherdauer'],
    ['servings', input.servings, OWN_RECIPE_LIMITS.servings, 'Die Portionsangabe'],
  ]
  for (const [field, value, range, label] of numbers) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      errors[field] = `${label} muss eine ganze Zahl sein.`
    } else if (value < range.min) {
      errors[field] = `${label} muss mindestens ${range.min} betragen.`
    } else if (value > range.max) {
      errors[field] = `${label} darf höchstens ${range.max} betragen.`
    }
  }

  if (toLines(input.ingredients).length === 0) {
    errors.ingredients = 'Bitte tragen Sie mindestens eine Zutat ein.'
  } else if (input.ingredients.length > OWN_RECIPE_LIMITS.ingredients) {
    errors.ingredients = `Die Zutatenliste darf höchstens ${OWN_RECIPE_LIMITS.ingredients} Zeichen haben.`
  }

  if (toLines(input.steps).length === 0) {
    errors.steps = 'Bitte tragen Sie mindestens einen Arbeitsschritt ein.'
  } else if (input.steps.length > OWN_RECIPE_LIMITS.steps) {
    errors.steps = `Die Arbeitsschritte dürfen höchstens ${OWN_RECIPE_LIMITS.steps} Zeichen haben.`
  }

  if (input.notes.length > OWN_RECIPE_LIMITS.notes) {
    errors.notes = `Die Notiz darf höchstens ${OWN_RECIPE_LIMITS.notes} Zeichen haben.`
  }

  return errors
}

interface StoredEnvelope {
  version: number
  recipes: OwnRecipe[]
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Web-Crypto nicht verfuegbar — der Zeitstempel unten reicht als Kennung aus.
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Nimmt nur an, was der eigenen Struktur entspricht — fremde Daten werden verworfen. */
function normalizeStored(value: unknown): OwnRecipe | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null

  const text = (key: string, fallback = ''): string =>
    typeof raw[key] === 'string' ? (raw[key] as string) : fallback
  const number = (key: string, fallback: number): number =>
    typeof raw[key] === 'number' && Number.isFinite(raw[key] as number) ? (raw[key] as number) : fallback

  const defaults = emptyOwnRecipe()

  return {
    id: raw.id,
    title: raw.title,
    method: text('method', defaults.method),
    foodType: text('foodType', defaults.foodType),
    woodType: text('woodType', defaults.woodType),
    difficulty: text('difficulty', defaults.difficulty),
    prepMinutes: number('prepMinutes', defaults.prepMinutes),
    brineHours: number('brineHours', defaults.brineHours),
    smokeMinutes: number('smokeMinutes', defaults.smokeMinutes),
    servings: number('servings', defaults.servings),
    ingredients: text('ingredients'),
    steps: text('steps'),
    notes: text('notes'),
    createdAt: text('createdAt', new Date().toISOString()),
    updatedAt: text('updatedAt', text('createdAt', new Date().toISOString())),
  }
}

function sanitize(input: OwnRecipeInput): OwnRecipeInput {
  return {
    title: input.title.trim(),
    method: input.method,
    foodType: input.foodType,
    woodType: input.woodType,
    difficulty: input.difficulty,
    prepMinutes: input.prepMinutes,
    brineHours: input.brineHours,
    smokeMinutes: input.smokeMinutes,
    servings: input.servings,
    ingredients: toLines(input.ingredients).join('\n'),
    steps: toLines(input.steps).join('\n'),
    notes: input.notes.trim(),
  }
}

const UNAVAILABLE =
  'Ihr Browser lässt keine lokale Speicherung zu. Eigene Rezepte können deshalb auf diesem Gerät nicht gesichert werden.'

/** Ablage im localStorage des Browsers. */
class LocalOwnRecipeStorage implements OwnRecipeStorage {
  readonly location = 'Nur auf diesem Gerät, im Speicher dieses Browsers'

  isAvailable(): boolean {
    try {
      const probe = `${STORAGE_KEY}:probe`
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      return true
    } catch {
      return false
    }
  }

  /**
   * Liest den Bestand. Unlesbare Daten werden als leerer Bestand behandelt —
   * so bleibt die Seite bedienbar, statt an einem beschaedigten Eintrag zu
   * scheitern.
   */
  private read(): OwnRecipe[] {
    let raw: string | null
    try {
      raw = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      throw new OwnRecipeStorageError(UNAVAILABLE)
    }
    if (!raw) return []

    try {
      const parsed = JSON.parse(raw) as Partial<StoredEnvelope>
      if (!Array.isArray(parsed?.recipes)) return []
      return parsed.recipes
        .map(normalizeStored)
        .filter((recipe): recipe is OwnRecipe => recipe !== null)
    } catch {
      return []
    }
  }

  private write(recipes: OwnRecipe[]): void {
    const envelope: StoredEnvelope = { version: STORAGE_VERSION, recipes }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    } catch {
      throw new OwnRecipeStorageError(
        'Das Rezept konnte nicht gespeichert werden. Möglicherweise ist der Speicher Ihres Browsers voll.',
      )
    }
  }

  async list(): Promise<OwnRecipe[]> {
    return this.read()
  }

  async get(id: string): Promise<OwnRecipe | null> {
    return this.read().find((recipe) => recipe.id === id) ?? null
  }

  async create(input: OwnRecipeInput): Promise<OwnRecipe> {
    const recipes = this.read()
    if (recipes.length >= MAX_RECIPES) {
      throw new OwnRecipeStorageError(
        `Sie haben bereits ${MAX_RECIPES} eigene Rezepte gespeichert. Bitte löschen Sie zuerst ein Rezept.`,
      )
    }

    const now = new Date().toISOString()
    const recipe: OwnRecipe = { ...sanitize(input), id: newId(), createdAt: now, updatedAt: now }
    this.write([recipe, ...recipes])
    return recipe
  }

  async update(id: string, input: OwnRecipeInput): Promise<OwnRecipe> {
    const recipes = this.read()
    const index = recipes.findIndex((recipe) => recipe.id === id)
    if (index === -1) {
      throw new OwnRecipeStorageError('Dieses Rezept ist auf diesem Gerät nicht mehr vorhanden.')
    }

    const updated: OwnRecipe = {
      ...sanitize(input),
      id,
      createdAt: recipes[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    const next = [...recipes]
    next[index] = updated
    this.write(next)
    return updated
  }

  async remove(id: string): Promise<void> {
    const recipes = this.read()
    this.write(recipes.filter((recipe) => recipe.id !== id))
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      throw new OwnRecipeStorageError(UNAVAILABLE)
    }
  }
}

/** Die aktuell verwendete Ablage. Austauschbar, ohne die Oberflaeche zu aendern. */
export const ownRecipeStorage: OwnRecipeStorage = new LocalOwnRecipeStorage()

/** Uebersetzt jeden Fehler der Ablage in einen Text fuer die Oberflaeche. */
export function storageErrorMessage(error: unknown): string {
  if (error instanceof OwnRecipeStorageError) return error.message
  return 'Der Vorgang ist fehlgeschlagen. Bitte versuchen Sie es erneut.'
}
