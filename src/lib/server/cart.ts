import 'server-only'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { generateToken, sha256 } from '@/lib/server/crypto'
import {
  calculatePricing,
  DEFAULT_SHIPPING_RULE,
  type PricingLineInput,
  type PricingOption,
  type PricingResult,
} from '@/lib/server/pricing'
import { validateCoupon } from '@/lib/server/coupons'
import { AppError } from '@/lib/server/http'

/**
 * Warenkorb.
 *
 * Der Warenkorb lebt serverseitig; der Browser haelt nur einen opaken Token in
 * einem HttpOnly-Cookie. Damit sind Positionen und Preise nicht manipulierbar
 * und der Warenkorb ueberlebt Reloads und Geraetewechsel innerhalb der
 * Cookie-Laufzeit.
 */

export const CART_COOKIE = 'rh24_cart'
const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 Tage
export const MAX_QUANTITY_PER_LINE = 999
export const MAX_LINES_PER_CART = 60

/** Konfiguration eines Konfigurator-Artikels: Gruppenschluessel -> Optionsschluessel. */
export type CartConfiguration = Record<string, string>

/**
 * Stabiler Schluessel einer Warenkorbposition.
 * Zwei unterschiedlich konfigurierte Haken sind verschiedene Positionen,
 * zweimal dieselbe Konfiguration wird zusammengefasst.
 */
export function buildConfigHash(
  productId: string,
  variantId: string | null,
  configuration: CartConfiguration | null,
): string {
  const normalized = configuration
    ? Object.keys(configuration)
        .sort()
        .map((k) => `${k}=${configuration[k]}`)
        .join('&')
    : ''
  return sha256(`${productId}|${variantId ?? ''}|${normalized}`).slice(0, 32)
}

function cartCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CART_TTL_MS / 1000,
  }
}

/** Liest den Warenkorb-Token; legt keinen an. */
export async function getCartToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(CART_COOKIE)?.value ?? null
}

/** Liest den Warenkorb oder legt einen neuen an (nur in Route Handlern/Actions). */
export async function getOrCreateCart(): Promise<{ id: string; token: string }> {
  const store = await cookies()
  const existingToken = store.get(CART_COOKIE)?.value

  if (existingToken) {
    const cart = await prisma.cart.findUnique({ where: { token: existingToken }, select: { id: true } })
    if (cart) {
      await prisma.cart
        .update({ where: { id: cart.id }, data: { expiresAt: new Date(Date.now() + CART_TTL_MS) } })
        .catch(() => undefined)
      return { id: cart.id, token: existingToken }
    }
  }

  const token = generateToken(24)
  const cart = await prisma.cart.create({
    data: { token, expiresAt: new Date(Date.now() + CART_TTL_MS) },
    select: { id: true },
  })
  store.set(CART_COOKIE, token, cartCookieOptions())
  return { id: cart.id, token }
}

const CART_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: {
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          category: { select: { name: true, slug: true } },
          promotions: true,
          priceTiers: { orderBy: { minQty: 'asc' } },
          optionGroups: { include: { options: true } },
        },
      },
      variant: true,
    },
  },
} as const

export interface CartLineView {
  id: string
  productId: string
  productSlug: string
  productName: string
  categoryName: string
  variantId: string | null
  variantName: string | null
  imageUrl: string | null
  quantity: number
  configuration: CartConfiguration | null
  configSummary: string | null
  options: PricingOption[]
  unitPriceCents: number
  listUnitPriceCents: number
  lineTotalCents: number
  savingsCents: number
  appliedPromotionName: string | null
  appliedTierMinQty: number | null
  appliedTierDiscountBp: number
  /** Verfuegbarer Bestand; 0 bedeutet ausverkauft. */
  availableStock: number
  allowBackorder: boolean
  maxQuantity: number
  taxRateBp: number
  sku: string
  articleNumber: string
}

export interface CartView {
  id: string
  lines: CartLineView[]
  pricing: PricingResult
  itemCount: number
  couponCode: string | null
  couponMessage: string | null
  /** Hinweise auf Bestands- oder Verfuegbarkeitsprobleme. */
  notices: string[]
}

/** Leerer Warenkorb, ohne dass ein Datensatz angelegt wird. */
export function emptyCartView(): CartView {
  return {
    id: '',
    lines: [],
    pricing: calculatePricing({ lines: [], shipping: DEFAULT_SHIPPING_RULE }),
    itemCount: 0,
    couponCode: null,
    couponMessage: null,
    notices: [],
  }
}

type CartWithItems = Awaited<ReturnType<typeof loadCartRecord>>

async function loadCartRecord(token: string) {
  return prisma.cart.findUnique({ where: { token }, include: CART_INCLUDE })
}

/**
 * Baut die vollstaendige Warenkorbansicht inklusive serverseitig berechneter
 * Preise. Einzige Quelle fuer alles, was der Warenkorb anzeigt.
 */
export async function buildCartView(token: string | null, now: Date = new Date()): Promise<CartView> {
  if (!token) return emptyCartView()
  const cart = await loadCartRecord(token)
  if (!cart) return emptyCartView()

  const notices: string[] = []
  const lines: Array<{ view: Omit<CartLineView, 'unitPriceCents' | 'listUnitPriceCents' | 'lineTotalCents' | 'savingsCents' | 'appliedPromotionName' | 'appliedTierMinQty' | 'appliedTierDiscountBp'>; pricing: PricingLineInput }> = []

  for (const item of cart.items) {
    const product = item.product
    if (!product.active || !product.visible) {
      notices.push(`„${product.name}“ ist derzeit nicht bestellbar und wurde entfernt.`)
      await prisma.cartItem.delete({ where: { id: item.id } }).catch(() => undefined)
      continue
    }
    if (item.variant && !item.variant.active) {
      notices.push(`Die Variante „${item.variant.name}“ ist nicht mehr verfügbar und wurde entfernt.`)
      await prisma.cartItem.delete({ where: { id: item.id } }).catch(() => undefined)
      continue
    }

    const configuration = parseConfiguration(item.configuration)
    const options = resolveOptions(product.optionGroups, configuration)

    const available = item.variant
      ? Math.max(0, item.variant.stock - item.variant.reservedStock)
      : Math.max(0, product.stock - product.reservedStock)

    let quantity = item.quantity
    if (!product.allowBackorder && quantity > available) {
      if (available <= 0) {
        notices.push(`„${product.name}“ ist aktuell ausverkauft und wurde aus dem Warenkorb entfernt.`)
        await prisma.cartItem.delete({ where: { id: item.id } }).catch(() => undefined)
        continue
      }
      notices.push(`Von „${product.name}“ sind nur noch ${available} Stück verfügbar. Die Menge wurde angepasst.`)
      quantity = available
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } }).catch(() => undefined)
    }

    lines.push({
      view: {
        id: item.id,
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        categoryName: product.category.name,
        variantId: item.variant?.id ?? null,
        variantName: item.variant?.name ?? null,
        imageUrl: product.images[0]?.url ?? null,
        quantity,
        configuration,
        configSummary: options.length > 0 ? summarizeOptions(options) : null,
        options,
        availableStock: available,
        allowBackorder: product.allowBackorder,
        maxQuantity: product.allowBackorder
          ? MAX_QUANTITY_PER_LINE
          : Math.min(MAX_QUANTITY_PER_LINE, Math.max(1, available)),
        taxRateBp: product.taxRateBp,
        sku: item.variant?.sku ?? product.sku,
        articleNumber: product.articleNumber,
      },
      pricing: {
        key: item.id,
        productId: product.id,
        variantId: item.variant?.id ?? null,
        name: item.variant ? `${product.name} – ${item.variant.name}` : product.name,
        sku: item.variant?.sku ?? product.sku,
        articleNumber: product.articleNumber,
        basePriceCents: product.priceCents,
        variantPriceCents: item.variant?.priceCents ?? null,
        variantDeltaCents: item.variant?.priceDeltaCents ?? 0,
        taxRateBp: product.taxRateBp,
        quantity,
        weightGrams: item.variant?.weightGrams ?? product.shippingWeightGrams ?? product.weightGrams ?? 0,
        options,
        promotions: product.promotions.map((p) => ({
          id: p.id,
          name: p.name,
          salePriceCents: p.salePriceCents,
          discountBp: p.discountBp,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          active: p.active,
        })),
        priceTiers: product.priceTiers.map((t) => ({ minQty: t.minQty, discountBp: t.discountBp })),
      },
    })
  }

  // Gutschein serverseitig gegen den aktuellen Warenwert pruefen.
  let couponInput = null
  let couponMessage: string | null = null
  if (cart.couponCode) {
    const provisional = calculatePricing({
      lines: lines.map((l) => l.pricing),
      shipping: DEFAULT_SHIPPING_RULE,
      now,
    })
    const validation = await validateCoupon(cart.couponCode, {
      subtotalCents: provisional.subtotalCents,
      now,
    })
    if (validation.ok && validation.coupon) {
      couponInput = validation.coupon
    } else {
      couponMessage = validation.message ?? 'Der Gutschein ist nicht mehr gültig.'
      if (validation.error !== 'min_order_value') {
        await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } }).catch(() => undefined)
      } else if (validation.coupon === undefined && validation.minOrderValueCents !== undefined) {
        // Mindestbestellwert nicht erreicht: Code bleibt gespeichert, wirkt aber nicht.
      }
    }
  }

  const pricing = calculatePricing({
    lines: lines.map((l) => l.pricing),
    coupon: couponInput,
    shipping: DEFAULT_SHIPPING_RULE,
    now,
  })

  const viewLines: CartLineView[] = lines.map((line, index) => {
    const priced = pricing.lines[index]
    return {
      ...line.view,
      unitPriceCents: priced.unitPriceCents,
      listUnitPriceCents: priced.listUnitPriceCents,
      lineTotalCents: priced.lineTotalCents,
      savingsCents: priced.savingsCents,
      appliedPromotionName: priced.appliedPromotionName,
      appliedTierMinQty: priced.appliedTierMinQty,
      appliedTierDiscountBp: priced.appliedTierDiscountBp,
    }
  })

  return {
    id: cart.id,
    lines: viewLines,
    pricing,
    itemCount: viewLines.reduce((sum, l) => sum + l.quantity, 0),
    couponCode: cart.couponCode,
    couponMessage,
    notices,
  }
}

function parseConfiguration(raw: string | null): CartConfiguration | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const out: CartConfiguration = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value
    }
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}

type OptionGroups = NonNullable<CartWithItems>['items'][number]['product']['optionGroups']

/** Loest gespeicherte Optionsschluessel gegen die aktuellen Stammdaten auf. */
export function resolveOptions(
  groups: OptionGroups,
  configuration: CartConfiguration | null,
): PricingOption[] {
  if (!configuration) return []
  const result: PricingOption[] = []
  for (const group of [...groups].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const selected = configuration[group.key]
    if (!selected) continue
    const option = group.options.find((o) => o.key === selected && o.active)
    if (!option) continue
    result.push({
      groupKey: group.key,
      optionKey: option.key,
      label: option.label,
      groupLabel: group.label,
      priceDeltaCents: option.priceDeltaCents,
      priceDeltaBp: option.priceDeltaBp,
      weightDeltaGrams: option.weightDeltaGrams,
    })
  }
  return result
}

export function summarizeOptions(options: PricingOption[]): string {
  return options.map((o) => `${o.groupLabel}: ${o.label}`).join(' · ')
}

/** Entfernt abgelaufene Warenkoerbe. */
export async function pruneCarts(): Promise<number> {
  const result = await prisma.cart.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  return result.count
}

export function assertQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError('Bitte geben Sie eine Menge ab 1 an.', 400)
  }
  if (quantity > MAX_QUANTITY_PER_LINE) {
    throw new AppError(
      `Pro Position sind maximal ${MAX_QUANTITY_PER_LINE} Stück möglich. Für größere Mengen sprechen Sie uns bitte direkt an.`,
      400,
    )
  }
  return quantity
}
