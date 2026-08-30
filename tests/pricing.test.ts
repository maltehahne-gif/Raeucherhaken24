import { describe, expect, it } from 'vitest'
import {
  applyCoupon,
  calculatePricing,
  calculateShipping,
  DEFAULT_SHIPPING_RULE,
  priceLine,
  selectPromotion,
  selectTier,
  type PricingLineInput,
  type PricingPromotion,
} from '@/lib/server/pricing'

/**
 * Pricing Engine.
 *
 * Die Engine ist die einzige Stelle, an der Preise entstehen. Diese Tests
 * sichern die Reihenfolge der Preisbildung ab — Optionen vor Aktion, Aktion vor
 * Mengenstaffel, Gutschein zuletzt — sowie die Grenzfälle, bei denen ein Fehler
 * echtes Geld kosten würde.
 */

const NOW = new Date('2026-03-15T12:00:00Z')

function promo(overrides: Partial<PricingPromotion> = {}): PricingPromotion {
  return {
    id: 'p1',
    name: 'Aktion',
    salePriceCents: null,
    discountBp: null,
    startsAt: new Date('2026-03-01T00:00:00Z'),
    endsAt: new Date('2026-04-01T00:00:00Z'),
    active: true,
    ...overrides,
  }
}

function line(overrides: Partial<PricingLineInput> = {}): PricingLineInput {
  return {
    key: 'l1',
    productId: 'prod1',
    name: 'Räucherhaken',
    sku: 'HAK-0001',
    articleNumber: 'RH-HAK-0001',
    basePriceCents: 1000,
    taxRateBp: 1900,
    quantity: 1,
    weightGrams: 100,
    ...overrides,
  }
}

describe('selectPromotion', () => {
  it('wählt eine laufende Aktion mit festem Aktionspreis', () => {
    const result = selectPromotion([promo({ salePriceCents: 800 })], 1000, NOW)
    expect(result?.priceCents).toBe(800)
  })

  it('rechnet einen prozentualen Nachlass aus', () => {
    const result = selectPromotion([promo({ discountBp: 2000 })], 1000, NOW)
    expect(result?.priceCents).toBe(800)
  })

  it('ignoriert eine noch nicht gestartete Aktion', () => {
    const future = promo({ salePriceCents: 500, startsAt: new Date('2026-04-01T00:00:00Z') })
    expect(selectPromotion([future], 1000, NOW)).toBeNull()
  })

  it('ignoriert eine abgelaufene Aktion', () => {
    const past = promo({ salePriceCents: 500, endsAt: new Date('2026-03-01T00:00:00Z') })
    expect(selectPromotion([past], 1000, NOW)).toBeNull()
  })

  it('ignoriert eine deaktivierte Aktion', () => {
    expect(selectPromotion([promo({ salePriceCents: 500, active: false })], 1000, NOW)).toBeNull()
  })

  it('ignoriert eine Aktion, die teurer wäre als der Listenpreis', () => {
    expect(selectPromotion([promo({ salePriceCents: 1200 })], 1000, NOW)).toBeNull()
  })

  it('wählt bei mehreren gültigen Aktionen die günstigste', () => {
    const result = selectPromotion(
      [promo({ id: 'a', salePriceCents: 900 }), promo({ id: 'b', salePriceCents: 750 })],
      1000,
      NOW,
    )
    expect(result?.priceCents).toBe(750)
    expect(result?.promotion.id).toBe('b')
  })

  it('behandelt den Endzeitpunkt als ausschließend', () => {
    // Eine Aktion, die "bis 15.03. 12:00" läuft, gilt um 12:00 nicht mehr.
    const ending = promo({ salePriceCents: 500, endsAt: NOW })
    expect(selectPromotion([ending], 1000, NOW)).toBeNull()
  })
})

describe('selectTier', () => {
  const tiers = [
    { minQty: 10, discountBp: 300 },
    { minQty: 25, discountBp: 600 },
    { minQty: 50, discountBp: 900 },
  ]

  it('greift erst ab der Mindestmenge', () => {
    expect(selectTier(tiers, 9)).toBeNull()
    expect(selectTier(tiers, 10)?.discountBp).toBe(300)
  })

  it('wählt die höchste erreichte Stufe', () => {
    expect(selectTier(tiers, 60)?.discountBp).toBe(900)
    expect(selectTier(tiers, 30)?.discountBp).toBe(600)
  })

  it('ignoriert Stufen ohne Nachlass', () => {
    expect(selectTier([{ minQty: 1, discountBp: 0 }], 100)).toBeNull()
  })
})

describe('priceLine', () => {
  it('rechnet den einfachen Fall', () => {
    const result = priceLine(line({ quantity: 3 }), NOW)
    expect(result.unitPriceCents).toBe(1000)
    expect(result.lineTotalCents).toBe(3000)
    expect(result.savingsCents).toBe(0)
  })

  it('nutzt den absoluten Variantenpreis, wenn gesetzt', () => {
    const result = priceLine(line({ variantPriceCents: 1500, variantDeltaCents: 999 }), NOW)
    expect(result.unitPriceCents).toBe(1500)
  })

  it('addiert den Variantenaufschlag, wenn kein absoluter Preis gesetzt ist', () => {
    const result = priceLine(line({ variantDeltaCents: 250 }), NOW)
    expect(result.unitPriceCents).toBe(1250)
  })

  it('addiert erst absolute, dann prozentuale Optionsaufschläge', () => {
    // Basis 1000 + 200 absolut = 1200, davon 10 % = 120 -> 1320
    const result = priceLine(
      line({
        options: [
          {
            groupKey: 'spitze',
            optionKey: 'handgeschliffen',
            label: 'Handgeschliffen',
            groupLabel: 'Spitze',
            priceDeltaCents: 200,
            priceDeltaBp: 0,
            weightDeltaGrams: 0,
          },
          {
            groupKey: 'material',
            optionKey: 'v4a',
            label: 'V4A',
            groupLabel: 'Werkstoff',
            priceDeltaCents: 0,
            priceDeltaBp: 1000,
            weightDeltaGrams: 0,
          },
        ],
      }),
      NOW,
    )
    expect(result.listUnitPriceCents).toBe(1320)
    expect(result.optionSurchargeCents).toBe(320)
  })

  it('wendet die Aktion auf den Preis inklusive Optionen an', () => {
    const result = priceLine(
      line({
        options: [
          {
            groupKey: 'g',
            optionKey: 'o',
            label: 'Option',
            groupLabel: 'Gruppe',
            priceDeltaCents: 500,
            priceDeltaBp: 0,
            weightDeltaGrams: 0,
          },
        ],
        promotions: [promo({ discountBp: 1000 })],
      }),
      NOW,
    )
    // (1000 + 500) - 10 % = 1350
    expect(result.unitPriceCents).toBe(1350)
    expect(result.listUnitPriceCents).toBe(1500)
    expect(result.appliedPromotionName).toBe('Aktion')
  })

  it('wendet die Mengenstaffel nach der Aktion an', () => {
    const result = priceLine(
      line({
        quantity: 50,
        promotions: [promo({ discountBp: 1000 })],
        priceTiers: [{ minQty: 50, discountBp: 1000 }],
      }),
      NOW,
    )
    // 1000 - 10 % = 900, davon nochmals 10 % = 810
    expect(result.unitPriceCents).toBe(810)
    expect(result.lineTotalCents).toBe(40_500)
    expect(result.appliedTierMinQty).toBe(50)
  })

  it('rechnet das Gewicht inklusive Optionen und Menge', () => {
    const result = priceLine(
      line({
        quantity: 4,
        weightGrams: 100,
        options: [
          {
            groupKey: 'g',
            optionKey: 'o',
            label: 'Option',
            groupLabel: 'Gruppe',
            priceDeltaCents: 0,
            priceDeltaBp: 0,
            weightDeltaGrams: 25,
          },
        ],
      }),
      NOW,
    )
    expect(result.weightGrams).toBe(500) // (100 + 25) * 4
  })

  it('lässt keinen negativen Stückpreis zu', () => {
    const result = priceLine(
      line({
        basePriceCents: 100,
        options: [
          {
            groupKey: 'g',
            optionKey: 'o',
            label: 'Nachlass',
            groupLabel: 'Gruppe',
            priceDeltaCents: -500,
            priceDeltaBp: 0,
            weightDeltaGrams: 0,
          },
        ],
      }),
      NOW,
    )
    expect(result.unitPriceCents).toBe(0)
  })

  it('weist ungültige Mengen zurück', () => {
    expect(() => priceLine(line({ quantity: 0 }), NOW)).toThrow(RangeError)
    expect(() => priceLine(line({ quantity: -1 }), NOW)).toThrow(RangeError)
    expect(() => priceLine(line({ quantity: 1.5 }), NOW)).toThrow(RangeError)
  })
})

describe('calculateShipping', () => {
  const rule = DEFAULT_SHIPPING_RULE

  it('ist ab der Freigrenze kostenfrei', () => {
    expect(calculateShipping(rule.freeShippingThresholdCents, 1000, rule)).toBe(0)
    expect(calculateShipping(rule.freeShippingThresholdCents + 1, 1000, rule)).toBe(0)
  })

  it('berechnet unterhalb der Freigrenze den Grundbetrag', () => {
    expect(calculateShipping(rule.freeShippingThresholdCents - 1, 1000, rule)).toBe(rule.baseCents)
  })

  it('kostet bei leerem Warenkorb nichts', () => {
    expect(calculateShipping(0, 0, rule)).toBe(0)
  })

  it('schlägt je angefangenem Kilogramm über der Freigrenze auf', () => {
    // 7 kg: 2 kg über 5 kg -> 2 x 1,20 €
    expect(calculateShipping(1000, 7000, rule)).toBe(rule.baseCents + 2 * rule.perKgCents)
  })

  it('rundet angefangene Kilogramm auf', () => {
    // 5,1 kg -> 1 angefangenes Kilogramm
    expect(calculateShipping(1000, 5100, rule)).toBe(rule.baseCents + rule.perKgCents)
  })

  it('berechnet ab der Sperrgutgrenze zusätzlich einen Zuschlag', () => {
    const cost = calculateShipping(1000, rule.heavyWeightGrams, rule)
    expect(cost).toBeGreaterThan(rule.baseCents + rule.heavySurchargeCents)
  })
})

describe('applyCoupon', () => {
  it('rechnet einen Prozentgutschein', () => {
    const result = applyCoupon(
      { code: 'A', type: 'percent', value: 1000, minOrderValueCents: 0, maxDiscountCents: 0 },
      10_000,
      495,
    )
    expect(result.discountCents).toBe(1000)
    expect(result.applied).toBe(true)
  })

  it('begrenzt den Prozentgutschein auf den Höchstbetrag', () => {
    const result = applyCoupon(
      { code: 'A', type: 'percent', value: 5000, minOrderValueCents: 0, maxDiscountCents: 1500 },
      10_000,
      495,
    )
    expect(result.discountCents).toBe(1500)
  })

  it('rechnet einen Festbetragsgutschein', () => {
    const result = applyCoupon(
      { code: 'B', type: 'fixed', value: 500, minOrderValueCents: 0, maxDiscountCents: 0 },
      10_000,
      495,
    )
    expect(result.discountCents).toBe(500)
  })

  it('lässt den Rabatt nie größer werden als den Warenwert', () => {
    // Sonst entstünde eine negative Summe — der Kunde bekäme Geld heraus.
    const result = applyCoupon(
      { code: 'B', type: 'fixed', value: 50_000, minOrderValueCents: 0, maxDiscountCents: 0 },
      1000,
      495,
    )
    expect(result.discountCents).toBe(1000)
  })

  it('greift bei Versandkostenfreiheit nicht auf den Warenwert zu', () => {
    const result = applyCoupon(
      { code: 'C', type: 'free_shipping', value: 0, minOrderValueCents: 0, maxDiscountCents: 0 },
      10_000,
      495,
    )
    expect(result.discountCents).toBe(0)
    expect(result.freeShipping).toBe(true)
  })

  it('lehnt bei verfehltem Mindestbestellwert ab', () => {
    const result = applyCoupon(
      { code: 'D', type: 'percent', value: 1000, minOrderValueCents: 5000, maxDiscountCents: 0 },
      4999,
      495,
    )
    expect(result.applied).toBe(false)
    expect(result.rejectionReason).toBe('min_order_value')
    expect(result.discountCents).toBe(0)
  })

  it('kommt ohne Gutschein zurecht', () => {
    const result = applyCoupon(null, 10_000, 495)
    expect(result.applied).toBe(false)
    expect(result.discountCents).toBe(0)
  })
})

describe('calculatePricing', () => {
  it('rechnet einen leeren Warenkorb', () => {
    const result = calculatePricing({ lines: [], shipping: DEFAULT_SHIPPING_RULE, now: NOW })
    expect(result.subtotalCents).toBe(0)
    expect(result.totalCents).toBe(0)
    expect(result.shippingCents).toBe(0)
    expect(result.taxCents).toBe(0)
  })

  it('summiert mehrere Positionen und schlägt Versand auf', () => {
    const result = calculatePricing({
      lines: [line({ key: 'a', basePriceCents: 1000, quantity: 2 }), line({ key: 'b', basePriceCents: 500 })],
      shipping: DEFAULT_SHIPPING_RULE,
      now: NOW,
    })
    expect(result.subtotalCents).toBe(2500)
    expect(result.shippingCents).toBe(DEFAULT_SHIPPING_RULE.baseCents)
    expect(result.totalCents).toBe(2500 + DEFAULT_SHIPPING_RULE.baseCents)
  })

  it('macht bei Versandkostenfreiheit den Versand zu null', () => {
    const result = calculatePricing({
      lines: [line({ basePriceCents: 2000 })],
      coupon: { code: 'FREI', type: 'free_shipping', value: 0, minOrderValueCents: 0, maxDiscountCents: 0 },
      shipping: DEFAULT_SHIPPING_RULE,
      now: NOW,
    })
    expect(result.shippingCents).toBe(0)
    expect(result.shippingBeforeCouponCents).toBe(DEFAULT_SHIPPING_RULE.baseCents)
    expect(result.totalCents).toBe(2000)
  })

  it('verteilt den Gutscheinrabatt verlustfrei auf die Positionen', () => {
    const result = calculatePricing({
      lines: [
        line({ key: 'a', basePriceCents: 333 }),
        line({ key: 'b', basePriceCents: 333 }),
        line({ key: 'c', basePriceCents: 334 }),
      ],
      coupon: { code: 'X', type: 'percent', value: 1000, minOrderValueCents: 0, maxDiscountCents: 0 },
      shipping: DEFAULT_SHIPPING_RULE,
      now: NOW,
    })
    const sumOfShares = result.lines.reduce((sum, l) => sum + l.couponShareCents, 0)
    expect(sumOfShares).toBe(result.discountCents)
  })

  it('weist die Ersparnis aus Aktionen und Staffeln getrennt aus', () => {
    const result = calculatePricing({
      lines: [line({ basePriceCents: 1000, quantity: 2, promotions: [promo({ discountBp: 2000 })] })],
      shipping: DEFAULT_SHIPPING_RULE,
      now: NOW,
    })
    expect(result.listSubtotalCents).toBe(2000)
    expect(result.subtotalCents).toBe(1600)
    expect(result.savingsCents).toBe(400)
  })

  it('meldet den fehlenden Betrag bis zum kostenfreien Versand', () => {
    const result = calculatePricing({
      lines: [line({ basePriceCents: 5000 })],
      shipping: DEFAULT_SHIPPING_RULE,
      now: NOW,
    })
    expect(result.freeShippingRemainingCents).toBe(DEFAULT_SHIPPING_RULE.freeShippingThresholdCents - 5000)
  })

  it('meldet null, wenn die Freigrenze erreicht ist', () => {
    const result = calculatePricing({
      lines: [line({ basePriceCents: 9000 })],
      shipping: DEFAULT_SHIPPING_RULE,
      now: NOW,
    })
    expect(result.freeShippingRemainingCents).toBe(0)
  })

  it('rechnet die enthaltene Steuer nach Abzug des Rabatts', () => {
    const result = calculatePricing({
      lines: [line({ basePriceCents: 11_900, taxRateBp: 1900 })],
      coupon: { code: 'X', type: 'fixed', value: 1190, minOrderValueCents: 0, maxDiscountCents: 0 },
      shipping: DEFAULT_SHIPPING_RULE,
      now: NOW,
    })
    // Warenwert nach Rabatt 10.710 -> enthaltene Steuer 1.710
    // Versand entfällt (über der Freigrenze).
    expect(result.shippingCents).toBe(0)
    expect(result.taxCents).toBe(1710)
  })

  it('meldet einen abgelehnten Gutschein, ohne die Berechnung zu verfälschen', () => {
    const result = calculatePricing({
      lines: [line({ basePriceCents: 1000 })],
      coupon: { code: 'X', type: 'percent', value: 1000, minOrderValueCents: 5000, maxDiscountCents: 0 },
      shipping: DEFAULT_SHIPPING_RULE,
      now: NOW,
    })
    expect(result.couponApplied).toBe(false)
    expect(result.couponRejectionReason).toBe('min_order_value')
    expect(result.discountCents).toBe(0)
    expect(result.totalCents).toBe(1000 + DEFAULT_SHIPPING_RULE.baseCents)
  })

  it('bleibt bei sehr großen Mengen ganzzahlig und plausibel', () => {
    const result = calculatePricing({
      lines: [line({ basePriceCents: 999, quantity: 999 })],
      shipping: DEFAULT_SHIPPING_RULE,
      now: NOW,
    })
    expect(Number.isInteger(result.totalCents)).toBe(true)
    expect(result.subtotalCents).toBe(999 * 999)
  })
})
