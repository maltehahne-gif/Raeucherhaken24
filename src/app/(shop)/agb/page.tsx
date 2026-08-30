import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
import { LegalPage, LegalSection, LegalPlaceholder } from '@/components/layout/legal-page'

export const metadata: Metadata = buildMetadata({
  title: 'Allgemeine Geschäftsbedingungen',
  description: 'Allgemeine Geschäftsbedingungen für Bestellungen in diesem Onlineshop.',
  path: '/agb',
})

export default function TermsPage() {
  return (
    <LegalPage
      title="Allgemeine Geschäftsbedingungen"
      intro="Diese Bedingungen gelten für alle Bestellungen über diesen Onlineshop."
    >
      <LegalSection title="Geltungsbereich und Vertragspartner">
        <LegalPlaceholder
          label="Vertragspartner und Anwendungsbereich"
          hint="Wer ist Vertragspartner, für welche Bestellungen gelten die Bedingungen, Abgrenzung zwischen Verbrauchern und Unternehmern."
        />
      </LegalSection>

      <LegalSection title="Vertragsschluss">
        <LegalPlaceholder
          label="Ablauf des Vertragsschlusses"
          hint="Wann kommt der Vertrag zustande? Die technische Umsetzung sieht vor: Bestellung absenden, automatische Eingangsbestätigung, anschließend gesonderte Annahmeerklärung oder Versandmitteilung. Dieser Ablauf ist rechtlich zu beschreiben."
        />
      </LegalSection>

      <LegalSection title="Preise und Versandkosten">
        <LegalPlaceholder
          label="Preisangaben und Versandkosten"
          hint="Die im Shop hinterlegten Werte: Preise inklusive Umsatzsteuer, versandkostenfrei ab 79 € Warenwert, sonst 4,95 € Grundbetrag zuzüglich Gewichtszuschlägen. Diese Angaben sind zu bestätigen und rechtlich einzuordnen."
        />
      </LegalSection>

      <LegalSection title="Zahlung">
        <LegalPlaceholder
          label="Zahlungsarten und Fälligkeit"
          hint="Derzeit ist im Shop ausschließlich Vorkasse per Überweisung vorgesehen. Weitere Zahlungsarten erfordern zusätzlich die Anbindung eines Zahlungsdienstleisters."
        />
      </LegalSection>

      <LegalSection title="Lieferung">
        <LegalPlaceholder
          label="Lieferzeiten, Liefergebiet, Teillieferungen"
          hint="Der Shop weist artikelbezogene Lieferzeiten aus und liefert derzeit nur innerhalb Deutschlands. Regelungen zu Teillieferungen und Gefahrübergang ergänzen."
        />
      </LegalSection>

      <LegalSection title="Eigentumsvorbehalt">
        <LegalPlaceholder
          label="Eigentumsvorbehalt"
          hint="Regelung zum Eigentumsvorbehalt bis zur vollständigen Bezahlung."
        />
      </LegalSection>

      <LegalSection title="Gewährleistung und Haftung">
        <LegalPlaceholder
          label="Mängelhaftung und Haftungsbegrenzungen"
          hint="Gesetzliche Mängelhaftung, Fristen, zulässige Haftungsbegrenzungen."
        />
      </LegalSection>

      <LegalSection title="Sonderanfertigungen">
        <LegalPlaceholder
          label="Besonderheiten bei Anfertigung nach Kundenvorgabe"
          hint="Für nach Kundenspezifikation gefertigte Ware gelten Besonderheiten, unter anderem beim Widerrufsrecht. Der Konfigurator und das Formular für Sonderanfertigungen erzeugen solche Waren – die Bedingungen sind entsprechend zu fassen."
        />
      </LegalSection>

      <LegalSection title="Gutscheine">
        <LegalPlaceholder
          label="Bedingungen für Aktionsgutscheine"
          hint="Der Shop unterstützt Prozent- und Festbetragsgutscheine, Versandkostenfreiheit, Mindestbestellwerte, Gültigkeitszeiträume sowie Nutzungslimits pro Gutschein und pro Kunde. Diese Mechanik ist in Bedingungen zu fassen."
        />
      </LegalSection>
    </LegalPage>
  )
}
