import 'server-only'
import { prisma } from '@/lib/db'
import { AppError } from '@/lib/server/http'
import { calculatePricing, DEFAULT_SHIPPING_RULE, type PricingLineInput } from '@/lib/server/pricing'
import { validateCoupon } from '@/lib/server/coupons'
import { resolveOptions, summarizeOptions, type CartConfiguration } from '@/lib/server/cart'
import { decrementStock, incrementStock, type TxClient } from '@/lib/server/inventory'
import { nextNumber } from '@/lib/server/numbering'
import {
  canTransitionOrderStatus,
  ORDER_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/domain/enums'

/**
 * Bestellprozess.
 *
 * Alles Preisrelevante wird hier neu aus den Stammdaten berechnet. Aus dem
 * Browser kommen ausschliesslich Adressdaten, Menge und der Gutscheincode —
 * niemals Preise.
 *
 * Die Bestellanlage laeuft vollstaendig in einer Transaktion:
 *   Bestellnummer ziehen -> Bestand abbuchen -> Bestellung schreiben ->
 *   Gutschein einloesen -> Kundenakte fortschreiben -> Warenkorb leeren.
 * Schlaegt ein Schritt fehl (z. B. Ware zwischenzeitlich vergriffen), wird
 * alles zurueckgerollt. Ein Idempotenzschluessel verhindert Doppelbestellungen
 * bei Mehrfachklick oder Netzwerk-Retry.
 */

export interface CheckoutContact {
  email: string
  firstName: string
  lastName: string
  company?: string | null
  phone?: string | null
  street: string
  postalCode: string
  city: string
  country?: string
  note?: string | null
}

export interface CreateOrderInput {
  cartToken: string
  contact: CheckoutContact
  couponCode?: string | null
  idempotencyKey: string
  now?: Date
}

export interface CreateOrderResult {
  orderNumber: string
  orderId: string
  totalCents: number
  /** true, wenn die Bestellung bereits existierte (Doppelklick). */
  deduplicated: boolean
}

const CART_INCLUDE_FOR_ORDER = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: {
        include: {
          promotions: true,
          priceTiers: true,
          optionGroups: { include: { options: true } },
        },
      },
      variant: true,
    },
  },
} as const

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const now = input.now ?? new Date()
  const email = input.contact.email.trim().toLowerCase()

  // Idempotenz zuerst pruefen — ohne Transaktion, damit ein Doppelklick
  // sofort dieselbe Bestellung zurueckbekommt.
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, orderNumber: true, totalCents: true },
  })
  if (existing) {
    return {
      orderId: existing.id,
      orderNumber: existing.orderNumber,
      totalCents: existing.totalCents,
      deduplicated: true,
    }
  }

  const cart = await prisma.cart.findUnique({
    where: { token: input.cartToken },
    include: CART_INCLUDE_FOR_ORDER,
  })
  if (!cart || cart.items.length === 0) {
    throw new AppError('Ihr Warenkorb ist leer.', 400, 'empty_cart')
  }

  // --- Positionen aus den Stammdaten neu aufbauen ---------------------------
  const pricingLines: PricingLineInput[] = []
  const itemMeta: Array<{
    productId: string
    variantId: string | null
    quantity: number
    configuration: CartConfiguration | null
    configSummary: string | null
    name: string
    sku: string
    articleNumber: string
  }> = []

  for (const item of cart.items) {
    const product = item.product
    if (!product.active || !product.visible) {
      throw new AppError(
        `„${product.name}“ ist nicht mehr bestellbar. Bitte prüfen Sie Ihren Warenkorb.`,
        409,
        'item_unavailable',
      )
    }
    if (item.variant && !item.variant.active) {
      throw new AppError(
        `Die Variante „${item.variant.name}“ ist nicht mehr verfügbar. Bitte prüfen Sie Ihren Warenkorb.`,
        409,
        'item_unavailable',
      )
    }

    const configuration = parseConfig(item.configuration)
    const options = resolveOptions(product.optionGroups, configuration)
    const displayName = item.variant ? `${product.name} – ${item.variant.name}` : product.name

    pricingLines.push({
      key: item.id,
      productId: product.id,
      variantId: item.variant?.id ?? null,
      name: displayName,
      sku: item.variant?.sku ?? product.sku,
      articleNumber: product.articleNumber,
      basePriceCents: product.priceCents,
      variantPriceCents: item.variant?.priceCents ?? null,
      variantDeltaCents: item.variant?.priceDeltaCents ?? 0,
      taxRateBp: product.taxRateBp,
      quantity: item.quantity,
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
    })

    itemMeta.push({
      productId: product.id,
      variantId: item.variant?.id ?? null,
      quantity: item.quantity,
      configuration,
      configSummary: options.length > 0 ? summarizeOptions(options) : null,
      name: displayName,
      sku: item.variant?.sku ?? product.sku,
      articleNumber: product.articleNumber,
    })
  }

  // --- Gutschein serverseitig pruefen ---------------------------------------
  const provisional = calculatePricing({ lines: pricingLines, shipping: DEFAULT_SHIPPING_RULE, now })
  const requestedCode = input.couponCode ?? cart.couponCode
  let couponRecordId: string | null = null
  let couponInput = null

  if (requestedCode) {
    const validation = await validateCoupon(requestedCode, {
      subtotalCents: provisional.subtotalCents,
      customerEmail: email,
      now,
    })
    if (!validation.ok) {
      throw new AppError(
        validation.message ?? 'Der angegebene Gutschein ist nicht gültig.',
        409,
        'coupon_invalid',
      )
    }
    couponInput = validation.coupon ?? null
    const record = await prisma.coupon.findUnique({
      where: { code: validation.coupon!.code },
      select: { id: true },
    })
    couponRecordId = record?.id ?? null
  }

  const pricing = calculatePricing({
    lines: pricingLines,
    coupon: couponInput,
    shipping: DEFAULT_SHIPPING_RULE,
    now,
  })

  if (pricing.totalCents < 0) {
    throw new AppError('Die Bestellsumme konnte nicht berechnet werden.', 500)
  }

  // --- Transaktion ----------------------------------------------------------
  const year = now.getFullYear()

  try {
    return await prisma.$transaction(async (tx) => {
      const orderNumber = await nextNumber(tx, 'order', year)

      // Bestand vor der Bestellanlage abbuchen: bedingte Updates schlagen fehl,
      // wenn zwischenzeitlich jemand anders zugegriffen hat.
      for (const meta of itemMeta) {
        await decrementStock(
          tx,
          { productId: meta.productId, variantId: meta.variantId, quantity: meta.quantity },
          'order',
          orderNumber,
        )
      }

      const customer = await upsertCustomer(tx, email, input.contact, year)

      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          email,
          firstName: input.contact.firstName.trim(),
          lastName: input.contact.lastName.trim(),
          company: input.contact.company?.trim() || null,
          phone: input.contact.phone?.trim() || null,
          street: input.contact.street.trim(),
          postalCode: input.contact.postalCode.trim(),
          city: input.contact.city.trim(),
          country: input.contact.country ?? 'DE',
          note: input.contact.note?.trim() || null,
          subtotalCents: pricing.subtotalCents,
          discountCents: pricing.discountCents,
          shippingCents: pricing.shippingCents,
          totalCents: pricing.totalCents,
          taxCents: pricing.taxCents,
          couponCode: couponInput?.code ?? null,
          idempotencyKey: input.idempotencyKey,
          items: {
            create: itemMeta.map((meta, index) => {
              const priced = pricing.lines[index]
              return {
                productId: meta.productId,
                variantId: meta.variantId,
                name: meta.name,
                sku: meta.sku,
                articleNumber: meta.articleNumber,
                configuration: meta.configuration ? JSON.stringify(meta.configuration) : null,
                configSummary: meta.configSummary,
                quantity: meta.quantity,
                unitPriceCents: priced.unitPriceCents,
                listPriceCents: priced.listUnitPriceCents,
                lineTotalCents: priced.lineTotalCents,
                taxRateBp: priced.taxRateBp,
                weightGrams: priced.weightGrams,
              }
            }),
          },
          statusHistory: {
            create: { field: 'status', toValue: 'new', note: 'Bestellung eingegangen' },
          },
        },
        select: { id: true, orderNumber: true, totalCents: true },
      })

      if (couponRecordId && couponInput) {
        await tx.coupon.update({
          where: { id: couponRecordId },
          data: { usageCount: { increment: 1 } },
        })
        await tx.couponRedemption.create({
          data: {
            couponId: couponRecordId,
            orderId: order.id,
            customerEmail: email,
            discountCents: pricing.discountCents,
          },
        })
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          orderCount: { increment: 1 },
          totalSpentCents: { increment: pricing.totalCents },
          lastOrderAt: now,
        },
      })

      // Verkaufszahl fortschreiben, damit "Beliebtheit" echte Daten abbildet.
      for (const meta of itemMeta) {
        await tx.product.update({
          where: { id: meta.productId },
          data: { popularity: { increment: meta.quantity } },
        })
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } })
      await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } })

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalCents: order.totalCents,
        deduplicated: false,
      }
    })
  } catch (error) {
    // Ein paralleler Request mit demselben Idempotenzschluessel hat gewonnen.
    if (isUniqueConstraintError(error, 'idempotencyKey')) {
      const duplicate = await prisma.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, orderNumber: true, totalCents: true },
      })
      if (duplicate) {
        return {
          orderId: duplicate.id,
          orderNumber: duplicate.orderNumber,
          totalCents: duplicate.totalCents,
          deduplicated: true,
        }
      }
    }
    throw error
  }
}

async function upsertCustomer(
  tx: TxClient,
  email: string,
  contact: CheckoutContact,
  year: number,
): Promise<{ id: string }> {
  const existing = await tx.customer.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    await tx.customer.update({
      where: { id: existing.id },
      data: {
        firstName: contact.firstName.trim(),
        lastName: contact.lastName.trim(),
        company: contact.company?.trim() || null,
        phone: contact.phone?.trim() || null,
      },
    })
    await tx.address.deleteMany({ where: { customerId: existing.id, kind: 'shipping', isDefault: true } })
    await tx.address.create({
      data: {
        customerId: existing.id,
        kind: 'shipping',
        firstName: contact.firstName.trim(),
        lastName: contact.lastName.trim(),
        company: contact.company?.trim() || null,
        street: contact.street.trim(),
        postalCode: contact.postalCode.trim(),
        city: contact.city.trim(),
        country: contact.country ?? 'DE',
        isDefault: true,
      },
    })
    return existing
  }

  const customerNumber = await nextNumber(tx, 'customer', year)
  return tx.customer.create({
    data: {
      customerNumber,
      email,
      firstName: contact.firstName.trim(),
      lastName: contact.lastName.trim(),
      company: contact.company?.trim() || null,
      phone: contact.phone?.trim() || null,
      addresses: {
        create: {
          kind: 'shipping',
          firstName: contact.firstName.trim(),
          lastName: contact.lastName.trim(),
          company: contact.company?.trim() || null,
          street: contact.street.trim(),
          postalCode: contact.postalCode.trim(),
          city: contact.city.trim(),
          country: contact.country ?? 'DE',
          isDefault: true,
        },
      },
    },
    select: { id: true },
  })
}

function parseConfig(raw: string | null): CartConfiguration | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const out: CartConfiguration = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}

function isUniqueConstraintError(error: unknown, field: string): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { code?: string; meta?: { target?: unknown } }
  if (e.code !== 'P2002') return false
  const target = e.meta?.target
  if (Array.isArray(target)) return target.includes(field)
  if (typeof target === 'string') return target.includes(field)
  return true
}

// --- Statuswechsel ---------------------------------------------------------

export interface StatusChangeInput {
  orderId: string
  toStatus: OrderStatus
  userId: string
  note?: string | null
  trackingNumber?: string | null
  carrier?: string | null
}

/**
 * Aendert den Bestellstatus, protokolliert den Wechsel und bucht bei
 * Stornierung den Bestand zurueck — alles in einer Transaktion.
 */
export async function changeOrderStatus(input: StatusChangeInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true },
    })
    if (!order) throw new AppError('Bestellung nicht gefunden.', 404)

    const from = order.status as OrderStatus
    if (from === input.toStatus) return

    if (!canTransitionOrderStatus(from, input.toStatus)) {
      throw new AppError(
        `Der Wechsel von „${ORDER_STATUS_LABELS[from]}“ zu „${ORDER_STATUS_LABELS[input.toStatus]}“ ist nicht vorgesehen.`,
        409,
      )
    }

    const data: Record<string, unknown> = { status: input.toStatus }

    if (input.toStatus === 'shipped') {
      data.shippedAt = new Date()
      if (input.trackingNumber) data.trackingNumber = input.trackingNumber.trim()
      if (input.carrier) data.carrier = input.carrier
    }
    if (input.toStatus === 'delivered') data.deliveredAt = new Date()

    if (input.toStatus === 'cancelled') {
      data.cancelledAt = new Date()
      // Nur noch nicht zurueckgebuchte Mengen erstatten (Idempotenz).
      for (const item of order.items) {
        const open = item.quantity - item.restockedQty
        if (open <= 0 || !item.productId) continue
        await incrementStock(
          tx,
          { productId: item.productId, variantId: item.variantId, quantity: open },
          'cancellation',
          order.orderNumber,
          input.userId,
          'Rückbuchung durch Stornierung',
        )
        await tx.orderItem.update({
          where: { id: item.id },
          data: { restockedQty: item.quantity },
        })
        await tx.product.update({
          where: { id: item.productId },
          data: { popularity: { decrement: Math.min(open, 1_000_000) } },
        })
      }
      // Gutscheinnutzung freigeben, damit der Code wieder einsetzbar ist.
      const redemption = await tx.couponRedemption.findUnique({ where: { orderId: order.id } })
      if (redemption) {
        await tx.coupon.update({
          where: { id: redemption.couponId },
          data: { usageCount: { decrement: 1 } },
        })
        await tx.couponRedemption.delete({ where: { id: redemption.id } })
      }
      // Kundenkennzahlen korrigieren.
      if (order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            orderCount: { decrement: 1 },
            totalSpentCents: { decrement: order.totalCents },
          },
        })
      }
    }

    await tx.order.update({ where: { id: order.id }, data })
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        field: 'status',
        fromValue: from,
        toValue: input.toStatus,
        note: input.note?.trim() || null,
        userId: input.userId,
      },
    })
  })
}

export interface PaymentChangeInput {
  orderId: string
  toStatus: PaymentStatus
  userId: string
  /** Erstattungsbetrag in Cent; nur bei (Teil-)Erstattung relevant. */
  refundCents?: number
  note?: string | null
  /** Bei Erstattung: Ware zurueck ins Lager buchen. */
  restock?: boolean
}

/** Aendert den Zahlungsstatus und verarbeitet Erstattungen inklusive Rueckbuchung. */
export async function changePaymentStatus(input: PaymentChangeInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true },
    })
    if (!order) throw new AppError('Bestellung nicht gefunden.', 404)

    const from = order.paymentStatus as PaymentStatus
    if (from === input.toStatus && !input.refundCents) return

    const data: Record<string, unknown> = { paymentStatus: input.toStatus }

    if (input.toStatus === 'refunded' || input.toStatus === 'partially_refunded') {
      const requested = input.refundCents ?? (input.toStatus === 'refunded' ? order.totalCents : 0)
      if (requested <= 0) throw new AppError('Bitte geben Sie einen Erstattungsbetrag an.', 400)
      const maxRefundable = order.totalCents - order.refundedCents
      if (requested > maxRefundable) {
        throw new AppError(
          'Der Erstattungsbetrag übersteigt den noch erstattbaren Betrag dieser Bestellung.',
          400,
        )
      }
      data.refundedCents = order.refundedCents + requested
      data.paymentStatus =
        order.refundedCents + requested >= order.totalCents ? 'refunded' : 'partially_refunded'

      if (input.restock) {
        for (const item of order.items) {
          const open = item.quantity - item.restockedQty
          if (open <= 0 || !item.productId) continue
          await incrementStock(
            tx,
            { productId: item.productId, variantId: item.variantId, quantity: open },
            'refund',
            order.orderNumber,
            input.userId,
            'Rückbuchung durch Erstattung',
          )
          await tx.orderItem.update({ where: { id: item.id }, data: { restockedQty: item.quantity } })
        }
      }

      if (order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: { totalSpentCents: { decrement: requested } },
        })
      }
    }

    await tx.order.update({ where: { id: order.id }, data })
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        field: 'payment',
        fromValue: from,
        toValue: String(data.paymentStatus),
        note: input.note?.trim() || null,
        userId: input.userId,
      },
    })
  })
}
