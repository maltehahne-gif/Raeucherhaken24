/**
 * Geldrechnung.
 *
 * Alle Betraege sind ganzzahlige Cent-Werte. Es gibt in der gesamten Anwendung
 * keine Gleitkomma-Arithmetik auf Geld: Rundungsfehler in Summen, Rabatten und
 * Steueranteilen sind fachlich nicht akzeptabel.
 */

/** Basispunkte: 10_000 bp = 100 %. */
export const BP_SCALE = 10_000

/** Rundet kaufmaennisch (half-up, symmetrisch um 0) auf ganze Cent. */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('Ungueltiger Geldbetrag')
  }
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** Wendet einen Prozentsatz in Basispunkten auf einen Cent-Betrag an. */
export function applyBp(cents: number, bp: number): number {
  assertInt(cents, 'cents')
  return roundCents((cents * bp) / BP_SCALE)
}

/** Zieht einen Rabatt in Basispunkten ab. */
export function discountByBp(cents: number, bp: number): number {
  return cents - applyBp(cents, bp)
}

/**
 * Rechnet den im Bruttobetrag enthaltenen Steueranteil heraus.
 * 1190 Cent bei 19 % ergeben 190 Cent Steueranteil.
 */
export function taxFromGross(grossCents: number, taxRateBp: number): number {
  assertInt(grossCents, 'grossCents')
  return roundCents((grossCents * taxRateBp) / (BP_SCALE + taxRateBp))
}

/**
 * Verteilt einen Gesamtbetrag verlustfrei auf Gewichte (Largest-Remainder).
 * Die Summe der Rueckgabewerte entspricht exakt `total`.
 */
export function distribute(total: number, weights: number[]): number[] {
  assertInt(total, 'total')
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) {
    const shares = new Array<number>(weights.length).fill(0)
    if (shares.length > 0) shares[0] = total
    return shares
  }
  const exact = weights.map((w) => (total * w) / sum)
  const floored = exact.map((v) => Math.floor(v))
  let rest = total - floored.reduce((a, b) => a + b, 0)
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (rest <= 0) break
    floored[i] += 1
    rest -= 1
  }
  return floored
}

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

/** Formatiert Cent als deutschen Euro-Betrag, z. B. 1990 -> "19,90 €". */
export function formatPrice(cents: number): string {
  return currencyFormatter.format(cents / 100)
}

const numberFormatter = new Intl.NumberFormat('de-DE')

export function formatNumber(value: number, fractionDigits = 0): string {
  if (fractionDigits > 0) {
    return new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value)
  }
  return numberFormatter.format(value)
}

/** Wandelt eine deutsche Preiseingabe ("19,90" / "19.90") in Cent. */
export function parsePriceToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s|€/g, '').replace(/\./g, '#').replace(',', '.')
  const cleaned = normalized.includes('.') ? normalized.replace(/#/g, '') : normalized.replace(/#/g, '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return roundCents(Number.parseFloat(cleaned) * 100)
}

/** Formatiert Basispunkte als Prozentangabe, z. B. 1250 -> "12,5 %". */
export function formatBp(bp: number): string {
  const percent = bp / 100
  return `${formatNumber(percent, Number.isInteger(percent) ? 0 : 1)} %`
}

function assertInt(value: number, name: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} muss ein ganzzahliger Cent-Wert sein (erhalten: ${value})`)
  }
}
