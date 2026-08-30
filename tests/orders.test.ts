import { beforeEach, describe, expect, it } from 'vitest'
import {
  addCartItem,
  createCart,
  createCoupon,
  createProduct,
  prisma,
  resetDatabase,
  TEST_CONTACT,
} from './helpers/db'
import { changeOrderStatus, changePaymentStatus, createOrder } from '@/lib/server/orders'
import { checkAvailability, setStock } from '@/lib/server/inventory'
import { validateCoupon } from '@/lib/server/coupons'
import { AppError } from '@/lib/server/http'

/**
 * Bestellungen, Lager und Gutscheine — die Abläufe, bei denen ein Fehler
 * unmittelbar Geld oder Ware kostet.
 *
 * Diese Tests laufen gegen eine echte Datenbank, weil genau das Zusammenspiel
 * aus Transaktion, bedingtem Update und eindeutigem Index geprüft werden soll.
 * Ein Test mit Attrappen würde die interessanten Fehler nicht finden.
 */

let counter = 0
function idempotencyKey(): string {
  counter += 1
  return `test-idem-${counter}-${counter * 7919}`
}

beforeEach(async () => {
  await resetDatabase()
})

describe('createOrder', () => {
  it('legt eine Bestellung an und bucht den Bestand ab', async () => {
    const product = await createProduct({ priceCents: 2000, stock: 10 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 3)

    const result = await createOrder({
      cartToken: cart.token,
      contact: TEST_CONTACT,
      idempotencyKey: idempotencyKey(),
    })

    expect(result.deduplicated).toBe(false)
    expect(result.orderNumber).toMatch(/^RH-\d{4}-\d+$/)

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.orderId },
      include: { items: true },
    })
    expect(order.subtotalCents).toBe(6000)
    expect(order.items).toHaveLength(1)
    expect(order.items[0].quantity).toBe(3)

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.stock).toBe(7)
  })

  it('schreibt einen Journaleintrag für die Bestandsänderung', async () => {
    const product = await createProduct({ stock: 10 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 2)

    const result = await createOrder({
      cartToken: cart.token,
      contact: TEST_CONTACT,
      idempotencyKey: idempotencyKey(),
    })

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { reference: result.orderNumber },
    })
    expect(movement.delta).toBe(-2)
    expect(movement.stockAfter).toBe(8)
    expect(movement.reason).toBe('order')
  })

  it('leert den Warenkorb nach der Bestellung', async () => {
    const product = await createProduct({ stock: 10 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 1)

    await createOrder({
      cartToken: cart.token,
      contact: TEST_CONTACT,
      idempotencyKey: idempotencyKey(),
    })

    const items = await prisma.cartItem.count({ where: { cartId: cart.id } })
    expect(items).toBe(0)
  })

  it('legt eine Kundenakte an und schreibt die Kennzahlen fort', async () => {
    const product = await createProduct({ priceCents: 5000, stock: 10 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 1)

    const result = await createOrder({
      cartToken: cart.token,
      contact: TEST_CONTACT,
      idempotencyKey: idempotencyKey(),
    })

    const customer = await prisma.customer.findUniqueOrThrow({ where: { email: TEST_CONTACT.email } })
    expect(customer.orderCount).toBe(1)
    expect(customer.customerNumber).toMatch(/^K-\d{4}-\d+$/)

    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })
    expect(customer.totalSpentCents).toBe(order.totalCents)
  })

  it('lehnt einen leeren Warenkorb ab', async () => {
    const cart = await createCart()
    await expect(
      createOrder({ cartToken: cart.token, contact: TEST_CONTACT, idempotencyKey: idempotencyKey() }),
    ).rejects.toThrow(AppError)
  })

  it('lehnt einen unbekannten Warenkorb ab', async () => {
    await expect(
      createOrder({ cartToken: 'gibt-es-nicht', contact: TEST_CONTACT, idempotencyKey: idempotencyKey() }),
    ).rejects.toThrow(AppError)
  })

  it('verhindert Doppelbestellungen über den Idempotenzschlüssel', async () => {
    const product = await createProduct({ stock: 10 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 2)

    const key = idempotencyKey()
    const first = await createOrder({ cartToken: cart.token, contact: TEST_CONTACT, idempotencyKey: key })
    const second = await createOrder({ cartToken: cart.token, contact: TEST_CONTACT, idempotencyKey: key })

    expect(second.deduplicated).toBe(true)
    expect(second.orderNumber).toBe(first.orderNumber)
    expect(await prisma.order.count()).toBe(1)

    // Entscheidend: Der Bestand darf nur einmal abgebucht worden sein.
    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.stock).toBe(8)
  })

  it('lehnt ab, wenn die Ware zwischenzeitlich vergriffen ist', async () => {
    const product = await createProduct({ stock: 5 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 5)

    // Zwischen dem Legen in den Warenkorb und der Bestellung kauft jemand anders.
    await prisma.product.update({ where: { id: product.id }, data: { stock: 2 } })

    await expect(
      createOrder({ cartToken: cart.token, contact: TEST_CONTACT, idempotencyKey: idempotencyKey() }),
    ).rejects.toThrow(/nicht mehr in der gewünschten Menge/)

    // Nichts darf halb passiert sein: keine Bestellung, kein Bestandsabzug.
    expect(await prisma.order.count()).toBe(0)
    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.stock).toBe(2)
  })

  it('lehnt ab, wenn ein Artikel zwischenzeitlich deaktiviert wurde', async () => {
    const product = await createProduct({ stock: 10 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 1)
    await prisma.product.update({ where: { id: product.id }, data: { active: false } })

    await expect(
      createOrder({ cartToken: cart.token, contact: TEST_CONTACT, idempotencyKey: idempotencyKey() }),
    ).rejects.toThrow(/nicht mehr bestellbar/)
    expect(await prisma.order.count()).toBe(0)
  })

  it('erlaubt Bestellungen unter null, wenn Nachfertigung zugelassen ist', async () => {
    const product = await createProduct({ stock: 0, allowBackorder: true })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 5)

    await createOrder({ cartToken: cart.token, contact: TEST_CONTACT, idempotencyKey: idempotencyKey() })

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.stock).toBe(-5)
  })

  it('löst einen Gutschein ein und zählt die Nutzung', async () => {
    const product = await createProduct({ priceCents: 10_000, stock: 10 })
    const coupon = await createCoupon({ code: 'TESTRABATT', type: 'percent', value: 1000 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 1)
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: coupon.code } })

    const result = await createOrder({
      cartToken: cart.token,
      contact: TEST_CONTACT,
      idempotencyKey: idempotencyKey(),
    })

    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })
    expect(order.discountCents).toBe(1000)
    expect(order.couponCode).toBe('TESTRABATT')

    const updated = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })
    expect(updated.usageCount).toBe(1)

    const redemption = await prisma.couponRedemption.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(redemption.discountCents).toBe(1000)
  })

  it('lehnt einen abgelaufenen Gutschein bei der Bestellung ab', async () => {
    const product = await createProduct({ stock: 10 })
    const coupon = await createCoupon({
      code: 'ALT',
      endsAt: new Date(Date.now() - 86_400_000),
    })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 1)
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: coupon.code } })

    await expect(
      createOrder({ cartToken: cart.token, contact: TEST_CONTACT, idempotencyKey: idempotencyKey() }),
    ).rejects.toThrow(/abgelaufen/)
    expect(await prisma.order.count()).toBe(0)
  })

  it('rechnet Preise aus den Stammdaten neu, nicht aus dem Warenkorb', async () => {
    const product = await createProduct({ priceCents: 1000, stock: 10 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 2)

    // Der Preis ändert sich, nachdem der Artikel im Warenkorb lag.
    await prisma.product.update({ where: { id: product.id }, data: { priceCents: 1500 } })

    const result = await createOrder({
      cartToken: cart.token,
      contact: TEST_CONTACT,
      idempotencyKey: idempotencyKey(),
    })

    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } })
    expect(order.subtotalCents).toBe(3000)
  })
})

describe('changeOrderStatus', () => {
  async function orderWith(stock: number, quantity: number) {
    const product = await createProduct({ priceCents: 1000, stock })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, quantity)
    const result = await createOrder({
      cartToken: cart.token,
      contact: TEST_CONTACT,
      idempotencyKey: idempotencyKey(),
    })
    const user = await prisma.user.create({
      data: {
        email: `mitarbeiter-${counter}@example.com`,
        firstName: 'Test',
        lastName: 'Mitarbeiter',
        passwordHash: 'scrypt$1$1$1$AA==$AA==',
        role: {
          create: { key: `rolle-${counter}`, name: 'Testrolle' },
        },
      },
    })
    return { product, order: result, userId: user.id }
  }

  it('wechselt den Status und schreibt die Historie', async () => {
    const { order, userId } = await orderWith(10, 1)
    await changeOrderStatus({ orderId: order.orderId, toStatus: 'confirmed', userId, note: 'Geprüft' })

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.orderId },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    })
    expect(updated.status).toBe('confirmed')
    const last = updated.statusHistory[updated.statusHistory.length - 1]
    expect(last.fromValue).toBe('new')
    expect(last.toValue).toBe('confirmed')
    expect(last.note).toBe('Geprüft')
  })

  it('lehnt einen unzulässigen Statussprung ab', async () => {
    const { order, userId } = await orderWith(10, 1)
    await expect(
      changeOrderStatus({ orderId: order.orderId, toStatus: 'delivered', userId }),
    ).rejects.toThrow(/nicht vorgesehen/)
  })

  it('bucht bei Stornierung den Bestand zurück', async () => {
    const { product, order, userId } = await orderWith(10, 4)
    const afterOrder = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(afterOrder.stock).toBe(6)

    await changeOrderStatus({ orderId: order.orderId, toStatus: 'cancelled', userId })

    const afterCancel = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(afterCancel.stock).toBe(10)

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { reason: 'cancellation' },
    })
    expect(movement.delta).toBe(4)
  })

  it('bucht bei doppelter Stornierung nicht zweimal zurück', async () => {
    const { product, order, userId } = await orderWith(10, 4)
    await changeOrderStatus({ orderId: order.orderId, toStatus: 'cancelled', userId })
    // Der zweite Aufruf ist ein No-Op, weil der Status bereits erreicht ist.
    await changeOrderStatus({ orderId: order.orderId, toStatus: 'cancelled', userId })

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.stock).toBe(10)
  })

  it('gibt bei Stornierung die Gutscheinnutzung wieder frei', async () => {
    const product = await createProduct({ priceCents: 10_000, stock: 10 })
    const coupon = await createCoupon({ code: 'STORNO', type: 'percent', value: 1000 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 1)
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: coupon.code } })
    const result = await createOrder({
      cartToken: cart.token,
      contact: TEST_CONTACT,
      idempotencyKey: idempotencyKey(),
    })
    const user = await prisma.user.create({
      data: {
        email: 'storno@example.com',
        firstName: 'S',
        lastName: 'T',
        passwordHash: 'scrypt$1$1$1$AA==$AA==',
        role: { create: { key: 'rolle-storno', name: 'Storno' } },
      },
    })

    await changeOrderStatus({ orderId: result.orderId, toStatus: 'cancelled', userId: user.id })

    const updated = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })
    expect(updated.usageCount).toBe(0)
    expect(await prisma.couponRedemption.count()).toBe(0)
  })

  it('verlangt beim Versand keine Rückbuchung', async () => {
    const { product, order, userId } = await orderWith(10, 2)
    await changeOrderStatus({ orderId: order.orderId, toStatus: 'confirmed', userId })
    await changeOrderStatus({ orderId: order.orderId, toStatus: 'picking', userId })
    await changeOrderStatus({ orderId: order.orderId, toStatus: 'packed', userId })
    await changeOrderStatus({
      orderId: order.orderId,
      toStatus: 'shipped',
      userId,
      carrier: 'dhl',
      trackingNumber: '00340434123456789',
    })

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })
    expect(updated.status).toBe('shipped')
    expect(updated.trackingNumber).toBe('00340434123456789')
    expect(updated.shippedAt).not.toBeNull()

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.stock).toBe(8)
  })
})

describe('changePaymentStatus', () => {
  async function paidOrder() {
    const product = await createProduct({ priceCents: 10_000, stock: 10 })
    const cart = await createCart()
    await addCartItem(cart.id, product.id, 2)
    const result = await createOrder({
      cartToken: cart.token,
      contact: TEST_CONTACT,
      idempotencyKey: idempotencyKey(),
    })
    const user = await prisma.user.create({
      data: {
        email: `zahlung-${counter}@example.com`,
        firstName: 'Z',
        lastName: 'A',
        passwordHash: 'scrypt$1$1$1$AA==$AA==',
        role: { create: { key: `rolle-zahlung-${counter}`, name: 'Zahlung' } },
      },
    })
    return { product, order: result, userId: user.id }
  }

  it('setzt den Zahlungsstatus auf bezahlt', async () => {
    const { order, userId } = await paidOrder()
    await changePaymentStatus({ orderId: order.orderId, toStatus: 'paid', userId })

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })
    expect(updated.paymentStatus).toBe('paid')
  })

  it('erfasst eine Teilerstattung', async () => {
    const { order, userId } = await paidOrder()
    await changePaymentStatus({ orderId: order.orderId, toStatus: 'paid', userId })
    await changePaymentStatus({
      orderId: order.orderId,
      toStatus: 'partially_refunded',
      userId,
      refundCents: 5000,
    })

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })
    expect(updated.refundedCents).toBe(5000)
    expect(updated.paymentStatus).toBe('partially_refunded')
  })

  it('setzt den Status automatisch auf voll erstattet, wenn der Betrag erreicht ist', async () => {
    const { order, userId } = await paidOrder()
    const full = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })

    await changePaymentStatus({
      orderId: order.orderId,
      toStatus: 'partially_refunded',
      userId,
      refundCents: full.totalCents,
    })

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })
    expect(updated.paymentStatus).toBe('refunded')
  })

  it('lehnt eine Erstattung über dem Bestellwert ab', async () => {
    const { order, userId } = await paidOrder()
    const full = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })

    await expect(
      changePaymentStatus({
        orderId: order.orderId,
        toStatus: 'refunded',
        userId,
        refundCents: full.totalCents + 1,
      }),
    ).rejects.toThrow(/übersteigt/)
  })

  it('bucht bei Erstattung mit Rücknahme den Bestand zurück', async () => {
    const { product, order, userId } = await paidOrder()
    const before = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(before.stock).toBe(8)

    const full = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })
    await changePaymentStatus({
      orderId: order.orderId,
      toStatus: 'refunded',
      userId,
      refundCents: full.totalCents,
      restock: true,
    })

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.stock).toBe(10)
  })

  it('bucht ohne Rücknahme nichts zurück', async () => {
    const { product, order, userId } = await paidOrder()
    const full = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })

    await changePaymentStatus({
      orderId: order.orderId,
      toStatus: 'refunded',
      userId,
      refundCents: full.totalCents,
      restock: false,
    })

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(after.stock).toBe(8)
  })
})

describe('validateCoupon', () => {
  it('nimmt einen gültigen Gutschein an', async () => {
    await createCoupon({ code: 'GUELTIG', type: 'percent', value: 1000 })
    const result = await validateCoupon('gueltig', { subtotalCents: 10_000 })
    expect(result.ok).toBe(true)
    expect(result.coupon?.code).toBe('GUELTIG')
  })

  it('lehnt einen unbekannten Code ab', async () => {
    const result = await validateCoupon('GIBTESNICHT')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('not_found')
  })

  it('lehnt einen deaktivierten Gutschein ab', async () => {
    await createCoupon({ code: 'INAKTIV', active: false })
    expect((await validateCoupon('INAKTIV')).error).toBe('inactive')
  })

  it('lehnt einen noch nicht gestarteten Gutschein ab', async () => {
    await createCoupon({ code: 'SPAETER', startsAt: new Date(Date.now() + 86_400_000) })
    expect((await validateCoupon('SPAETER')).error).toBe('not_started')
  })

  it('lehnt einen abgelaufenen Gutschein ab', async () => {
    await createCoupon({ code: 'VORBEI', endsAt: new Date(Date.now() - 1000) })
    expect((await validateCoupon('VORBEI')).error).toBe('expired')
  })

  it('lehnt einen ausgeschöpften Gutschein ab', async () => {
    await createCoupon({ code: 'VOLL', usageLimit: 5, usageCount: 5 })
    expect((await validateCoupon('VOLL')).error).toBe('usage_limit')
  })

  it('lehnt bei verfehltem Mindestbestellwert ab und nennt den Betrag', async () => {
    await createCoupon({ code: 'MINDEST', minOrderValueCents: 5000 })
    const result = await validateCoupon('MINDEST', { subtotalCents: 4000 })
    expect(result.error).toBe('min_order_value')
    expect(result.minOrderValueCents).toBe(5000)
  })

  it('setzt das Limit je Kunde durch', async () => {
    const coupon = await createCoupon({ code: 'EINMAL', perCustomerLimit: 1 })
    const product = await createProduct({ stock: 10 })
    const order = await prisma.order.create({
      data: {
        orderNumber: 'RH-2026-99999',
        email: 'wiederholer@example.com',
        firstName: 'W',
        lastName: 'H',
        street: 'Weg 1',
        postalCode: '12345',
        city: 'Ort',
        subtotalCents: 1000,
        totalCents: 1000,
      },
    })
    await prisma.couponRedemption.create({
      data: {
        couponId: coupon.id,
        orderId: order.id,
        customerEmail: 'wiederholer@example.com',
        discountCents: 100,
      },
    })
    void product

    const result = await validateCoupon('EINMAL', { customerEmail: 'wiederholer@example.com' })
    expect(result.error).toBe('customer_limit')

    const other = await validateCoupon('EINMAL', { customerEmail: 'andere@example.com' })
    expect(other.ok).toBe(true)
  })

  it('behandelt Schreibweise und Leerzeichen tolerant', async () => {
    await createCoupon({ code: 'TOLERANT' })
    expect((await validateCoupon('  tolerant  ')).ok).toBe(true)
    expect((await validateCoupon('To Le Rant')).ok).toBe(true)
  })
})

describe('Lager', () => {
  it('setzt den Bestand und protokolliert die Differenz', async () => {
    const product = await createProduct({ stock: 20 })
    const user = await prisma.user.create({
      data: {
        email: 'lager@example.com',
        firstName: 'L',
        lastName: 'A',
        passwordHash: 'scrypt$1$1$1$AA==$AA==',
        role: { create: { key: 'rolle-lager', name: 'Lager' } },
      },
    })

    const result = await setStock(product.id, 35, user.id, 'Wareneingang')
    expect(result.stock).toBe(35)
    expect(result.delta).toBe(15)

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { productId: product.id, reason: 'manual' },
    })
    expect(movement.delta).toBe(15)
    expect(movement.note).toBe('Wareneingang')
  })

  it('schreibt nichts, wenn sich der Bestand nicht ändert', async () => {
    const product = await createProduct({ stock: 20 })
    const user = await prisma.user.create({
      data: {
        email: 'lager2@example.com',
        firstName: 'L',
        lastName: 'B',
        passwordHash: 'scrypt$1$1$1$AA==$AA==',
        role: { create: { key: 'rolle-lager2', name: 'Lager 2' } },
      },
    })

    const result = await setStock(product.id, 20, user.id)
    expect(result.delta).toBe(0)
    expect(await prisma.inventoryMovement.count({ where: { reason: 'manual' } })).toBe(0)
  })

  it('lehnt negative Bestände ab', async () => {
    const product = await createProduct({ stock: 20 })
    await expect(setStock(product.id, -1, 'user')).rejects.toThrow(AppError)
  })

  it('meldet Verfügbarkeitsprobleme, ohne etwas zu buchen', async () => {
    const available = await createProduct({ stock: 10 })
    const soldOut = await createProduct({ stock: 0 })
    const inactive = await createProduct({ stock: 10, active: false })

    const issues = await checkAvailability([
      { productId: available.id, quantity: 5 },
      { productId: soldOut.id, quantity: 1 },
      { productId: inactive.id, quantity: 1 },
      { productId: 'gibt-es-nicht', quantity: 1 },
    ])

    expect(issues).toHaveLength(3)
    expect(issues.find((i) => i.productId === soldOut.id)?.reason).toBe('out_of_stock')
    expect(issues.find((i) => i.productId === inactive.id)?.reason).toBe('inactive')
    expect(issues.find((i) => i.productId === 'gibt-es-nicht')?.reason).toBe('missing')

    // Nichts wurde verändert.
    const after = await prisma.product.findUniqueOrThrow({ where: { id: available.id } })
    expect(after.stock).toBe(10)
  })

  it('meldet bei Nachfertigung kein Problem', async () => {
    const product = await createProduct({ stock: 0, allowBackorder: true })
    const issues = await checkAvailability([{ productId: product.id, quantity: 100 }])
    expect(issues).toHaveLength(0)
  })
})
