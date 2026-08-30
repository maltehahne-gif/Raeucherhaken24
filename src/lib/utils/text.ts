/** Text-Helfer: Normalisierung, Slugs, Formatierung. */

const UMLAUT_MAP: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
  Ä: 'Ae', Ö: 'Oe', Ü: 'Ue',
  á: 'a', à: 'a', â: 'a', å: 'a', ã: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o',
  ú: 'u', ù: 'u', û: 'u',
  ç: 'c', ñ: 'n',
}

/** Ersetzt Umlaute und Akzente durch ASCII-Entsprechungen. */
export function transliterate(input: string): string {
  return input.replace(/[äöüßÄÖÜáàâåãéèêëíìîïóòôõúùûçñ]/g, (c) => UMLAUT_MAP[c] ?? c)
}

/** URL-tauglicher Slug: "Räucherhaken 20 cm" -> "raeucherhaken-20-cm". */
export function slugify(input: string): string {
  return transliterate(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

/**
 * Normalisierung fuer die Suche: kleingeschrieben, ohne Umlaute,
 * ohne Satzzeichen, mit Einfach-Leerzeichen.
 */
export function normalizeSearch(input: string): string {
  return transliterate(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Zerlegt einen Suchstring in normalisierte Tokens. */
export function tokenize(input: string): string[] {
  const normalized = normalizeSearch(input)
  return normalized.length === 0 ? [] : normalized.split(' ').filter((t) => t.length > 0)
}

/** Kuerzt Text auf eine maximale Laenge an einer Wortgrenze. */
export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input
  const cut = input.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Initialen fuer Avatare, z. B. "Malte Hahne" -> "MH". */
export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(date: Date | string): string {
  return dateFormatter.format(typeof date === 'string' ? new Date(date) : date)
}

export function formatDateTime(date: Date | string): string {
  return dateTimeFormatter.format(typeof date === 'string' ? new Date(date) : date)
}

/** Relative Angabe in deutscher Sprache, z. B. "vor 3 Tagen". */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const target = typeof date === 'string' ? new Date(date) : date
  const diffMs = target.getTime() - now.getTime()
  const rtf = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' })
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ]
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit)
  }
  return rtf.format(Math.round(diffMs / 1000), 'second')
}

/** Gewicht in Gramm menschenlesbar: 1500 -> "1,5 kg". */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000
    return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(kg)} kg`
  }
  return `${new Intl.NumberFormat('de-DE').format(grams)} g`
}

/** Laenge in Millimetern menschenlesbar: 200 -> "20 cm". */
export function formatLength(mm: number): string {
  if (mm >= 1000) {
    return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(mm / 1000)} m`
  }
  if (mm >= 10 && mm % 10 === 0) {
    return `${new Intl.NumberFormat('de-DE').format(mm / 10)} cm`
  }
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(mm)} mm`
}

/** Zehntelmillimeter -> "1,2 mm". */
export function formatTenthMm(tenthMm: number): string {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(tenthMm / 10)} mm`
}

/** Wandelt eine kommaseparierte Tag-Liste in ein sauberes Array. */
export function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}
