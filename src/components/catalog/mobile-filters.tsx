'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Filter auf schmalen Bildschirmen: ein Panel, das dieselben Filterlinks
 * enthaelt wie die Seitenspalte auf dem Desktop. Der Inhalt wird als children
 * uebergeben, damit es nur eine Filterimplementierung gibt.
 */
export function MobileFilters({
  children,
  activeCount,
  resultCount,
}: {
  children: React.ReactNode
  activeCount: number
  resultCount: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="lg:hidden">
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Filter
        {activeCount > 0 && (
          <span className="tabular ml-0.5 flex size-5 items-center justify-center rounded-full bg-[var(--accent)] text-2xs font-semibold text-[var(--accent-contrast)]">
            {activeCount}
          </span>
        )}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Filter"
        placement="right"
        footer={
          <Button fullWidth onClick={() => setOpen(false)}>
            {resultCount === 1 ? '1 Artikel anzeigen' : `${resultCount} Artikel anzeigen`}
          </Button>
        }
      >
        {children}
      </Dialog>
    </>
  )
}
