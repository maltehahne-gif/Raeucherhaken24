import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, Factory, MessageSquareQuote, Ruler, ShieldCheck } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { Card, CardBody } from '@/components/ui/card'
import { Disclosure } from '@/components/ui/disclosure'
import { ProjectForm } from '@/components/project/project-form'
import { JsonLdScript } from '@/components/seo/json-ld'
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo/structured-data'

export const metadata: Metadata = buildMetadata({
  title: 'Sonderanfertigung anfragen',
  description:
    'Räucherhaken nach Maß: Länge, Drahtstärke, Dornenzahl und Werkstoff nach Ihrer Anforderung. Anfrage mit technischen Angaben, Skizze und Projektnummer.',
  path: '/sonderanfertigung',
})

const CRUMBS = [{ label: 'Start', href: '/' }, { label: 'Sonderanfertigung' }]

/**
 * Einstieg in die Sonderanfertigung.
 *
 * Zwei Gruppen landen hier: Betriebe mit fertiger Zeichnung und Leute, die
 * nur wissen, was das Teil koennen soll. Die Seite bedient beide, indem sie
 * zuerst den Ablauf erklaert und erst dann das Formular zeigt — in dem die
 * Masse ausdruecklich optional sind.
 *
 * Bewusst ohne Preisangaben, Lieferzeiten oder Mindestmengen: Das sind
 * Zusagen des Betreibers und keine Vorlage. Was hier steht, beschreibt nur
 * den Weg der Anfrage.
 */

const STEPS = [
  {
    icon: ClipboardList,
    title: '1. Anfrage beschreiben',
    text: 'Was soll das Teil tragen, wo hängt es, womit kommt es in Berührung? Diese drei Angaben tragen die halbe Konstruktion.',
  },
  {
    icon: Ruler,
    title: '2. Maße ergänzen, wenn vorhanden',
    text: 'Länge, Drahtstärke, Dornenzahl und Öffnungsmaß nehmen wir strukturiert auf. Wer noch keine Maße hat, lässt den Abschnitt zu.',
  },
  {
    icon: MessageSquareQuote,
    title: '3. Technische Rückfrage',
    text: 'Sie bekommen sofort eine Projektnummer. Alles Weitere klären wir daran — offene Punkte werden benannt, nicht geraten.',
  },
  {
    icon: Factory,
    title: '4. Muster und Fertigung',
    text: 'Bei Serien ist ein Erstmuster der übliche Weg: Erst wenn es passt, geht die Stückzahl in die Fertigung.',
  },
] as const

const FAQ = [
  {
    question: 'Brauche ich eine technische Zeichnung?',
    answer:
      'Nein. Eine Beschreibung des Einsatzzwecks reicht für den Anfang. Wenn Sie eine Zeichnung, ein Foto oder ein Muster haben, hängen Sie es an — das verkürzt die Abstimmung erheblich.',
  },
  {
    question: 'Welcher Werkstoff ist der richtige?',
    answer:
      'V2A (1.4301) ist der Standard für trockene Rauchgänge. Sobald Pökellake, Salz oder Säure ins Spiel kommen, ist V4A (1.4404) die haltbarere Wahl, weil das enthaltene Molybdän der Lochfraßkorrosion entgegenwirkt. Im Zweifel benennen Sie einfach den Kontakt mit Lake — die Werkstoffwahl schlagen wir dann vor.',
  },
  {
    question: 'Ab welcher Stückzahl ist eine Sonderanfertigung möglich?',
    answer:
      'Die Stückzahl gehört in die Anfrage; sie beeinflusst Fertigungsweg und Preis. Eine feste Untergrenze ist hier nicht hinterlegt — sie legt der Betrieb im Angebot fest.',
  },
  {
    question: 'Was passiert mit meiner Konstruktion?',
    answer:
      'Ihre Angaben werden für die Bearbeitung der Anfrage verwendet. Eine Aufnahme ins Standardsortiment findet nur statt, wenn Sie das im Formular ausdrücklich erlauben.',
  },
  {
    question: 'Welche Dateien kann ich anhängen?',
    answer:
      'JPG, PNG, WebP, GIF und PDF, bis zu fünf Dateien mit je höchstens 8 MB. Jede Datei wird nach dem Hochladen anhand ihres Inhalts geprüft, nicht nur anhand der Endung.',
  },
] as const

export default function CustomProjectPage() {
  return (
    <>
      <div className="container-page py-8 sm:py-12">
        <Breadcrumbs items={CRUMBS} className="mb-6" />

        <div className="mx-auto max-w-2xl text-center">
          <p className="text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            Sonderanfertigung
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Wenn es der Haken von der Stange nicht tut
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            Andere Länge, stärkerer Draht, mehr Dornen, anderer Werkstoff: Beschreiben Sie, was das
            Teil leisten soll. Die Maße sind willkommen, aber keine Voraussetzung.
          </p>
        </div>

        <section className="mt-12" aria-labelledby="ablauf">
          <h2 id="ablauf" className="font-display text-2xl font-semibold">
            So läuft eine Anfrage
          </h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.title}>
                <Card className="h-full">
                  <CardBody>
                    <step.icon className="size-5 text-[var(--accent)]" aria-hidden="true" />
                    <h3 className="mt-3 font-display text-base font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.text}</p>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14" aria-labelledby="anfrage">
          <div className="mx-auto max-w-3xl">
            <h2 id="anfrage" className="font-display text-2xl font-semibold">
              Ihre Anfrage
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Pflicht sind nur Kontakt, Anwendung und Zielbeschreibung. Alles Technische ist
              optional und lässt sich später nachreichen.
            </p>

            <div className="mt-4 flex gap-3 rounded-xl border border-[var(--border-subtle)] bg-paper-sunken/60 px-4 py-3.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-ink-muted">
                Anhänge werden außerhalb des öffentlich erreichbaren Verzeichnisses gespeichert und
                nach ihrem tatsächlichen Inhalt geprüft. Einsehbar sind sie nur im
                Verwaltungsbereich.
              </p>
            </div>

            <div className="mt-8">
              <ProjectForm />
            </div>
          </div>
        </section>

        <section className="mt-16" aria-labelledby="haeufige-fragen">
          <div className="mx-auto max-w-3xl">
            <h2 id="haeufige-fragen" className="font-display text-2xl font-semibold">
              Häufige Fragen
            </h2>
            <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5">
              {FAQ.map((entry) => (
                <Disclosure key={entry.question} title={entry.question}>
                  <p className="text-sm leading-relaxed text-ink-muted">{entry.answer}</p>
                </Disclosure>
              ))}
            </div>
            <p className="mt-6 text-sm text-ink-muted">
              Noch unsicher, ob eine Sonderanfertigung nötig ist?{' '}
              <Link href="/beratung" className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
                Die Kaufberatung
              </Link>{' '}
              prüft zuerst, ob ein Artikel aus dem Sortiment die Aufgabe bereits löst.
            </p>
          </div>
        </section>
      </div>

      <JsonLdScript data={breadcrumbJsonLd(CRUMBS)} />
      <JsonLdScript data={faqJsonLd([...FAQ])} />
    </>
  )
}
