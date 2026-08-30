import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { getClientIp, handleRouteError, jsonCreated, jsonError, readJson } from '@/lib/server/http'
import { productRecordFromInput, productSchema, type ProductInput } from '@/lib/validation/product'

export const dynamic = 'force-dynamic'

/**
 * Anlage eines Produktes.
 *
 * Die Eindeutigkeit von URL-Pfad, SKU und Artikelnummer wird vor dem Schreiben
 * geprueft, damit der Bearbeiter eine Meldung am betroffenen Feld bekommt statt
 * eines Datenbankfehlers. Die Datenbank haelt zusaetzlich eigene Unique-Indizes
 * vor — die Vorabpruefung ist Bedienkomfort, nicht die eigentliche Zusicherung.
 */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const session = await requirePermission('products:write')
    const data = productSchema.parse(await readJson(request))

    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    })
    if (!category) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, {
        fieldErrors: { categoryId: 'Diese Kategorie existiert nicht mehr. Bitte wählen Sie eine andere.' },
      })
    }

    const conflicts = await findIdentifierConflicts(data, null)
    if (Object.keys(conflicts).length > 0) {
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, { fieldErrors: conflicts })
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: productRecordFromInput(data),
        select: { id: true, name: true, sku: true, stock: true },
      })

      if (data.salePriceCents !== null && data.saleStartsAt && data.saleEndsAt) {
        await tx.promotion.create({
          data: {
            productId: created.id,
            name: 'Angebotspreis',
            salePriceCents: data.salePriceCents,
            startsAt: data.saleStartsAt,
            endsAt: data.saleEndsAt,
            active: true,
          },
        })
      }

      // Jeder Bestand hat einen Ursprung im Journal — auch der Anfangsbestand.
      if (created.stock > 0) {
        await tx.inventoryMovement.create({
          data: {
            productId: created.id,
            delta: created.stock,
            stockAfter: created.stock,
            reason: 'manual',
            note: 'Anfangsbestand bei Anlage des Produktes',
            userId: session.user.id,
          },
        })
      }

      return created
    })

    await writeAuditLog({
      userId: session.user.id,
      action: 'product.created',
      entity: 'Product',
      entityId: product.id,
      detail: { name: product.name, sku: product.sku, stock: product.stock },
      ip: await getClientIp(),
    })

    return jsonCreated({ id: product.id, redirectTo: `/admin/produkte/${product.id}` })
  } catch (error) {
    return handleRouteError(error, 'admin:produkte:post')
  }
}

/**
 * Meldet belegte Kennungen feldbezogen zurueck.
 * `excludeId` blendet den gerade bearbeiteten Datensatz aus.
 */
async function findIdentifierConflicts(
  data: Pick<ProductInput, 'slug' | 'sku' | 'articleNumber'>,
  excludeId: string | null,
): Promise<Record<string, string>> {
  const rows = await prisma.product.findMany({
    where: {
      OR: [{ slug: data.slug }, { sku: data.sku }, { articleNumber: data.articleNumber }],
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { slug: true, sku: true, articleNumber: true },
  })

  const fieldErrors: Record<string, string> = {}
  for (const row of rows) {
    if (row.slug === data.slug) fieldErrors.slug = 'Dieser URL-Pfad ist bereits vergeben.'
    if (row.sku === data.sku) fieldErrors.sku = 'Diese SKU ist bereits vergeben.'
    if (row.articleNumber === data.articleNumber) {
      fieldErrors.articleNumber = 'Diese Artikelnummer ist bereits vergeben.'
    }
  }
  return fieldErrors
}
