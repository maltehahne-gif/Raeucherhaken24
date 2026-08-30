import { slugify } from '../../src/lib/utils/text'
import type { Archetype } from '../../scripts/generate-product-images'

/**
 * Ableitungen, die beim Anlegen der Seed-Produkte gebraucht werden:
 * Slugs, Artikelnummern, Bildzuordnung und Grundpreisangaben.
 */

/** Sorgt für eindeutige Slugs, auch wenn zwei Produkte gleich heißen. */
export function uniqueSlug(name: string, used: Set<string>): string {
  const base = slugify(name) || 'artikel'
  let slug = base
  let counter = 2
  while (used.has(slug)) {
    slug = `${base}-${counter}`
    counter += 1
  }
  used.add(slug)
  return slug
}

/** Artikelnummer nach dem Muster RH-HAK-0042. */
export function articleNumber(prefix: string, index: number): string {
  return `RH-${prefix}-${String(index).padStart(4, '0')}`
}

/** SKU nach dem Muster HAK-0042-V4A-200. */
export function buildSku(prefix: string, index: number, ...parts: Array<string | number | undefined>): string {
  const suffix = parts
    .filter((p) => p !== undefined && p !== null && String(p).length > 0)
    .map((p) => String(p).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .join('-')
  return suffix.length > 0
    ? `${prefix}-${String(index).padStart(4, '0')}-${suffix}`
    : `${prefix}-${String(index).padStart(4, '0')}`
}

/**
 * Wählt die passende Bildvorlage anhand von Kategorie und Produktname.
 * Der Name entscheidet feiner als die Kategorie – ein „Pfeffer ganz“ soll
 * anders aussehen als ein „Paprika gemahlen“.
 */
export function pickArchetype(categorySlug: string, name: string): Archetype {
  const n = name.toLowerCase()

  if (categorySlug === 'raeucherhaken') {
    if (n.includes('leiste') || n.includes('schiene') || n.includes('system')) return 'hook-rail'
    if (n.includes('vier') || n.includes('kamm') || n.includes('zinker')) return 'hook-four'
    if (n.includes('doppel') || n.includes('zwei')) return 'hook-double'
    if (n.includes('spieß') || n.includes('spiess') || n.includes('stech') || n.includes('aal')) return 'hook-spear'
    if (n.includes('schinken') || n.includes('schwer') || n.includes('groß')) return 'hook-heavy'
    return 'hook-s'
  }

  if (categorySlug === 'fleischerhaken') {
    if (n.includes('rohr') || n.includes('bahn')) return 'hook-rail'
    return 'hook-butcher'
  }

  if (categorySlug === 'raeuchermehl') return 'meal'
  if (categorySlug === 'raeucherlaugen') return 'brine'
  if (categorySlug === 'sonderanfertigungen') return 'special'

  // Gewürzbereich
  if (n.includes('salz')) return 'salt'
  if (
    n.includes('kraut') ||
    n.includes('kräuter') ||
    n.includes('thymian') ||
    n.includes('rosmarin') ||
    n.includes('lorbeer') ||
    n.includes('majoran') ||
    n.includes('oregano') ||
    n.includes('salbei') ||
    n.includes('basilikum') ||
    n.includes('dill') ||
    n.includes('petersilie') ||
    n.includes('estragon') ||
    n.includes('minze') ||
    n.includes('melisse')
  ) {
    return 'herb'
  }
  if (n.includes('mischung') || n.includes('gewürz für') || n.includes('wurstgewürz') || n.includes('grillgewürz')) {
    return 'spice-blend'
  }
  if (n.includes('gemahlen') || n.includes('pulver') || n.includes('mehl') || n.includes('granuliert')) {
    return 'spice-ground'
  }
  return 'spice-whole'
}

/** Bezugsmenge für die Grundpreisangabe: 1 kg bzw. 1 Liter. */
export function baseUnitReference(unit: string | undefined): number | null {
  if (unit === 'kg' || unit === 'l') return 1000
  if (unit === 'stk') return 1
  return null
}

/**
 * Deterministischer Pseudozufall — damit ein erneuter Seed-Lauf dieselben
 * Bestände, Bewertungen und Termine erzeugt und Tests stabil bleiben.
 */
export function makeRandom(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ganzzahl aus einem Zufallsgenerator im Bereich [min, max]. */
export function randomInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}

/** Wählt ein Element aus einer Liste. */
export function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)]
}

/** Datum relativ zu heute, auf volle Stunden gerundet. */
export function daysAgo(days: number, reference: Date): Date {
  const date = new Date(reference.getTime() - days * 24 * 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  return date
}

export function daysAhead(days: number, reference: Date): Date {
  return daysAgo(-days, reference)
}
