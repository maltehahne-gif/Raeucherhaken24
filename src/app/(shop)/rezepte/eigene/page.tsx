import type { Metadata } from 'next'
import Link from 'next/link'
import { buildMetadata } from '@/lib/seo/metadata'
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs'
import { OwnRecipes } from '@/components/recipe/own-recipes'

/**
 * Persoenliches Rezeptbuch.
 *
 * Der Inhalt dieser Seite entsteht ausschliesslich im Browser des Besuchers:
 * Es gibt keine serverseitige Ablage, kein Konto und keine Uebertragung an
 * uns. Deshalb ist die Seite von der Indexierung ausgenommen — es gibt fuer
 * Suchmaschinen nichts, was den Rahmentext uebersteigt.
 */

export const metadata: Metadata = buildMetadata({
  title: 'Eigenes Rezeptbuch',
  description:
    'Eigene Räucherrezepte festhalten: Zutaten, Zeiten und Arbeitsschritte. Die Rezepte bleiben ausschließlich auf Ihrem Gerät.',
  path: '/rezepte/eigene',
  noIndex: true,
})

export default function OwnRecipesPage() {
  const crumbs: Crumb[] = [
    { label: 'Start', href: '/' },
    { label: 'Rezepte', href: '/rezepte' },
    { label: 'Eigenes Rezeptbuch' },
  ]

  return (
    <div className="container-page py-6 sm:py-8">
      <Breadcrumbs items={crumbs} className="mb-6" />

      <header className="max-w-3xl">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Eigenes Rezeptbuch</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          Halten Sie hier Ihre eigenen Ansätze fest: Mengen, Zeiten, Holzart und die Arbeitsschritte, die bei
          Ihnen funktionieren. Sie brauchen dafür kein Konto und geben keine Daten an uns weiter.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          Anregungen finden Sie in den{' '}
          <Link href="/rezepte" className="font-medium underline underline-offset-2 hover:text-ink">
            Rezepten unserer Redaktion
          </Link>
          .
        </p>
      </header>

      <div className="mt-8 max-w-4xl">
        <OwnRecipes />
      </div>
    </div>
  )
}
