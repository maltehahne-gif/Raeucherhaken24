import { PrismaClient } from '@prisma/client'

/**
 * Datenbankhilfen für Integrationstests.
 *
 * Die Tests laufen gegen die Testdatenbank aus tests/setup.ts. Jeder Test legt
 * sich die Daten an, die er braucht, und räumt vorher auf — dadurch sind die
 * Tests unabhängig voneinander und in beliebiger Reihenfolge lauffähig.
 */

export const prisma = new PrismaClient()

/** Leert alle Tabellen in der Reihenfolge der Fremdschlüssel. */
export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.recipeRating.deleteMany(),
    prisma.recipeProduct.deleteMany(),
    prisma.recipeStep.deleteMany(),
    prisma.recipeIngredient.deleteMany(),
    prisma.recipe.deleteMany(),
    prisma.projectAttachment.deleteMany(),
    prisma.customProject.deleteMany(),
    prisma.supportMessage.deleteMany(),
    prisma.supportRequest.deleteMany(),
    prisma.couponRedemption.deleteMany(),
    prisma.orderStatusHistory.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.address.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.configOption.deleteMany(),
    prisma.configOptionGroup.deleteMany(),
    prisma.priceTier.deleteMany(),
    prisma.promotion.deleteMany(),
    prisma.productRelation.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.productSpec.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.session.deleteMany(),
    prisma.loginAttempt.deleteMany(),
    prisma.user.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.seasonalTheme.deleteMany(),
    prisma.searchSynonym.deleteMany(),
    prisma.searchQueryLog.deleteMany(),
    prisma.setting.deleteMany(),
  ])
}

let sequence = 0
function next(): number {
  sequence += 1
  return sequence
}

export async function createCategory(slug = `kategorie-${next()}`) {
  return prisma.category.create({
    data: { slug, name: `Kategorie ${slug}`, sortOrder: 0 },
  })
}

export interface TestProductOptions {
  priceCents?: number
  stock?: number
  allowBackorder?: boolean
  active?: boolean
  visible?: boolean
  taxRateBp?: number
  categoryId?: string
  name?: string
}

export async function createProduct(options: TestProductOptions = {}) {
  const index = next()
  const categoryId = options.categoryId ?? (await createCategory()).id

  return prisma.product.create({
    data: {
      slug: `artikel-${index}`,
      sku: `SKU-${index}`,
      articleNumber: `ART-${index}`,
      name: options.name ?? `Testartikel ${index}`,
      shortDescription: 'Kurzbeschreibung für den Test.',
      description: 'Ausführliche Beschreibung für den Test.',
      categoryId,
      priceCents: options.priceCents ?? 1000,
      taxRateBp: options.taxRateBp ?? 1900,
      stock: options.stock ?? 100,
      allowBackorder: options.allowBackorder ?? false,
      active: options.active ?? true,
      visible: options.visible ?? true,
      weightGrams: 100,
      shippingWeightGrams: 150,
    },
  })
}

export async function createCart(token = `cart-${next()}`) {
  return prisma.cart.create({
    data: { token, expiresAt: new Date(Date.now() + 86_400_000) },
  })
}

export async function addCartItem(
  cartId: string,
  productId: string,
  quantity: number,
  configHash = `hash-${next()}`,
) {
  return prisma.cartItem.create({
    data: { cartId, productId, quantity, configHash },
  })
}

export interface TestCouponOptions {
  code?: string
  type?: 'percent' | 'fixed' | 'free_shipping'
  value?: number
  minOrderValueCents?: number
  maxDiscountCents?: number
  usageLimit?: number
  usageCount?: number
  perCustomerLimit?: number
  startsAt?: Date | null
  endsAt?: Date | null
  active?: boolean
}

export async function createCoupon(options: TestCouponOptions = {}) {
  return prisma.coupon.create({
    data: {
      code: options.code ?? `CODE${next()}`,
      type: options.type ?? 'percent',
      value: options.value ?? 1000,
      minOrderValueCents: options.minOrderValueCents ?? 0,
      maxDiscountCents: options.maxDiscountCents ?? 0,
      usageLimit: options.usageLimit ?? 0,
      usageCount: options.usageCount ?? 0,
      perCustomerLimit: options.perCustomerLimit ?? 0,
      startsAt: options.startsAt ?? null,
      endsAt: options.endsAt ?? null,
      active: options.active ?? true,
    },
  })
}

/** Standard-Kontaktdaten für einen Testkauf. */
export const TEST_CONTACT = {
  email: 'test.kunde@example.com',
  firstName: 'Test',
  lastName: 'Kunde',
  street: 'Räucherweg 1',
  postalCode: '24376',
  city: 'Kappeln',
} as const
