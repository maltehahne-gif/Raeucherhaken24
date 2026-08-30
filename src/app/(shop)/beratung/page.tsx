import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { BuyingGuide } from '@/components/advisor/buying-guide'
import { JsonLdScript } from '@/components/seo/json-ld'
import { breadcrumbJsonLd } from '@/lib/seo/structured-data'

export const metadata: Metadata = buildMetadata({
  title: 'Kaufberatung',
  description:
    'In fünf Schritten zur passenden Räucherausstattung: Räuchergut, Methode, Geschmack, Menge und Erfahrung – mit konkreten Artikeln aus unserem Sortiment.',
  path: '/beratung',
})

const CRUMBS = [{ label: 'Start', href: '/' }, { label: 'Kaufberatung' }]

export default function AdvisorPage() {
  return (
    <>
      <div className="container-page py-8 sm:py-12">
        <Breadcrumbs items={CRUMBS} className="mb-6" />
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            Kaufberatung
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            In fünf Schritten zur passenden Ausstattung
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            Beantworten Sie fünf kurze Fragen. Am Ende stehen konkrete Artikel aus unserem Sortiment –
            mit Begründung, warum sie zu Ihrem Vorhaben passen.
          </p>
        </div>

        <BuyingGuide />
      </div>
      <JsonLdScript data={breadcrumbJsonLd(CRUMBS)} />
    </>
  )
}
