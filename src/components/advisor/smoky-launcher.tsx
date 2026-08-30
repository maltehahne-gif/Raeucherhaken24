'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { SmokyChat } from '@/components/advisor/smoky-chat'

/**
 * Startknopf für den Räucherberater.
 *
 * Der Chat wird erst geladen, wenn er geöffnet wird — auf der Startseite kostet
 * er dadurch kein zusätzliches JavaScript.
 */
export function SmokyLauncher() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Räucherberater Smoky öffnen"
        className="no-print fixed right-4 bottom-4 z-30 flex h-12 items-center gap-2 rounded-full bg-[var(--accent)] pr-5 pl-4 text-sm font-semibold text-[var(--accent-contrast)] shadow-[var(--shadow-raised)] transition-transform duration-200 [transition-timing-function:var(--ease-out-soft)] hover:scale-[1.03] hover:bg-[var(--accent-hover)] sm:right-6 sm:bottom-6"
      >
        <MessageCircle className="size-5" aria-hidden="true" />
        Beratung
      </button>

      {open && (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          placement="right"
          title="Räucherberatung"
          className="max-w-[27rem] [&>div:nth-child(2)]:p-0"
        >
          <div className="-mx-5 -my-4 h-[calc(92vh-8rem)]">
            <SmokyChat onClose={() => setOpen(false)} />
          </div>
        </Dialog>
      )}
    </>
  )
}
