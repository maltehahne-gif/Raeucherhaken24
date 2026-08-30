import { describe, expect, it } from 'vitest'
import { formatPrice } from '@/lib/money'
import {
  consentSchema,
  couponCodeSchema,
  emailSchema,
  honeypotSchema,
  intFromInput,
  optionalIntFromInput,
  optionalString,
  pageSchema,
  phoneSchema,
  postalCodeSchema,
  priceFromInput,
  slugSchema,
  trimmedString,
} from '@/lib/validation/common'
import {
  bpToPercentInput,
  centsToInput,
  couponSchema,
  couponState,
  describeCouponInWords,
  formatCouponValue,
  formatPercentBp,
  parsePercentToBp,
} from '@/lib/validation/coupon'
import {
  productRecordFromInput,
  productSchema,
  toDateTimeLocalInput,
  centsToInput as productCentsToInput,
} from '@/lib/validation/product'

/**
 * Formulareingabe und Speicherwert.
 *
 * Zwischen dem Eingabefeld und der Datenbankspalte liegt eine Umrechnung:
 * „19,90“ wird zu 1990 Cent, „10 %“ zu 1000 Basispunkten. Genau hier entstehen
 * die Fehler, die niemandem auffallen — ein Faktor 100 im Rabatt sieht im
 * Formular richtig aus und kostet erst im Warenkorb Geld.
 *
 * Diese Tests sichern die Umrechnung in beide Richtungen ab und pruefen die
 * fachlichen Regeln, die ein Formular allein nicht durchsetzen kann.
 */

// ---------------------------------------------------------------------------
// Gemeinsame Bausteine
// ---------------------------------------------------------------------------

describe('priceFromInput', () => {
  const price = priceFromInput()

  it('liest die deutsche Schreibweise', () => {
    expect(price.parse('19,90')).toBe(1990)
    expect(price.parse('0,05')).toBe(5)
    expect(price.parse('7')).toBe(700)
  })

  it('akzeptiert Tausenderpunkt und Waehrungszeichen', () => {
    expect(price.parse('1.299,00')).toBe(129900)
    expect(price.parse(' 24,90 € ')).toBe(2490)
  })

  it('rechnet ganzzahlig und ohne Gleitkommadrift', () => {
    // 19.99 * 100 ergibt in Gleitkomma 1998.9999999999998.
    expect(price.parse(19.99)).toBe(1999)
    expect(price.parse('19,99')).toBe(1999)
  })

  it('weist unlesbare und negative Betraege ab', () => {
    expect(price.safeParse('abc').success).toBe(false)
    expect(price.safeParse('-5,00').success).toBe(false)
    expect(price.safeParse('19,999').success).toBe(false)
  })

  it('nennt im Fehlerfall ein Beispiel', () => {
    const result = price.safeParse('abc')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toContain('19,90')
  })
})

describe('intFromInput', () => {
  const count = intFromInput(0, 1000, 'Der Bestand')

  it('liest Zahlen mit und ohne Tausenderpunkt', () => {
    expect(count.parse('42')).toBe(42)
    expect(count.parse('1.000')).toBe(1000)
    expect(count.parse(7)).toBe(7)
  })

  it('haelt sich an die Grenzen und benennt das Feld', () => {
    const tooLarge = count.safeParse('1001')
    expect(tooLarge.success).toBe(false)
    if (!tooLarge.success) expect(tooLarge.error.issues[0].message).toContain('Der Bestand')
    expect(count.safeParse('-1').success).toBe(false)
  })

  it('nimmt eine Eingabe nur ganz oder gar nicht an', () => {
    // `parseInt` liest so weit, wie es kann: aus "3,5" wuerde sonst 3 und aus
    // "12abc" eine 12 — der Bearbeiter saehe eine Erfolgsmeldung und einen
    // anderen Bestand als eingegeben.
    expect(count.safeParse('3,5').success).toBe(false)
    expect(count.safeParse('12abc').success).toBe(false)
    expect(count.safeParse('').success).toBe(false)

    const result = count.safeParse('3,5')
    if (!result.success) expect(result.error.issues[0].message).toContain('Der Bestand')
  })
})

describe('optionalIntFromInput', () => {
  const weight = optionalIntFromInput(0, 500_000, 'Das Gewicht')

  it('deutet ein leeres Feld als "nicht angegeben"', () => {
    expect(weight.parse('')).toBeNull()
    expect(weight.parse('   ')).toBeNull()
    expect(weight.parse(undefined)).toBeNull()
    expect(weight.parse(null)).toBeNull()
  })

  it('liest angegebene Werte', () => {
    expect(weight.parse('250')).toBe(250)
  })

  it('nimmt eine angefangene Zahl nicht als ganze', () => {
    expect(weight.safeParse('250,5').success).toBe(false)
    expect(weight.safeParse('250 g').success).toBe(false)
  })
})

describe('optionalString und trimmedString', () => {
  it('macht aus einem leeren optionalen Feld null', () => {
    const field = optionalString(100, 'Der Untertitel')
    expect(field.parse('   ')).toBeNull()
    expect(field.parse('  Aus V4A  ')).toBe('Aus V4A')
  })

  it('erzwingt Pflichtfelder erst nach dem Beschneiden', () => {
    const field = trimmedString(2, 10, 'Der Name')
    expect(field.safeParse('  ').success).toBe(false)
    expect(field.parse('  Haken ')).toBe('Haken')
  })
})

describe('emailSchema', () => {
  it('vereinheitlicht Schreibweise und Leerzeichen', () => {
    expect(emailSchema.parse('  Max.Mustermann@Example.DE ')).toBe('max.mustermann@example.de')
  })

  it('weist ungueltige Adressen ab', () => {
    expect(emailSchema.safeParse('max@').success).toBe(false)
    expect(emailSchema.safeParse('ohne-at-zeichen.de').success).toBe(false)
  })
})

describe('postalCodeSchema', () => {
  it('verlangt genau fuenf Ziffern', () => {
    expect(postalCodeSchema.parse(' 21029 ')).toBe('21029')
    expect(postalCodeSchema.safeParse('2102').success).toBe(false)
    expect(postalCodeSchema.safeParse('210299').success).toBe(false)
  })
})

describe('phoneSchema', () => {
  it('bleibt bei der Schreibweise tolerant', () => {
    expect(phoneSchema.parse('+49 4104 96 22 10')).toBe('+49 4104 96 22 10')
    expect(phoneSchema.parse('(04104) 96-2210')).toBe('(04104) 96-2210')
  })

  it('deutet ein leeres Feld als "nicht angegeben"', () => {
    expect(phoneSchema.parse('')).toBeNull()
  })

  it('weist zu kurze Angaben ab', () => {
    expect(phoneSchema.safeParse('123').success).toBe(false)
  })
})

describe('slugSchema', () => {
  it('erlaubt nur kleingeschriebene URL-Pfade', () => {
    expect(slugSchema.parse('raeucherhaken-s-130')).toBe('raeucherhaken-s-130')
    expect(slugSchema.safeParse('Raeucherhaken').success).toBe(false)
    expect(slugSchema.safeParse('haken--doppelt').success).toBe(false)
    expect(slugSchema.safeParse('-haken').success).toBe(false)
  })
})

describe('honeypotSchema und consentSchema', () => {
  it('laesst das unsichtbare Feld nur leer durch', () => {
    expect(honeypotSchema.safeParse('').success).toBe(true)
    expect(honeypotSchema.safeParse(undefined).success).toBe(true)
    expect(honeypotSchema.safeParse('http://spam.example').success).toBe(false)
  })

  it('verlangt eine gesetzte Zustimmung', () => {
    const consent = consentSchema('Bitte stimmen Sie zu.')
    expect(consent.parse('on')).toBe(true)
    expect(consent.safeParse('').success).toBe(false)
  })
})

describe('pageSchema', () => {
  it('faellt auf die erste Seite zurueck', () => {
    expect(pageSchema.parse(undefined)).toBe(1)
    expect(pageSchema.parse('0')).toBe(1)
    expect(pageSchema.parse('keine-zahl')).toBe(1)
  })

  it('begrenzt die Seitenzahl nach oben', () => {
    expect(pageSchema.parse('3')).toBe(3)
    expect(pageSchema.parse('99999')).toBe(500)
  })
})

describe('couponCodeSchema', () => {
  it('vereinheitlicht die Eingabe des Kunden', () => {
    expect(couponCodeSchema.parse(' sommer 24 ')).toBe('SOMMER24')
  })

  it('weist ungueltige Zeichen ab', () => {
    expect(couponCodeSchema.safeParse('SOMMER!').success).toBe(false)
    expect(couponCodeSchema.safeParse('AB').success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Gutscheine
// ---------------------------------------------------------------------------

describe('Umrechnung von Gutscheinwerten', () => {
  it('rechnet Prozenteingaben in Basispunkte', () => {
    expect(parsePercentToBp('10')).toBe(1000)
    expect(parsePercentToBp('10,5')).toBe(1050)
    expect(parsePercentToBp(' 15 % ')).toBe(1500)
    expect(parsePercentToBp('100')).toBe(10_000)
  })

  it('weist Prozentwerte ueber 100 und Unsinn ab', () => {
    expect(parsePercentToBp('101')).toBeNull()
    expect(parsePercentToBp('zehn')).toBeNull()
    expect(parsePercentToBp('-5')).toBeNull()
  })

  it('fuehrt beim Zurueckschreiben ins Formular zum Ausgangswert', () => {
    for (const bp of [0, 500, 1000, 1050, 2500, 10_000]) {
      expect(parsePercentToBp(bpToPercentInput(bp))).toBe(bp)
    }
  })

  it('rechnet Cent verlustfrei ins Eingabefeld und zurueck', () => {
    expect(centsToInput(1990)).toBe('19,90')
    expect(centsToInput(5)).toBe('0,05')
    expect(centsToInput(100_000)).toBe('1000,00')
  })

  it('beschriftet den gespeicherten Wert je nach Gutscheinart', () => {
    expect(formatCouponValue('percent', 1000)).toBe(formatPercentBp(1000))
    expect(formatCouponValue('fixed', 500)).toBe(formatPrice(500))
    expect(formatCouponValue('free_shipping', 0)).toBe('Versandkosten')
  })
})

describe('couponState', () => {
  const now = new Date('2026-06-15T12:00:00Z')
  const base = { active: true, startsAt: null, endsAt: null, usageLimit: 0, usageCount: 0 }

  it('meldet einen deaktivierten Gutschein zuerst', () => {
    expect(couponState({ ...base, active: false }, now)).toBe('disabled')
  })

  it('erkennt einen noch nicht gestarteten Zeitraum', () => {
    expect(couponState({ ...base, startsAt: new Date('2026-07-01T00:00:00Z') }, now)).toBe('scheduled')
  })

  it('erkennt einen abgelaufenen Zeitraum', () => {
    expect(couponState({ ...base, endsAt: new Date('2026-06-01T00:00:00Z') }, now)).toBe('expired')
  })

  it('erkennt ein ausgeschoepftes Nutzungslimit', () => {
    expect(couponState({ ...base, usageLimit: 100, usageCount: 100 }, now)).toBe('exhausted')
  })

  it('ignoriert das Limit, wenn keines gesetzt ist', () => {
    expect(couponState({ ...base, usageLimit: 0, usageCount: 5000 }, now)).toBe('active')
  })

  it('meldet einen laufenden Gutschein als aktiv', () => {
    expect(
      couponState(
        {
          ...base,
          startsAt: new Date('2026-06-01T00:00:00Z'),
          endsAt: new Date('2026-06-30T00:00:00Z'),
          usageLimit: 100,
          usageCount: 12,
        },
        now,
      ),
    ).toBe('active')
  })
})

describe('describeCouponInWords', () => {
  const now = new Date('2026-06-15T12:00:00Z')

  it('fasst Prozentrabatt, Schwelle und Deckelung zusammen', () => {
    const text = describeCouponInWords(
      {
        type: 'percent',
        value: 1000,
        minOrderValueCents: 4000,
        maxDiscountCents: 3000,
        startsAt: null,
        endsAt: null,
      },
      now,
    )
    expect(text).toContain(formatPercentBp(1000))
    expect(text).toContain(formatPrice(4000))
    expect(text).toContain(formatPrice(3000))
    expect(text).toContain('ohne Befristung')
    expect(text.endsWith('.')).toBe(true)
  })

  it('nennt Versandkostenfreiheit ohne Betrag', () => {
    const text = describeCouponInWords(
      { type: 'free_shipping', value: 0, minOrderValueCents: 0, maxDiscountCents: 0, startsAt: null, endsAt: null },
      now,
    )
    expect(text).toContain('Versandkostenfrei')
    expect(text).not.toContain('Rabatt')
  })

  it('nennt den Gueltigkeitszeitraum, wenn einer gesetzt ist', () => {
    const text = describeCouponInWords(
      {
        type: 'fixed',
        value: 500,
        minOrderValueCents: 0,
        maxDiscountCents: 0,
        startsAt: new Date('2026-06-01T00:00:00Z'),
        endsAt: new Date('2026-06-30T00:00:00Z'),
      },
      now,
    )
    expect(text).toContain('gültig vom')
    expect(text).toContain('30.06')
  })
})

describe('couponSchema', () => {
  const valid = {
    code: ' sommer-24 ',
    description: 'Sommeraktion',
    type: 'percent',
    value: '10',
    minOrderValueCents: '40,00',
    maxDiscountCents: '30,00',
    startsAt: '',
    endsAt: '',
    usageLimit: '100',
    perCustomerLimit: '1',
    active: 'on',
  }

  it('speichert Prozent als Basispunkte und Betraege als Cent', () => {
    const result = couponSchema.parse(valid)
    expect(result.code).toBe('SOMMER-24')
    expect(result.value).toBe(1000)
    expect(result.minOrderValueCents).toBe(4000)
    expect(result.maxDiscountCents).toBe(3000)
    expect(result.active).toBe(true)
  })

  it('speichert bei Festbetraegen den Cent-Wert', () => {
    const result = couponSchema.parse({
      ...valid,
      type: 'fixed',
      value: '5,00',
      minOrderValueCents: '40,00',
    })
    expect(result.value).toBe(500)
  })

  it('verwirft eine Deckelung, die nur beim Prozentrabatt wirken kann', () => {
    // Sonst stuende in der Datenbank eine Regel, die nie greift — und im
    // naechsten Formular sieht der Bearbeiter eine Deckelung, die es nicht gibt.
    const result = couponSchema.parse({ ...valid, type: 'fixed', value: '5,00', maxDiscountCents: '30,00' })
    expect(result.maxDiscountCents).toBe(0)
  })

  it('lehnt einen wirkungslosen Rabatt ab', () => {
    const zeroPercent = couponSchema.safeParse({ ...valid, value: '0' })
    expect(zeroPercent.success).toBe(false)
    const zeroFixed = couponSchema.safeParse({ ...valid, type: 'fixed', value: '0,00' })
    expect(zeroFixed.success).toBe(false)
  })

  it('meldet einen Fehler am verursachenden Feld', () => {
    const result = couponSchema.safeParse({ ...valid, value: 'zehn' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].path).toEqual(['value'])
  })

  it('verlangt ein Ende nach dem Beginn', () => {
    const result = couponSchema.safeParse({
      ...valid,
      startsAt: '2026-07-01T10:00',
      endsAt: '2026-06-01T10:00',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === 'endsAt')).toBe(true)
  })

  it('laesst das Limit je Kunde nicht ueber dem Gesamtlimit liegen', () => {
    const result = couponSchema.safeParse({ ...valid, usageLimit: '10', perCustomerLimit: '20' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === 'perCustomerLimit')).toBe(true)
  })

  it('verhindert einen Festbetrag ueber dem Mindestbestellwert', () => {
    // 50 € Rabatt ab 10 € Warenwert ergaebe einen negativen Warenwert.
    const result = couponSchema.safeParse({
      ...valid,
      type: 'fixed',
      value: '50,00',
      minOrderValueCents: '10,00',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === 'minOrderValueCents')).toBe(true)
  })

  it('nimmt ein angefangenes Limit nicht als ganzes an', () => {
    expect(couponSchema.safeParse({ ...valid, usageLimit: '100x' }).success).toBe(false)
  })

  it('deutet leere Grenzwerte als "keine Grenze"', () => {
    const result = couponSchema.parse({
      ...valid,
      minOrderValueCents: '',
      maxDiscountCents: '',
      usageLimit: '',
      perCustomerLimit: '',
    })
    expect(result.minOrderValueCents).toBe(0)
    expect(result.usageLimit).toBe(0)
    expect(result.perCustomerLimit).toBe(0)
  })

  it('weist einen Code mit Leerzeichen im Inneren nicht ab, sondern verdichtet ihn', () => {
    expect(couponSchema.parse({ ...valid, code: 'sommer 24' }).code).toBe('SOMMER24')
  })
})

// ---------------------------------------------------------------------------
// Produkte
// ---------------------------------------------------------------------------

const product = {
  name: 'Räucherhaken S 130',
  subtitle: 'V2A, für Forelle und Makrele',
  shortDescription: 'Arbeitshaken für den täglichen Fischgang.',
  description: 'Ein S-förmiger Haken aus rostfreiem Edelstahl für Fisch bis rund 1,5 Kilogramm.',
  categoryId: 'cat-haken',
  slug: 'raeucherhaken-s-130',
  sku: 'hak-0001',
  articleNumber: 'rh-hak-0001',
  priceCents: '13,90',
  salePriceCents: '',
  saleStartsAt: '',
  saleEndsAt: '',
  promotionId: '',
  taxRateBp: '1900',
  baseUnit: '',
  baseUnitAmount: '',
  baseUnitReference: '',
  weightGrams: '18',
  shippingWeightGrams: '30',
  packagingUnit: '10',
  lengthMm: '130',
  deliveryDaysMin: '2',
  deliveryDaysMax: '4',
  material: 'V2A',
  usage: 'Fisch',
  tipFinish: 'angespitzt',
  stock: '240',
  lowStockThreshold: '20',
  allowBackorder: '',
  active: 'on',
  visible: 'on',
  bestseller: '',
  sortOrder: '0',
  metaTitle: 'Räucherhaken S 130 aus V2A',
  metaDescription: 'S-Haken aus V2A für Forelle und Makrele, 130 mm.',
}

describe('productSchema', () => {
  it('nimmt einen vollstaendigen Datensatz an und normiert die Kennungen', () => {
    const result = productSchema.parse(product)
    expect(result.priceCents).toBe(1390)
    expect(result.sku).toBe('HAK-0001')
    expect(result.articleNumber).toBe('RH-HAK-0001')
    expect(result.taxRateBp).toBe(1900)
    expect(result.active).toBe(true)
    expect(result.bestseller).toBe(false)
  })

  it('laesst nur hinterlegte Steuersaetze zu', () => {
    expect(productSchema.safeParse({ ...product, taxRateBp: '1234' }).success).toBe(false)
    expect(productSchema.safeParse({ ...product, taxRateBp: '1900abc' }).success).toBe(false)
    expect(productSchema.safeParse({ ...product, taxRateBp: '700' }).success).toBe(true)
  })

  it('laesst nur hinterlegte Werkstoffe zu', () => {
    expect(productSchema.safeParse({ ...product, material: 'Plastik' }).success).toBe(false)
    expect(productSchema.parse({ ...product, material: '' }).material).toBeNull()
  })

  it('verlangt zu einem Angebotspreis immer einen Zeitraum', () => {
    // Ein unbefristetes Angebot ist kein Angebot, sondern der neue Preis.
    const result = productSchema.safeParse({ ...product, salePriceCents: '11,90' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('saleStartsAt')
      expect(paths).toContain('saleEndsAt')
    }
  })

  it('verlangt zu einem Zeitraum immer einen Angebotspreis', () => {
    const result = productSchema.safeParse({ ...product, saleStartsAt: '2026-07-01T00:00' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === 'salePriceCents')).toBe(true)
  })

  it('laesst einen Angebotspreis nicht ueber dem regulaeren Preis zu', () => {
    const result = productSchema.safeParse({
      ...product,
      salePriceCents: '15,90',
      saleStartsAt: '2026-07-01T00:00',
      saleEndsAt: '2026-07-31T00:00',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === 'salePriceCents')).toBe(true)
  })

  it('nimmt ein befristetes Angebot an', () => {
    const result = productSchema.parse({
      ...product,
      salePriceCents: '11,90',
      saleStartsAt: '2026-07-01T00:00',
      saleEndsAt: '2026-07-31T00:00',
    })
    expect(result.salePriceCents).toBe(1190)
    expect(result.saleStartsAt).toBeInstanceOf(Date)
  })

  it('verlangt die Grundpreisangabe vollstaendig oder gar nicht', () => {
    // Halb ausgefuellt liesse sich der Grundpreis nach PAngV nicht berechnen.
    const halb = productSchema.safeParse({ ...product, baseUnit: 'kg' })
    expect(halb.success).toBe(false)

    const ohneEinheit = productSchema.safeParse({ ...product, baseUnitAmount: '1000' })
    expect(ohneEinheit.success).toBe(false)

    const vollstaendig = productSchema.parse({
      ...product,
      baseUnit: 'kg',
      baseUnitAmount: '1000',
      baseUnitReference: '1000',
    })
    expect(vollstaendig.baseUnit).toBe('kg')
  })

  it('laesst das Versandgewicht nicht unter das Produktgewicht fallen', () => {
    const result = productSchema.safeParse({ ...product, weightGrams: '500', shippingWeightGrams: '100' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === 'shippingWeightGrams')).toBe(true)
  })

  it('laesst die laengste Lieferzeit nicht unter die kuerzeste fallen', () => {
    const result = productSchema.safeParse({ ...product, deliveryDaysMin: '5', deliveryDaysMax: '2' })
    expect(result.success).toBe(false)
  })

  it('weist einen ungueltigen URL-Pfad ab', () => {
    expect(productSchema.safeParse({ ...product, slug: 'Räucherhaken S 130' }).success).toBe(false)
  })

  it('meldet fehlende Pflichtfelder auf Deutsch statt technisch', () => {
    const result = productSchema.safeParse({ ...product, priceCents: undefined })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'priceCents')
      expect(issue?.message).toContain('Preis')
    }
  })
})

describe('productRecordFromInput', () => {
  it('uebernimmt genau die Spalten, die dieses Formular pflegt', () => {
    const record = productRecordFromInput(productSchema.parse(product))
    expect(record.priceCents).toBe(1390)
    expect(record.sku).toBe('HAK-0001')
    expect(record.subtitle).toBe('V2A, für Forelle und Makrele')
    // Felder ausserhalb des Formulars duerfen nicht mit Standardwerten
    // ueberschrieben werden — sonst setzt jedes Speichern die Beliebtheit
    // oder die Reservierungen zurueck.
    expect(record).not.toHaveProperty('popularity')
    expect(record).not.toHaveProperty('reservedStock')
    expect(record).not.toHaveProperty('salePriceCents')
  })

  it('macht aus leeren optionalen Feldern null statt einer leeren Zeichenkette', () => {
    const record = productRecordFromInput(
      productSchema.parse({ ...product, subtitle: '', usage: '', metaTitle: '' }),
    )
    expect(record.subtitle).toBeNull()
    expect(record.usage).toBeNull()
    expect(record.metaTitle).toBeNull()
  })
})

describe('Rueckweg ins Formular', () => {
  it('stellt Cent-Betraege verlustfrei dar', () => {
    expect(productCentsToInput(1390)).toBe('13,90')
    expect(productCentsToInput(0)).toBe('0,00')
    expect(productCentsToInput(7)).toBe('0,07')
  })

  it('erzeugt einen Wert, den ein datetime-local-Feld annimmt', () => {
    const value = toDateTimeLocalInput(new Date(2026, 6, 1, 8, 30))
    expect(value).toBe('2026-07-01T08:30')
  })
})
