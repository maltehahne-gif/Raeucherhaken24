import { SectionHeading } from '@/components/ui/section'
import { ProductCard, type ProductCardData } from '@/components/product/product-card'
import { cn } from '@/lib/utils/cn'

/**
 * Produktleiste fuer Empfehlungen.
 * Auf schmalen Bildschirmen horizontal scrollbar mit Einrastpunkten,
 * ab Tablet als Raster — ohne Karussell-JavaScript.
 */
export function ProductRow({
  eyebrow,
  title,
  description,
  action,
  products,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: { label: string; href: string }
  products: ProductCardData[]
  className?: string
}) {
  if (products.length === 0) return null

  return (
    <section className={cn(className)} data-reveal="">
      <SectionHeading eyebrow={eyebrow} title={title} description={description} action={action} />
      <ul
        className={cn(
          'scroll-area mt-7 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2',
          'sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-9 sm:overflow-visible lg:grid-cols-4',
        )}
      >
        {products.map((product) => (
          <li key={product.slug} className="w-[62vw] shrink-0 snap-start sm:w-auto">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  )
}
