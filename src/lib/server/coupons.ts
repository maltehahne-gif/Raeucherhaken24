import { prisma } from '@/lib/db'
import type { CouponType } from '@/lib/domain/enums'
import type { PricingCouponInput } from '@/lib/server/pricing'

/**
 * Gutscheinpruefung — ausschliesslich serverseitig.
 *
 * Der Browser darf einen Code vorschlagen; ob und in welcher Hoehe er wirkt,
 * entscheidet allein diese Datei. Warenkorb-Vorschau und Bestellanlage rufen
 * dieselbe Funktion auf, damit sich beide niemals unterscheiden koennen.
 */

export type CouponError =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'usage_limit'
  | 'customer_limit'
  | 'min_order_value'

export const COUPON_ERROR_MESSAGES: Record<CouponError, string> = {
  not_found: 'Dieser Gutscheincode ist uns nicht bekannt.',
  inactive: 'Dieser Gutschein ist derzeit nicht aktiv.',
  not_started: 'Dieser Gutschein ist noch nicht gültig.',
  expired: 'Dieser Gutschein ist abgelaufen.',
  usage_limit: 'Dieser Gutschein wurde bereits vollständig eingelöst.',
  customer_limit: 'Sie haben diesen Gutschein bereits eingelöst.',
  min_order_value: 'Der Mindestbestellwert für diesen Gutschein ist noch nicht erreicht.',
}

export interface CouponValidation {
  ok: boolean
  error?: CouponError
  message?: string
  coupon?: PricingCouponInput
  /** Nur gesetzt, wenn der Mindestbestellwert verfehlt wurde. */
  minOrderValueCents?: number
}

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Prueft einen Gutschein vollstaendig.
 *
 * @param subtotalCents Warenwert; wird nur geprueft, wenn angegeben. Bei der
 *   Anzeige im Warenkorb wird der Mindestbestellwert bewusst als Hinweis und
 *   nicht als harter Fehler behandelt.
 */
export async function validateCoupon(
  codeRaw: string,
  options: { subtotalCents?: number; customerEmail?: string; now?: Date } = {},
): Promise<CouponValidation> {
  const code = normalizeCouponCode(codeRaw)
  if (code.length === 0) return { ok: false, error: 'not_found', message: COUPON_ERROR_MESSAGES.not_found }

  const now = options.now ?? new Date()
  const coupon = await prisma.coupon.findUnique({ where: { code } })

  if (!coupon) return fail('not_found')
  if (!coupon.active) return fail('inactive')
  if (coupon.startsAt && coupon.startsAt.getTime() > now.getTime()) return fail('not_started')
  if (coupon.endsAt && coupon.endsAt.getTime() <= now.getTime()) return fail('expired')
  if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) return fail('usage_limit')

  if (coupon.perCustomerLimit > 0 && options.customerEmail) {
    const used = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, customerEmail: options.customerEmail.trim().toLowerCase() },
    })
    if (used >= coupon.perCustomerLimit) return fail('customer_limit')
  }

  if (options.subtotalCents !== undefined && options.subtotalCents < coupon.minOrderValueCents) {
    return {
      ok: false,
      error: 'min_order_value',
      message: COUPON_ERROR_MESSAGES.min_order_value,
      minOrderValueCents: coupon.minOrderValueCents,
    }
  }

  return {
    ok: true,
    coupon: {
      code: coupon.code,
      type: coupon.type as CouponType,
      value: coupon.value,
      minOrderValueCents: coupon.minOrderValueCents,
      maxDiscountCents: coupon.maxDiscountCents,
    },
  }
}

function fail(error: CouponError): CouponValidation {
  return { ok: false, error, message: COUPON_ERROR_MESSAGES[error] }
}

/** Menschenlesbare Beschreibung eines Gutscheins fuer die Warenkorbanzeige. */
export function describeCoupon(
  type: CouponType,
  value: number,
  formatPrice: (cents: number) => string,
): string {
  switch (type) {
    case 'percent':
      return `${(value / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} % Rabatt`
    case 'fixed':
      return `${formatPrice(value)} Rabatt`
    case 'free_shipping':
      return 'Versandkostenfrei'
  }
}
