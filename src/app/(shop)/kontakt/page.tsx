import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Mail, PackageSearch, Ruler, ShieldCheck, Wrench } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { SITE } from '@/lib/seo/site'
import { Breadcrumbs } from '@/components/ui/breadcrumbs'
import { Card, CardBody } from '@/components/ui/card'
import { Disclosure } from '@/components/ui/disclosure'
import { ContactForm } from '@/components/contact/contact-form'
import { JsonLdScript } from '@/components/seo/json-ld'
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo/structured-data'

export const metadata: Metadata = buildMetadata({
  title: 'Kontakt und Support',
  description:
    'Fragen zu Bestellung, Produkt oder Sonderanfertigung: Schreiben Sie uns. Jede Anfrage bekommt eine Ticketnummer, mit der sich der Vorgang zuordnen lässt.',
  path: '/kontakt',
})

const CRUMBS = [{ label: 'Start', href: '/' }, { label: 'Kontakt' }]

/**
 * Kontakt- und Supportseite.
 *
 * Die Seite nennt zuerst die Wege, auf denen sich eine Frage schneller klären
 * lässt als über ein Formular — Sendungsverfolgung, Kaufberatung, technische
 * Angaben zu einer Sonderanfertigung. Was danach noch offen ist, gehört
 * tatsächlich ins Formular.
 *
 * Bewusst ohne erfundene Telefonnummer, Anschrift oder Erreichbarkeitszeiten:
 * Das sind Angaben des Betreibers und gehören ins Impressum, nicht in eine
 * Vorlage.
 */

const SHORTCUTS = [
  {
    icon: PackageSearch,
    title: 'Wo ist meine Bestellung?',
    text: 'Der Bestellstatus steht jederzeit unter der Bestellnummer aus Ihrer Bestätigung bereit — samt Sendungsverfolgung, sobald das Paket unterwegs ist.',
    href: '/bestellung',
    linkLabel: 'Bestellung nachsehen',
  },
  {
    icon: Wrench,
    title: 'Welcher Haken passt?',
    text: 'Die Kaufberatung führt in fünf Fragen zu passenden Artikeln — mit Begründung statt bloßer Empfehlung.',
    href: '/beratung',
    linkLabel: 'Zur Kaufberatung',
  },
  {
    icon: Ruler,
    title: 'Etwas, das es so nicht gibt?',
    text: 'Für Maßanfertigungen nehmen wir die technischen Angaben strukturiert auf — das ist schneller als eine Beschreibung in Fließtext.',
    href: '/sonderanfertigung',
    linkLabel: 'Sonderanfertigung anfragen',
  },
] as const

const FAQ = [
  {
    question: 'Wie schnell bekomme ich eine Antwort?',
    answer:
      'Jede Anfrage wird mit einer Ticketnummer erfasst und in der Reihenfolge des Eingangs bearbeitet; Reklamationen gehen vor. Verbindliche Reaktionszeiten legt der Betreiber fest — sie sind hier bewusst nicht behauptet.',
  },
  {
    question: 'Wofür brauche ich die Ticketnummer?',
    answer:
      'Sie erscheint direkt nach dem Absenden auf dieser Seite. Mit ihr lässt sich der Vorgang eindeutig zuordnen, wenn Sie noch etwas nachreichen möchten.',
  },
  {
    question: 'Kann ich eine Bestellung über das Formular ändern?',
    answer:
      'Solange eine Bestellung noch nicht gepackt ist, lässt sie sich in der Regel anpassen. Geben Sie dafür das Anliegen „Frage zu einer Bestellung“ und die Bestellnummer an — dann liegt dem Vorgang sofort alles bei, was zur Prüfung nötig ist.',
  },
  {
    question: 'Was passiert mit meinen Angaben?',
    answer:
      'Name, E-Mail-Adresse und Nachricht werden gespeichert, um die Anfrage zu bearbeiten. Einzelheiten stehen in der Datenschutzerklärung; sie ist wie alle rechtlichen Seiten vom Betreiber zu vervollständigen.',
  },
] as const

export default function ContactPage() {
  return (
    <>
      <div className="container-page py-8 sm:py-12">
        <Breadcrumbs items={CRUMBS} className="mb-6" />

        <div className="mx-auto max-w-2xl text-center">
          <p className="text-2xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            Kontakt
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Schreiben Sie uns
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            Ob Bestellung, Werkstoff oder Maßanfertigung: Beschreiben Sie Ihr Anliegen so genau, wie
            Sie können. Je konkreter die Frage, desto brauchbarer die Antwort.
          </p>
        </div>

        <section className="mt-10" aria-labelledby="schneller-weg">
          <h2 id="schneller-weg" className="sr-only">
            Fragen, die sich ohne Formular klären lassen
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {SHORTCUTS.map((item) => (
              <li key={item.title}>
                <Card className="h-full">
                  <CardBody className="flex h-full flex-col">
                    <item.icon className="size-5 text-[var(--accent)]" aria-hidden="true" />
                    <h3 className="mt-3 font-display text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 grow text-sm leading-relaxed text-ink-muted">{item.text}</p>
                    <Link
                      href={item.href}
                      className="mt-4 text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
                    >
                      {item.linkLabel}
                    </Link>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <section aria-labelledby="anfrage">
            <h2 id="anfrage" className="font-display text-2xl font-semibold">
              Ihre Anfrage
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Pflichtfelder sind gekennzeichnet. Sie erhalten sofort eine Ticketnummer.
            </p>
            <div className="mt-6">
              <ContactForm />
            </div>
          </section>

          <aside className="space-y-6">
            <Card>
              <CardBody>
                <h2 className="font-display text-base font-semibold">Direkt per E-Mail</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Wenn Sie lieber aus Ihrem eigenen Postfach schreiben:
                </p>
                <a
                  href={`mailto:${SITE.contact.email}`}
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
                >
                  <Mail className="size-4" aria-hidden="true" />
                  {SITE.contact.email}
                </a>
                <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                  Über das Formular entsteht automatisch ein Vorgang mit Ticketnummer — das ist der
                  zuverlässigere Weg.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <h2 className="font-display text-base font-semibold">Was hilft uns weiter</h2>
                <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-muted">
                  <li className="flex gap-2.5">
                    <Clock className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                    <span>Bei Bestellungen: die Bestellnummer aus der Bestätigung.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <Ruler className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                    <span>Bei Maßen: Länge, Drahtstärke und geplante Traglast.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <ShieldCheck
                      className="mt-0.5 size-4 shrink-0 text-ink-faint"
                      aria-hidden="true"
                    />
                    <span>Bei Werkstofffragen: ob das Teil mit Lake in Berührung kommt.</span>
                  </li>
                </ul>
              </CardBody>
            </Card>
          </aside>
        </div>

        <section className="mt-16" aria-labelledby="haeufige-fragen">
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
        </section>
      </div>

      <JsonLdScript data={breadcrumbJsonLd(CRUMBS)} />
      {/* Nur ausgezeichnet, was auf der Seite auch sichtbar steht. */}
      <JsonLdScript data={faqJsonLd([...FAQ])} />
    </>
  )
}
