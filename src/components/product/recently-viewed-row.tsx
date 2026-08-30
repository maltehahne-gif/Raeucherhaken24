'use client'

import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/client/api'
import { readRecentlyViewed } from '@/components/product/recently-viewed'
import { ProductRow } from '@/components/product/product-row'
import type { ProductCardData } from '@/components/product/product-card'

/**
 * "Zuletzt angesehen".
 *
 * Die Slugs liegen ausschliesslich im Browser; die Anzeigedaten holt diese
 * Komponente danach vom Server. Ist die Liste leer oder der Speicher nicht
 * verfuegbar, rendert sie nichts — kein leerer Abschnitt, kein Platzhalter.
 */
export function RecentlyViewedRow({ excludeSlug }: { excludeSlug?: string }) {
  const [products, setProducts] = useState<ProductCardData[]>([])

  useEffect(() => {
    const slugs = readRecentlyViewed().filter((slug) => slug !== excludeSlug)
    if (slugs.length === 0) return

    void apiRequest<{ products: ProductCardData[] }>(
      `/api/produkte?slugs=${encodeURIComponent(slugs.slice(0, 8).join(','))}`,
    ).then((result) => {
      if (result.ok) setProducts(result.data.products)
    })
  }, [excludeSlug])

  if (products.length === 0) return null

  return (
    <ProductRow
      className="pb-14 sm:pb-20"
      eyebrow="Ihr Verlauf"
      title="Zuletzt angesehen"
      products={products}
    />
  )
}
