import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { formatDateTime } from '@/lib/utils/text'
import { centsToInput, toDateTimeLocalInput } from '@/lib/validation/product'
import { AdminPageHeader } from '@/components/admin/page-header'
import { ProductForm, type ProductFormValues } from '@/components/admin/product-form'
import { ButtonLink } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const product = await prisma.product.findUnique({ where: { id }, select: { name: true } })
  return {
    title: product ? `${product.name} bearbeiten` : 'Produkt nicht gefunden',
    robots: { index: false, follow: false },
  }
}

/** Leeres Feld statt "null" — das Formular arbeitet ausschliesslich mit Zeichenketten. */
function text(value: string | null): string {
  return value ?? ''
}

function number(value: number | null): string {
  return value === null ? '' : String(value)
}

/**
 * Bearbeiten eines Produktes.
 *
 * Von den hinterlegten Aktionen pflegt das Formular genau eine: die laufende
 * oder naechste. Aeltere und weitere Aktionen bleiben unberuehrt und werden
 * lediglich gezaehlt, damit niemand unbemerkt daran vorbeiarbeitet.
 */
export default async function EditProductPage({ params }: PageProps) {
  const session = await requirePermission('products:write')
  const { id } = await params
  const now = new Date()

  const [product, categories, orderItemCount] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { name: true } },
        promotions: { orderBy: { startsAt: 'asc' } },
        _count: { select: { images: true, specs: true, variants: true } },
      },
    }),
    prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.orderItem.count({ where: { productId: id } }),
  ])

  if (!product) notFound()

  // Die laufende bzw. naechste Aktion ist die, die der Bearbeiter meint.
  const managedPromotion =
    product.promotions.find((promotion) => promotion.active && promotion.endsAt > now) ?? null

  const initialValues: ProductFormValues = {
    name: product.name,
    subtitle: text(product.subtitle),
    shortDescription: text(product.shortDescription),
    description: product.description,
    categoryId: product.categoryId,
    slug: product.slug,
    sku: product.sku,
    articleNumber: product.articleNumber,
    priceCents: centsToInput(product.priceCents),
    salePriceCents:
      managedPromotion?.salePriceCents != null ? centsToInput(managedPromotion.salePriceCents) : '',
    saleStartsAt: managedPromotion ? toDateTimeLocalInput(managedPromotion.startsAt) : '',
    saleEndsAt: managedPromotion ? toDateTimeLocalInput(managedPromotion.endsAt) : '',
    promotionId: managedPromotion?.id ?? '',
    taxRateBp: String(product.taxRateBp),
    baseUnit: text(product.baseUnit),
    baseUnitAmount: number(product.baseUnitAmount),
    baseUnitReference: number(product.baseUnitReference),
    weightGrams: number(product.weightGrams),
    shippingWeightGrams: number(product.shippingWeightGrams),
    packagingUnit: String(product.packagingUnit),
    lengthMm: number(product.lengthMm),
    deliveryDaysMin: String(product.deliveryDaysMin),
    deliveryDaysMax: String(product.deliveryDaysMax),
    material: text(product.material),
    usage: text(product.usage),
    tipFinish: text(product.tipFinish),
    stock: String(product.stock),
    lowStockThreshold: String(product.lowStockThreshold),
    allowBackorder: product.allowBackorder,
    active: product.active,
    visible: product.visible,
    bestseller: product.bestseller,
    sortOrder: String(product.sortOrder),
    metaTitle: text(product.metaTitle),
    metaDescription: text(product.metaDescription),
  }

  const facts = [
    `${product._count.images} ${product._count.images === 1 ? 'Bild' : 'Bilder'}`,
    `${product._count.specs} technische ${product._count.specs === 1 ? 'Angabe' : 'Angaben'}`,
    `${product._count.variants} ${product._count.variants === 1 ? 'Variante' : 'Varianten'}`,
    `${orderItemCount} ${orderItemCount === 1 ? 'Bestellposition' : 'Bestellpositionen'}`,
    `${product.reservedStock} Stück reserviert`,
  ]

  return (
    <div>
      <AdminPageHeader
        title={product.name}
        description={`${product.category.name} · SKU ${product.sku} · Artikelnummer ${product.articleNumber}`}
        backHref="/admin/produkte"
        backLabel="Zurück zur Produktliste"
        actions={
          <ButtonLink
            href={`/produkt/${product.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Im Shop ansehen
          </ButtonLink>
        }
      />

      <p className="mb-5 text-xs text-ink-muted">
        {facts.join(' · ')} · angelegt am {formatDateTime(product.createdAt)} · zuletzt geändert am{' '}
        {formatDateTime(product.updatedAt)}
      </p>

      <ProductForm
        mode="edit"
        productId={product.id}
        categories={categories}
        initialValues={initialValues}
        canDelete={session.user.permissions.includes('products:delete')}
        orderItemCount={orderItemCount}
        otherPromotionCount={product.promotions.length - (managedPromotion ? 1 : 0)}
      />
    </div>
  )
}
