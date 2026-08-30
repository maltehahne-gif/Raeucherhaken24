/**
 * Zentrale Pricing Engine.
 *
 * Sie ist die einzige Stelle, an der Preise entstehen. Warenkorb, Checkout und
 * Bestellanlage rufen ausschliesslich diese Funktionen auf; im Browser
 * angezeigte Preise sind reine Darstellung und niemals autoritativ.
 *
 * Reihenfolge der Preisbildung je Position:
 *   1. Basispreis (Produkt) bzw. Variantenpreis
 *   2. Konfigurator-Optionen: absolute Aufschlaege, danach prozentuale
 *   3. Aktionspreis (Promotion), falls guenstiger und zeitlich gueltig
 *   4. Mengenstaffel (PriceTier) auf den Stueckpreis
 *   5. Positionssumme = Stueckpreis x Menge
 *
 * Danach auf Warenkorbebene:
 *   6. Gutschein (prozentual/fest/Versandkostenfrei)
 *   7. Versandkosten
 *   8. Gesamtsumme und enthaltene Umsatzsteuer
 */
import { applyBp, discountByBp, distribute, roundCents, taxFromGross } from '@/lib/money'
import type { CouponType } from '@/lib/domain/enums'

// --- Eingabetypen (bewusst framework- und Prisma-unabhaengig) ---------------

export interface PricingOption {
  groupKey: string
  optionKey: string
  label: string
  groupLabel: string
  priceDeltaCents: number
  priceDeltaBp: number
  weightDeltaGrams: number
}

export interface PricingPromotion {
  id: string
  name: string
  salePriceCents: number | null
  discountBp: number | null
  startsAt: Date
  endsAt: Date
  active: boolean
}

export interface PricingTier {
  minQty: number
  discountBp: number
}

export interface PricingLineInput {
  /** Stabile Kennung der Position (z. B. CartItem-Id) */
  key: string
  productId: string
  variantId?: string | null
  name: string
  sku: string
  articleNumber: string
  /** Basispreis des Produkts in Cent */
  basePriceCents: number
  /** Absoluter Variantenpreis; ueberschreibt Basispreis, wenn gesetzt */
  variantPriceCents?: number | null
  /** Aufschlag der Variante gegenueber dem Basispreis */
  variantDeltaCents?: number
  taxRateBp: number
  quantity: number
  weightGrams: number
  options?: PricingOption[]
  promotions?: PricingPromotion[]
  priceTiers?: PricingTier[]
}

export interface PricingCouponInput {
  code: string
  type: CouponType
  /** Basispunkte bei 'percent', Cent bei 'fixed' */
  value: number
  minOrderValueCents: number
  maxDiscountCents: number
}

export interface ShippingRule {
  /** Ab diesem Warenwert (nach Rabatt) ist der Versand kostenfrei. */
  freeShippingThresholdCents: number
  /** Grundpreis fuer Paketversand. */
  baseCents: number
  /** Zuschlag ab Gewichtsgrenze (Sperrgut/Speditionsware). */
  heavyWeightGrams: number
  heavySurchargeCents: number
  /** Aufschlag je angefangenem weiteren Kilogramm ueber der Freigrenze. */
  perKgOverGrams: number
  perKgCents: number
}

export interface PricingInput {
  lines: PricingLineInput[]
  coupon?: PricingCouponInput | null
  shipping: ShippingRule
  /** Referenzzeitpunkt fuer Aktionen. Ermoeglicht deterministische Tests. */
  now?: Date
}

// --- Ausgabetypen ----------------------------------------------------------

export interface PricedLine {
  key: string
  productId: string
  variantId: string | null
  name: string
  sku: string
  articleNumber: string
  quantity: number
  /** Stueckpreis ohne Aktion und ohne Staffel (Streichpreis) */
  listUnitPriceCents: number
  /** Tatsaechlich berechneter Stueckpreis */
  unitPriceCents: number
  lineTotalCents: number
  /** Ersparnis gegenueber dem Listenpreis fuer die gesamte Position */
  savingsCents: number
  taxRateBp: number
  weightGrams: number
  appliedPromotionName: string | null
  appliedTierMinQty: number | null
  appliedTierDiscountBp: number
  optionSurchargeCents: number
  options: PricingOption[]
  /** Anteiliger Gutscheinrabatt dieser Position (verlustfrei verteilt) */
  couponShareCents: number
}

export type CouponRejectionReason = 'min_order_value'

export interface PricingResult {
  lines: PricedLine[]
  /** Summe aller Positionen vor Gutschein */
  subtotalCents: number
  /** Summe der Listenpreise (fuer "Sie sparen") */
  listSubtotalCents: number
  /** Ersparnis aus Aktionen und Mengenstaffeln */
  savingsCents: number
  discountCents: number
  shippingCents: number
  /** Versandkosten ohne Gutschein-Effekt, fuer die Anzeige "entfällt" */
  shippingBeforeCouponCents: number
  totalCents: number
  taxCents: number
  totalWeightGrams: number
  couponCode: string | null
  couponApplied: boolean
  couponRejectionReason: CouponRejectionReason | null
  freeShippingThresholdCents: number
  /** Noch fehlender Betrag bis zum kostenfreien Versand (0 = erreicht) */
  freeShippingRemainingCents: number
}

/** Standard-Versandregeln des Shops. Zentral, damit Tests und UI identisch rechnen. */
export const DEFAULT_SHIPPING_RULE: ShippingRule = {
  freeShippingThresholdCents: 7_900,
  baseCents: 495,
  heavyWeightGrams: 20_000,
  heavySurchargeCents: 1_500,
  perKgOverGrams: 5_000,
  perKgCents: 120,
}

// --- Einzelposition --------------------------------------------------------

/** Waehlt die zum Zeitpunkt `now` guenstigste gueltige Aktion. */
export function selectPromotion(
  promotions: PricingPromotion[] | undefined,
  listPriceCents: number,
  now: Date,
): { priceCents: number; promotion: PricingPromotion } | null {
  if (!promotions || promotions.length === 0) return null
  let best: { priceCents: number; promotion: PricingPromotion } | null = null
  for (const promo of promotions) {
    if (!promo.active) continue
    if (promo.startsAt.getTime() > now.getTime()) continue
    if (promo.endsAt.getTime() <= now.getTime()) continue
    let candidate: number | null = null
    if (promo.salePriceCents !== null && promo.salePriceCents >= 0) {
      candidate = promo.salePriceCents
    } else if (promo.discountBp !== null && promo.discountBp > 0) {
      candidate = discountByBp(listPriceCents, promo.discountBp)
    }
    if (candidate === null) continue
    if (candidate >= listPriceCents) continue
    if (best === null || candidate < best.priceCents) {
      best = { priceCents: candidate, promotion: promo }
    }
  }
  return best
}

/** Waehlt die guenstigste zutreffende Mengenstaffel. */
export function selectTier(tiers: PricingTier[] | undefined, quantity: number): PricingTier | null {
  if (!tiers || tiers.length === 0) return null
  let best: PricingTier | null = null
  for (const tier of tiers) {
    if (tier.minQty > quantity) continue
    if (tier.discountBp <= 0) continue
    if (best === null || tier.discountBp > best.discountBp) best = tier
  }
  return best
}

/**
 * Berechnet eine einzelne Position ohne Gutscheinanteil.
 * Der Gutscheinanteil wird erst auf Warenkorbebene verteilt.
 */
export function priceLine(input: PricingLineInput, now: Date): Omit<PricedLine, 'couponShareCents'> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new RangeError('Menge muss eine positive ganze Zahl sein')
  }

  // 1. Basis-/Variantenpreis
  const base =
    input.variantPriceCents !== null && input.variantPriceCents !== undefined
      ? input.variantPriceCents
      : input.basePriceCents + (input.variantDeltaCents ?? 0)

  // 2. Optionen: erst absolute Aufschlaege, dann prozentuale auf die Summe
  const options = input.options ?? []
  let absoluteSurcharge = 0
  let percentBp = 0
  let optionWeight = 0
  for (const option of options) {
    absoluteSurcharge += option.priceDeltaCents
    percentBp += option.priceDeltaBp
    optionWeight += option.weightDeltaGrams
  }
  const afterAbsolute = base + absoluteSurcharge
  const percentSurcharge = percentBp > 0 ? applyBp(afterAbsolute, percentBp) : 0
  const listUnitPriceCents = Math.max(0, afterAbsolute + percentSurcharge)
  const optionSurchargeCents = absoluteSurcharge + percentSurcharge

  // 3. Aktionspreis
  const promo = selectPromotion(input.promotions, listUnitPriceCents, now)
  let unitPrice = promo ? promo.priceCents : listUnitPriceCents

  // 4. Mengenstaffel
  const tier = selectTier(input.priceTiers, input.quantity)
  if (tier) unitPrice = discountByBp(unitPrice, tier.discountBp)

  unitPrice = Math.max(0, roundCents(unitPrice))
  const lineTotalCents = unitPrice * input.quantity

  return {
    key: input.key,
    productId: input.productId,
    variantId: input.variantId ?? null,
    name: input.name,
    sku: input.sku,
    articleNumber: input.articleNumber,
    quantity: input.quantity,
    listUnitPriceCents,
    unitPriceCents: unitPrice,
    lineTotalCents,
    savingsCents: (listUnitPriceCents - unitPrice) * input.quantity,
    taxRateBp: input.taxRateBp,
    weightGrams: (input.weightGrams + optionWeight) * input.quantity,
    appliedPromotionName: promo ? promo.promotion.name : null,
    appliedTierMinQty: tier ? tier.minQty : null,
    appliedTierDiscountBp: tier ? tier.discountBp : 0,
    optionSurchargeCents,
    options,
  }
}

// --- Versand ---------------------------------------------------------------

/** Versandkosten aus Warenwert und Gesamtgewicht. */
export function calculateShipping(
  goodsValueCents: number,
  totalWeightGrams: number,
  rule: ShippingRule,
): number {
  if (goodsValueCents <= 0) return 0
  if (goodsValueCents >= rule.freeShippingThresholdCents) return 0

  let cost = rule.baseCents
  if (totalWeightGrams > rule.perKgOverGrams) {
    const extraKg = Math.ceil((totalWeightGrams - rule.perKgOverGrams) / 1000)
    cost += extraKg * rule.perKgCents
  }
  if (totalWeightGrams >= rule.heavyWeightGrams) {
    cost += rule.heavySurchargeCents
  }
  return roundCents(cost)
}

// --- Gutschein -------------------------------------------------------------

interface CouponEffect {
  discountCents: number
  freeShipping: boolean
  applied: boolean
  rejectionReason: CouponRejectionReason | null
}

/**
 * Wendet einen bereits als gueltig geprueften Gutschein an.
 * Die Gueltigkeitspruefung (Zeitraum, Limit, aktiv) liegt in coupons.ts —
 * hier geht es ausschliesslich um den Betrag.
 */
export function applyCoupon(
  coupon: PricingCouponInput | null | undefined,
  subtotalCents: number,
  shippingCents: number,
): CouponEffect {
  if (!coupon) {
    return { discountCents: 0, freeShipping: false, applied: false, rejectionReason: null }
  }
  if (subtotalCents < coupon.minOrderValueCents) {
    return { discountCents: 0, freeShipping: false, applied: false, rejectionReason: 'min_order_value' }
  }

  if (coupon.type === 'free_shipping') {
    return {
      discountCents: 0,
      freeShipping: true,
      applied: true,
      rejectionReason: null,
    }
  }

  let discount =
    coupon.type === 'percent' ? applyBp(subtotalCents, coupon.value) : Math.max(0, coupon.value)

  if (coupon.type === 'percent' && coupon.maxDiscountCents > 0) {
    discount = Math.min(discount, coupon.maxDiscountCents)
  }
  // Ein Gutschein darf den Warenwert nie uebersteigen — negative Summen sind ausgeschlossen.
  discount = Math.min(discount, subtotalCents)

  void shippingCents
  return { discountCents: discount, freeShipping: false, applied: true, rejectionReason: null }
}

// --- Gesamtberechnung ------------------------------------------------------

/** Berechnet den kompletten Warenkorb. Einzige autoritative Preisquelle. */
export function calculatePricing(input: PricingInput): PricingResult {
  const now = input.now ?? new Date()
  const priced = input.lines.map((line) => priceLine(line, now))

  const subtotalCents = priced.reduce((sum, l) => sum + l.lineTotalCents, 0)
  const listSubtotalCents = priced.reduce((sum, l) => sum + l.listUnitPriceCents * l.quantity, 0)
  const totalWeightGrams = priced.reduce((sum, l) => sum + l.weightGrams, 0)

  const shippingBeforeCoupon = calculateShipping(subtotalCents, totalWeightGrams, input.shipping)
  const couponEffect = applyCoupon(input.coupon, subtotalCents, shippingBeforeCoupon)

  const discountCents = couponEffect.discountCents
  const shippingCents = couponEffect.freeShipping ? 0 : shippingBeforeCoupon
  const goodsAfterDiscount = subtotalCents - discountCents
  const totalCents = goodsAfterDiscount + shippingCents

  // Gutscheinrabatt verlustfrei auf die Positionen verteilen, damit
  // Steueranteile je Steuersatz korrekt bleiben.
  const shares = distribute(
    discountCents,
    priced.map((l) => l.lineTotalCents),
  )
  const lines: PricedLine[] = priced.map((line, index) => ({
    ...line,
    couponShareCents: shares[index] ?? 0,
  }))

  // Steueranteil je Position nach Rabatt, plus Steuer auf Versand
  // (Versand folgt dem hoechsten im Warenkorb vorkommenden Satz).
  let taxCents = 0
  for (const line of lines) {
    taxCents += taxFromGross(line.lineTotalCents - line.couponShareCents, line.taxRateBp)
  }
  if (shippingCents > 0) {
    const shippingTaxBp = lines.reduce((max, l) => Math.max(max, l.taxRateBp), 1900)
    taxCents += taxFromGross(shippingCents, shippingTaxBp)
  }

  const freeShippingRemaining = Math.max(0, input.shipping.freeShippingThresholdCents - subtotalCents)

  return {
    lines,
    subtotalCents,
    listSubtotalCents,
    savingsCents: listSubtotalCents - subtotalCents,
    discountCents,
    shippingCents,
    shippingBeforeCouponCents: shippingBeforeCoupon,
    totalCents,
    taxCents,
    totalWeightGrams,
    couponCode: input.coupon?.code ?? null,
    couponApplied: couponEffect.applied,
    couponRejectionReason: couponEffect.rejectionReason,
    freeShippingThresholdCents: input.shipping.freeShippingThresholdCents,
    freeShippingRemainingCents: freeShippingRemaining,
  }
}

// --- Grundpreis (PAngV) ----------------------------------------------------

export interface BasePriceInfo {
  /** Preis je Referenzmenge in Cent */
  pricePerReferenceCents: number
  /** Anzeigetext, z. B. "24,90 € / 1 kg" */
  label: string
}

/**
 * Grundpreis nach Preisangabenverordnung.
 * `amount` ist der Inhalt (g/ml/Stueck), `reference` die Bezugsmenge.
 */
export function calculateBasePrice(
  priceCents: number,
  unit: string | null,
  amount: number | null,
  reference: number | null,
  formatter: (cents: number) => string,
): BasePriceInfo | null {
  if (!unit || !amount || amount <= 0 || !reference || reference <= 0) return null
  const pricePerReferenceCents = roundCents((priceCents / amount) * reference)
  const unitLabel =
    unit === 'kg'
      ? reference >= 1000
        ? `${reference / 1000} kg`
        : `${reference} g`
      : unit === 'l'
        ? reference >= 1000
          ? `${reference / 1000} l`
          : `${reference} ml`
        : `${reference} Stück`
  return {
    pricePerReferenceCents,
    label: `${formatter(pricePerReferenceCents)} / ${unitLabel}`,
  }
}
