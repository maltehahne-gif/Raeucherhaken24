import { ProductGridSkeleton } from '@/components/ui/states'

/** Ladezustand während des Seitenwechsels — verhindert eine leere Fläche. */
export default function Loading() {
  return (
    <div className="container-page py-10">
      <div className="skeleton h-8 w-64 rounded-md" aria-hidden="true" />
      <div className="skeleton mt-3 h-4 w-96 max-w-full rounded-md" aria-hidden="true" />
      <div className="mt-10">
        <ProductGridSkeleton />
      </div>
      <p className="sr-only" role="status">
        Inhalt wird geladen
      </p>
    </div>
  )
}
