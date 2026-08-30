import Image from 'next/image'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Price } from '@/components/ui/price'
import { cn } from '@/lib/utils/cn'
import { formatPrice } from '@/lib/money'
import { calculateBasePrice } from '@/lib/server/pricing'

/**
 * Produktkarte.
 *
 * Bewusst eine Server Component: sie braucht keine Interaktivitaet, und das
 * haelt das ausgelieferte JavaScript im Katalog auf null. Der Klick fuehrt auf
 * die Produktseite — "In den Warenkorb" gehoert dorthin, wo Variante und Menge
 * bewusst gewaehlt werden.
 */

export interface ProductCardData {
  slug: string
  name: string
  subtitle: string | null
  categoryName: string
  imageUrl: string | null
  imageAlt: string | null
  priceCents: number
  /** Streichpreis, falls eine Aktion laeuft. */
  listPriceCents: number | null
  baseUnit: string | null
  baseUnitAmount: number | null
  baseUnitReference: number | null
  stock: number
  allowBackorder: boolean
  bestseller: boolean
  material: string | null
  promotionName: string | null
  lowStockThreshold: number
}

export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductCardData
  /** Fuer die ersten sichtbaren Karten, damit das LCP-Bild frueh laedt. */
  priority?: boolean
  className?: string
}) {
  const basePrice = calculateBasePrice(
    product.priceCents,
    product.baseUnit,
    product.baseUnitAmount,
    product.baseUnitReference,
    formatPrice,
  )
  const soldOut = product.stock <= 0 && !product.allowBackorder
  const lowStock = !soldOut && product.stock > 0 && product.stock <= product.lowStockThreshold

  return (
    <article className={cn('group relative flex flex-col', className)}>
      <Link
        href={`/produkt/${product.slug}`}
        className="relative aspect-square overflow-hidden rounded-lg bg-paper-sunken"
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt ?? product.name}
            width={800}
            height={800}
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            sizes="(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 22vw"
            className={cn(
              'size-full object-cover transition-transform duration-500 [transition-timing-function:var(--ease-out-soft)] group-hover:scale-[1.035]',
              soldOut && 'opacity-60 saturate-50',
            )}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-ink-faint">
            <Package className="size-8" aria-hidden="true" />
          </span>
        )}

        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex flex-wrap gap-1.5">
          {product.promotionName && <Badge tone="accent">{product.promotionName}</Badge>}
          {product.bestseller && !product.promotionName && <Badge tone="steel">Bestseller</Badge>}
          {soldOut && <Badge tone="neutral">Ausverkauft</Badge>}
        </div>
      </Link>

      <div className="mt-3.5 flex flex-1 flex-col">
        <p className="text-2xs font-medium tracking-wide text-ink-faint uppercase">
          {product.categoryName}
        </p>
        <h3 className="mt-1 font-display text-base leading-snug font-semibold">
          <Link href={`/produkt/${product.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>
        {product.subtitle && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted">{product.subtitle}</p>
        )}

        <div className="mt-auto pt-3">
          <Price cents={product.priceCents} listCents={product.listPriceCents} size="lg" />
          {basePrice && <p className="tabular mt-0.5 text-xs text-ink-faint">{basePrice.label}</p>}
          {lowStock && (
            <p className="mt-1.5 text-xs font-medium text-warning-700">
              Nur noch {product.stock} auf Lager
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

/** Kompakte Variante fuer Empfehlungsleisten und den Warenkorb. */
export function ProductCardCompact({ product }: { product: ProductCardData }) {
  return (
    <article className="group relative flex items-center gap-3">
      <Link
        href={`/produkt/${product.slug}`}
        className="relative size-16 shrink-0 overflow-hidden rounded-md bg-paper-sunken"
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt ?? product.name}
            width={128}
            height={128}
            sizes="64px"
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-ink-faint">
            <Package className="size-5" aria-hidden="true" />
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm leading-snug font-medium">
          <Link href={`/produkt/${product.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>
        <Price cents={product.priceCents} listCents={product.listPriceCents} size="sm" className="mt-1" />
      </div>
    </article>
  )
}
