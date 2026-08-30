import Link from 'next/link'
import { Compass, Search } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { CATALOG_NAV } from '@/lib/navigation'
import './globals.css'

export const metadata = {
  title: 'Seite nicht gefunden',
  robots: { index: false, follow: false },
}

/**
 * 404-Seite.
 * Statt einer Sackgasse konkrete Wege zurück ins Sortiment – das ist auch
 * für die Absprungrate deutlich besser als ein reiner Fehlerhinweis.
 */
export default function NotFound() {
  return (
    <html lang="de">
      <body>
        <main className="container-page flex min-h-dvh max-w-2xl flex-col items-center justify-center py-16 text-center">
          <p className="text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            Fehler 404
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
            Diese Seite gibt es nicht
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-muted">
            Vielleicht wurde der Artikel umbenannt oder aus dem Sortiment genommen. Über die Suche
            oder das Sortiment finden Sie sicher, was Sie gesucht haben.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/kategorie" size="lg">
              <Search className="size-4.5" aria-hidden="true" />
              Zum Sortiment
            </ButtonLink>
            <ButtonLink href="/beratung" variant="outline" size="lg">
              <Compass className="size-4.5" aria-hidden="true" />
              Kaufberatung
            </ButtonLink>
          </div>

          <nav aria-label="Bereiche" className="mt-12 w-full border-t border-[var(--border-subtle)] pt-8">
            <ul className="flex flex-wrap justify-center gap-2">
              {CATALOG_NAV.map((group) => (
                <li key={group.href}>
                  <Link
                    href={group.href}
                    className="inline-block rounded-full border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {group.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </main>
      </body>
    </html>
  )
}
