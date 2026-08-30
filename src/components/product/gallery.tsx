'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Expand, Package } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils/cn'

/**
 * Produktgalerie mit Vergroesserung.
 *
 * Die Miniaturen sind echte Knoepfe in einer Tablist-Struktur, damit sich die
 * Ansicht auch mit den Pfeiltasten wechseln laesst.
 */
export interface GalleryImage {
  url: string
  alt: string
}

export function ProductGallery({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [active, setActive] = useState(0)
  const [zoomOpen, setZoomOpen] = useState(false)

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-paper-sunken text-ink-faint">
        <Package className="size-10" aria-hidden="true" />
        <span className="sr-only">Für diesen Artikel liegt noch keine Abbildung vor.</span>
      </div>
    )
  }

  const current = images[active] ?? images[0]

  function onThumbKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setActive((index + 1) % images.length)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setActive((index - 1 + images.length) % images.length)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative overflow-hidden rounded-xl bg-paper-sunken">
        <Image
          src={current.url}
          alt={current.alt}
          width={1000}
          height={1000}
          priority
          sizes="(max-width: 1024px) 92vw, 46vw"
          className="aspect-square size-full object-cover"
        />
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label="Abbildung vergrößern"
          className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-[var(--surface-raised)]/92 text-ink-soft shadow-[var(--shadow-card)] backdrop-blur-sm transition-all hover:scale-105 hover:text-ink"
        >
          <Expand className="size-4" aria-hidden="true" />
        </button>
      </div>

      {images.length > 1 && (
        <div role="tablist" aria-label="Weitere Abbildungen" className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={`Abbildung ${index + 1} von ${images.length}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(e) => onThumbKeyDown(e, index)}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors sm:size-18',
                index === active ? 'border-[var(--accent)]' : 'border-transparent hover:border-[var(--border-strong)]',
              )}
            >
              <Image src={image.url} alt="" width={144} height={144} sizes="72px" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <Dialog open={zoomOpen} onClose={() => setZoomOpen(false)} title={productName} size="xl">
        <Image
          src={current.url}
          alt={current.alt}
          width={1400}
          height={1400}
          sizes="90vw"
          className="w-full rounded-lg"
        />
      </Dialog>
    </div>
  )
}
