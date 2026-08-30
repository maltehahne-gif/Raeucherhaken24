import type { Metadata } from 'next'
import { Banknote, ShieldCheck } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { LegalPage, LegalSection, LegalPlaceholder } from '@/components/layout/legal-page'

export const metadata: Metadata = buildMetadata({
  title: 'Zahlungsarten',
  description: 'Verfügbare Zahlungsarten und Ablauf der Zahlung bei Räucherhaken24.',
  path: '/zahlung',
})

export default function PaymentPage() {
  return (
    <LegalPage title="Zahlungsarten" intro="So können Sie Ihre Bestellung bezahlen.">
      <LegalSection title="Vorkasse per Überweisung">
        <p className="flex items-start gap-3">
          <Banknote className="mt-0.5 size-4.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <span>
            Nach dem Absenden der Bestellung erhalten Sie eine Bestätigung mit allen Zahlungsdaten
            und Ihrer Bestellnummer. Geben Sie die Bestellnummer bitte als Verwendungszweck an.
            Sobald der Betrag eingegangen ist, bereiten wir den Versand vor.
          </span>
        </p>
      </LegalSection>

      <LegalSection title="Weitere Zahlungsarten">
        <LegalPlaceholder
          label="Anbindung eines Zahlungsdienstleisters"
          hint="Kartenzahlung, PayPal, Sofortüberweisung oder Kauf auf Rechnung setzen die Anbindung eines Zahlungsdienstleisters voraus. Die Anwendung ist dafür vorbereitet: Der Zahlungsstatus einer Bestellung wird getrennt vom Bearbeitungsstatus geführt und lässt sich über eine Schnittstelle setzen. Es fehlen ausschließlich der Vertrag und die Zugangsdaten des Anbieters."
        />
      </LegalSection>

      <LegalSection title="Sicherheit">
        <p className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <span>
            Alle Preise und Rabatte werden serverseitig berechnet. Im Browser angezeigte Beträge sind
            reine Darstellung; verbindlich ist ausschließlich die Berechnung auf dem Server. Zahlungs-
            und Kartendaten werden in dieser Anwendung nicht erhoben und nicht gespeichert.
          </span>
        </p>
      </LegalSection>
    </LegalPage>
  )
}
