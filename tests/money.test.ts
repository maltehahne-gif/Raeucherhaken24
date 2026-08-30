import { describe, expect, it } from 'vitest'
import {
  applyBp,
  discountByBp,
  distribute,
  formatBp,
  formatNumber,
  formatPrice,
  parsePriceToCents,
  roundCents,
  taxFromGross,
} from '@/lib/money'
import { calculateBasePrice } from '@/lib/server/pricing'

/**
 * Geldrechnung.
 *
 * Diese Tests sichern die Grundlage jeder Preisangabe im Shop ab. Ein Fehler
 * hier verfälscht jede Bestellung, deshalb sind auch die unangenehmen Fälle
 * abgedeckt: halbe Cent, negative Beträge, Rundungsreste bei der Verteilung.
 */

describe('roundCents', () => {
  it('rundet kaufmännisch auf', () => {
    expect(roundCents(10.5)).toBe(11)
    expect(roundCents(10.4)).toBe(10)
  })

  it('rundet symmetrisch um null', () => {
    // Ohne die Sonderbehandlung würde Math.round(-10.5) auf -10 runden und
    // damit anders als der positive Fall — bei Rabatten wäre das ein Fehler.
    expect(roundCents(-10.5)).toBe(-11)
    expect(roundCents(-10.4)).toBe(-10)
  })

  it('weist ungültige Werte zurück', () => {
    expect(() => roundCents(Number.NaN)).toThrow(RangeError)
    expect(() => roundCents(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('applyBp und discountByBp', () => {
  it('rechnet Prozentwerte in Basispunkten', () => {
    expect(applyBp(10_000, 1900)).toBe(1900) // 19 % von 100,00 €
    expect(applyBp(1990, 1000)).toBe(199) // 10 % von 19,90 €
  })

  it('rundet den Rabatt auf ganze Cent', () => {
    // 10 % von 19,95 € = 1,995 € -> 2,00 €
    expect(applyBp(1995, 1000)).toBe(200)
    expect(discountByBp(1995, 1000)).toBe(1795)
  })

  it('liefert bei 0 bp keinen Abzug', () => {
    expect(discountByBp(4999, 0)).toBe(4999)
  })

  it('lehnt nicht ganzzahlige Cent-Beträge ab', () => {
    expect(() => applyBp(19.9, 1000)).toThrow(TypeError)
  })
})

describe('taxFromGross', () => {
  it('rechnet die enthaltene Umsatzsteuer heraus', () => {
    // 119,00 € brutto bei 19 % enthalten 19,00 € Steuer
    expect(taxFromGross(11_900, 1900)).toBe(1900)
  })

  it('arbeitet auch mit dem ermäßigten Satz', () => {
    // 107,00 € brutto bei 7 % enthalten 7,00 € Steuer
    expect(taxFromGross(10_700, 700)).toBe(700)
  })

  it('rundet auf ganze Cent', () => {
    expect(taxFromGross(1990, 1900)).toBe(318) // 3,177... -> 3,18
  })
})

describe('distribute', () => {
  it('verteilt verlustfrei — die Summe bleibt exakt erhalten', () => {
    const shares = distribute(100, [1, 1, 1])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
    expect(shares).toEqual([34, 33, 33])
  })

  it('gewichtet nach den Anteilen', () => {
    const shares = distribute(1000, [700, 300])
    expect(shares).toEqual([700, 300])
  })

  it('vergibt Rundungsreste an die größten Bruchteile', () => {
    const shares = distribute(10, [1, 1, 1, 1, 1, 1, 1])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10)
    // Sieben gleiche Gewichte, 10 Cent: drei Positionen bekommen 2, vier 1.
    expect(shares.filter((s) => s === 2)).toHaveLength(3)
  })

  it('legt alles auf die erste Position, wenn es keine Gewichte gibt', () => {
    expect(distribute(500, [0, 0])).toEqual([500, 0])
  })

  it('kommt mit einer leeren Liste zurecht', () => {
    expect(distribute(500, [])).toEqual([])
  })
})

describe('parsePriceToCents', () => {
  it('versteht die deutsche Schreibweise', () => {
    expect(parsePriceToCents('19,90')).toBe(1990)
    expect(parsePriceToCents('1.299,00')).toBe(129_900)
    expect(parsePriceToCents(' 19,90 € ')).toBe(1990)
  })

  it('versteht die englische Schreibweise', () => {
    expect(parsePriceToCents('19.90')).toBe(1990)
  })

  it('versteht ganze Beträge', () => {
    expect(parsePriceToCents('25')).toBe(2500)
  })

  it('weist Unsinn zurück', () => {
    expect(parsePriceToCents('abc')).toBeNull()
    expect(parsePriceToCents('19,999')).toBeNull()
    expect(parsePriceToCents('')).toBeNull()
  })
})

describe('Formatierung', () => {
  it('gibt Beträge in deutscher Schreibweise aus', () => {
    // Intl setzt ein schmales geschütztes Leerzeichen vor das Währungszeichen.
    expect(formatPrice(1990).replace(/ | /g, ' ')).toBe('19,90 €')
    expect(formatPrice(0).replace(/ | /g, ' ')).toBe('0,00 €')
    expect(formatPrice(129_900).replace(/ | /g, ' ')).toBe('1.299,00 €')
  })

  it('formatiert Zahlen mit Tausenderpunkt', () => {
    expect(formatNumber(1234)).toBe('1.234')
  })

  it('formatiert Basispunkte als Prozent', () => {
    expect(formatBp(1000).replace(/ | /g, ' ')).toBe('10 %')
    expect(formatBp(1250).replace(/ | /g, ' ')).toBe('12,5 %')
  })
})

describe('calculateBasePrice', () => {
  it('rechnet den Grundpreis je Kilogramm', () => {
    // 500 g für 12,90 € -> 25,80 € je Kilogramm
    const result = calculateBasePrice(1290, 'kg', 500, 1000, formatPrice)
    expect(result?.pricePerReferenceCents).toBe(2580)
    expect(result?.label).toContain('1 kg')
  })

  it('rechnet den Stückpreis bei Gebinden', () => {
    // 25 Haken für 13,90 € -> 0,56 € je Stück
    const result = calculateBasePrice(1390, 'stk', 25, 1, formatPrice)
    expect(result?.pricePerReferenceCents).toBe(56)
  })

  it('liefert nichts, wenn die Angaben unvollständig sind', () => {
    expect(calculateBasePrice(1290, null, 500, 1000, formatPrice)).toBeNull()
    expect(calculateBasePrice(1290, 'kg', 0, 1000, formatPrice)).toBeNull()
    expect(calculateBasePrice(1290, 'kg', 500, null, formatPrice)).toBeNull()
  })
})
