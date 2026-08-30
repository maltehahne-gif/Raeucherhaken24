'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'

/**
 * Fehlergrenze der Anwendung.
 *
 * Der Endnutzer sieht ausschließlich eine verständliche Meldung. Technische
 * Einzelheiten bleiben in der Serverprotokollierung; im Browser steht
 * höchstens die von Next.js vergebene Fehlerkennung, mit der sich ein Vorfall
 * im Protokoll wiederfinden lässt.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[error-boundary]', error)
  }, [error])

  return (
    <main className="container-page flex min-h-[60vh] max-w-xl flex-col items-center justify-center py-16 text-center">
      <p className="text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
        Unerwarteter Fehler
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
        Das hat leider nicht geklappt
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-muted">
        Beim Laden dieser Seite ist etwas schiefgegangen. Meist hilft es, es noch einmal zu
        versuchen. Bleibt das Problem bestehen, melden Sie sich gerne bei uns.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={reset}>
          <RefreshCw className="size-4.5" aria-hidden="true" />
          Erneut versuchen
        </Button>
        <ButtonLink href="/" variant="outline" size="lg">
          Zur Startseite
        </ButtonLink>
      </div>

      {error.digest && (
        <p className="tabular mt-8 text-xs text-ink-faint">
          Fehlerkennung: {error.digest} —{' '}
          <Link href="/kontakt" className="underline underline-offset-2">
            Kontakt aufnehmen
          </Link>
        </p>
      )}
    </main>
  )
}
