import type { Metadata } from 'next'
import { FolderTree } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { AdminPageHeader } from '@/components/admin/page-header'
import { EMPTY_PRODUCT_FORM_VALUES, ProductForm } from '@/components/admin/product-form'
import { EmptyState } from '@/components/ui/states'

export const metadata: Metadata = { title: 'Produkt anlegen', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Anlage eines Produktes.
 *
 * Ein Produkt braucht zwingend eine Kategorie. Gibt es noch keine, fuehrt die
 * Seite dorthin, statt ein Formular anzubieten, das sich nicht speichern liesse.
 */
export default async function NewProductPage() {
  await requirePermission('products:write')

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })

  return (
    <div>
      <AdminPageHeader
        title="Produkt anlegen"
        description="Pflichtangaben sind mit einem Stern gekennzeichnet. Alles Weitere lässt sich später ergänzen."
        backHref="/admin/produkte"
        backLabel="Zurück zur Produktliste"
      />

      {categories.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="size-5" aria-hidden="true" />}
          title="Es ist noch keine Kategorie angelegt"
          description="Jedes Produkt gehört zu genau einer Kategorie. Legen Sie zuerst eine Kategorie an, danach lässt sich das Sortiment aufbauen."
        />
      ) : (
        <ProductForm
          mode="create"
          categories={categories}
          initialValues={EMPTY_PRODUCT_FORM_VALUES}
        />
      )}
    </div>
  )
}
