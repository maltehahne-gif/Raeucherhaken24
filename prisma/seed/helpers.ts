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
 * Wählt die passende Bildvorlage.
 *
 * Ausgewertet wird nicht nur der Produktname — die Modelle heißen wie
 * Eigennamen („Zwiesel D 190“) und verraten die Bauform nicht. Erst der
 * Untertitel und die Kurzbeschreibung nennen sie („Doppelhaken mit zwei
 * Zinken“). Deshalb geht der gesamte Beschreibungstext in die Auswahl ein.
 */
export function pickArchetype(categorySlug: string, ...text: Array<string | undefined | null>): Archetype {
  const n = text
    .filter((t): t is string => typeof t === 'string')
    .join(' ')
    .toLowerCase()

  if (categorySlug === 'raeucherhaken') {
    /*
     * Reihenfolge ist bedeutsam. Zuerst die eindeutigen Bauformen, zuletzt die
     * Sammelbegriffe: Nahezu jede Hakenbeschreibung enthält irgendwo das Wort
     * „aufhängen“ — als Signal für eine Aufhängeschiene taugt es deshalb nicht.
     * Die Schiene wird nur an Begriffen erkannt, die ausschließlich sie meinen.
     */
    if (/vierzink|vier zink|kamm|mehrzink|vier dornen/.test(n)) return 'hook-four'
    if (/doppelhaken|zweizink|zwei zinken|zwei schenkel/.test(n)) return 'hook-double'
    if (/spie(ß|ss)|stechhaken|gerader haken|widerhaken|f(ü|u)r aal/.test(n)) return 'hook-spear'
    if (/hakenleiste|leiste|schiene|traverse|aufh(ä|a)ngesystem|rohrbahn/.test(n)) return 'hook-rail'
    if (/schinken|schwer|gro(ß|ss)e fleischst(ü|u)cke|5,5 mm|6 mm/.test(n)) return 'hook-heavy'
    return 'hook-s'
  }

  if (categorySlug === 'fleischerhaken') {
    if (/rohr|bahn|leiste|schiene/.test(n)) return 'hook-rail'
    if (/kopfhaken|doppel/.test(n)) return 'hook-double'
    return 'hook-butcher'
  }

  if (categorySlug === 'raeuchermehl') return 'meal'
  if (categorySlug === 'raeucherlaugen') return 'brine'
  if (categorySlug === 'sonderanfertigungen') return 'special'

  /*
   * Gewürzbereich: Zuerst die physische Form, dann die botanische Familie.
   * Ein gemahlener Majoran ist zwar ein Kraut, sieht aber wie Pulver aus —
   * eine Zeichnung mit Kräuterbund wäre irreführend.
   */
  if (/salz/.test(n)) return 'salt'
  if (/mischung|gew(ü|u)rz f(ü|u)r|wurstgew(ü|u)rz|grillgew(ü|u)rz|steakpfeffer|br(ü|u)he|suppengr(ü|u)n|kr(ä|a)uter der provence/.test(n)) {
    return 'spice-blend'
  }
  if (/gemahlen|pulver|granuliert|gerieben|mehl\b/.test(n)) return 'spice-ground'
  if (
    /kraut|kr(ä|a)uter|thymian|rosmarin|lorbeer|majoran|oregano|salbei|basilikum|dill|petersilie|estragon|minze|melisse|bohnenkraut|beifu(ß|ss)|ysop|kerbel|schnittlauch|liebst(ö|o)ckel|b(ä|a)rlauch/.test(
      n,
    )
  ) {
    return 'herb'
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
