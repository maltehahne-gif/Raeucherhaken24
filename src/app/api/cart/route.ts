import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyCsrf } from '@/lib/server/csrf'
import {
  assertQuantity,
  buildCartView,
  buildConfigHash,
  emptyCartView,
  getCartToken,
  getOrCreateCart,
  MAX_LINES_PER_CART,
} from '@/lib/server/cart'
import { addToCartSchema, updateCartItemSchema } from '@/lib/validation/checkout'
import { AppError, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

/** Aktueller Warenkorb inklusive serverseitig berechneter Preise. */
export async function GET() {
  try {
    const token = await getCartToken()
    if (!token) return jsonOk(emptyCartView())
    return jsonOk(await buildCartView(token))
  } catch (error) {
    return handleRouteError(error, 'cart:get')
  }
}

/** Legt einen Artikel in den Warenkorb. */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const body = await readJson(request)
    const input = addToCartSchema.parse(body)
    assertQuantity(input.quantity)

    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      include: { optionGroups: { include: { options: true } }, variants: true },
    })
    if (!product || !product.active || !product.visible) {
      throw new AppError('Dieser Artikel ist derzeit nicht bestellbar.', 404)
    }

    // Variante pruefen
    let variantId: string | null = null
    if (input.variantId) {
      const variant = product.variants.find((v) => v.id === input.variantId && v.active)
      if (!variant) throw new AppError('Die gewählte Variante ist nicht verfügbar.', 404)
      variantId = variant.id
    }

    // Konfiguration gegen die Stammdaten validieren: unbekannte Gruppen oder
    // Optionen werden abgewiesen, Pflichtgruppen muessen belegt sein.
    const configuration = validateConfiguration(product.optionGroups, input.configuration ?? null)

    const available = variantId
      ? (product.variants.find((v) => v.id === variantId)?.stock ?? 0)
      : product.stock
    if (!product.allowBackorder && available < input.quantity) {
      throw new AppError(
        available <= 0
          ? 'Dieser Artikel ist aktuell ausverkauft.'
          : `Es sind nur noch ${available} Stück verfügbar.`,
        409,
        'out_of_stock',
      )
    }

    const cart = await getOrCreateCart()
    const configHash = buildConfigHash(product.id, variantId, configuration)

    const existing = await prisma.cartItem.findUnique({
      where: { cartId_configHash: { cartId: cart.id, configHash } },
    })

    if (existing) {
      const nextQuantity = Math.min(existing.quantity + input.quantity, 999)
      if (!product.allowBackorder && nextQuantity > available) {
        throw new AppError(
          `Es sind nur noch ${available} Stück verfügbar. Der Warenkorb enthält bereits ${existing.quantity}.`,
          409,
          'out_of_stock',
        )
      }
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity } })
    } else {
      const lineCount = await prisma.cartItem.count({ where: { cartId: cart.id } })
      if (lineCount >= MAX_LINES_PER_CART) {
        throw new AppError(
          `Ihr Warenkorb enthält bereits ${MAX_LINES_PER_CART} Positionen. Bitte schließen Sie die Bestellung ab oder entfernen Sie Artikel.`,
          409,
        )
      }
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId,
          quantity: input.quantity,
          configuration: configuration ? JSON.stringify(configuration) : null,
          configHash,
        },
      })
    }

    return jsonOk(await buildCartView(cart.token))
  } catch (error) {
    return handleRouteError(error, 'cart:post')
  }
}

/** Aendert die Menge einer Position; Menge 0 entfernt sie. */
export async function PATCH(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const token = await getCartToken()
    if (!token) return jsonOk(emptyCartView())

    const input = updateCartItemSchema.parse(await readJson(request))
    const cart = await prisma.cart.findUnique({ where: { token }, select: { id: true } })
    if (!cart) return jsonOk(emptyCartView())

    const item = await prisma.cartItem.findFirst({
      where: { id: input.itemId, cartId: cart.id },
      include: { product: { select: { stock: true, allowBackorder: true, name: true } }, variant: { select: { stock: true } } },
    })
    if (!item) throw new AppError('Diese Position ist nicht mehr in Ihrem Warenkorb.', 404)

    if (input.quantity === 0) {
      await prisma.cartItem.delete({ where: { id: item.id } })
    } else {
      assertQuantity(input.quantity)
      const available = item.variant ? item.variant.stock : item.product.stock
      if (!item.product.allowBackorder && input.quantity > available) {
        throw new AppError(
          available <= 0
            ? `„${item.product.name}“ ist aktuell ausverkauft.`
            : `Von „${item.product.name}“ sind nur noch ${available} Stück verfügbar.`,
          409,
          'out_of_stock',
        )
      }
      await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: input.quantity } })
    }

    return jsonOk(await buildCartView(token))
  } catch (error) {
    return handleRouteError(error, 'cart:patch')
  }
}

const deleteSchema = z.object({ itemId: z.string().min(1) })

/** Entfernt eine Position. */
export async function DELETE(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const token = await getCartToken()
    if (!token) return jsonOk(emptyCartView())

    const { itemId } = deleteSchema.parse(await readJson(request))
    const cart = await prisma.cart.findUnique({ where: { token }, select: { id: true } })
    if (!cart) return jsonOk(emptyCartView())

    await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } })
    return jsonOk(await buildCartView(token))
  } catch (error) {
    return handleRouteError(error, 'cart:delete')
  }
}

type OptionGroups = Array<{
  key: string
  label: string
  required: boolean
  options: Array<{ key: string; active: boolean }>
}>

/**
 * Prueft eine Konfigurator-Auswahl gegen die hinterlegten Optionsgruppen.
 * Unbekannte Gruppen/Optionen fuehren zur Ablehnung, damit ueber die API
 * keine erfundenen Aufpreise oder Varianten eingeschleust werden koennen.
 */
function validateConfiguration(
  groups: OptionGroups,
  configuration: Record<string, string> | null,
): Record<string, string> | null {
  if (groups.length === 0) return null

  const result: Record<string, string> = {}
  const groupMap = new Map(groups.map((g) => [g.key, g]))

  for (const [groupKey, optionKey] of Object.entries(configuration ?? {})) {
    const group = groupMap.get(groupKey)
    if (!group) throw new AppError('Die gewählte Konfiguration ist ungültig.', 400, 'invalid_config')
    const option = group.options.find((o) => o.key === optionKey && o.active)
    if (!option) {
      throw new AppError(
        `Die Auswahl „${optionKey}“ für „${group.label}“ ist nicht verfügbar.`,
        400,
        'invalid_config',
      )
    }
    result[groupKey] = optionKey
  }

  for (const group of groups) {
    if (group.required && !result[group.key]) {
      throw new AppError(`Bitte treffen Sie eine Auswahl für „${group.label}“.`, 400, 'invalid_config')
    }
  }

  return Object.keys(result).length > 0 ? result : null
}
