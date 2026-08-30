import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
import { LegalPage, LegalSection, LegalPlaceholder } from '@/components/layout/legal-page'

export const metadata: Metadata = buildMetadata({
  title: 'Impressum',
  description: 'Anbieterkennzeichnung nach § 5 DDG.',
  path: '/impressum',
})

export default function ImprintPage() {
  return (
    <LegalPage
      title="Impressum"
      intro="Anbieterkennzeichnung nach § 5 Digitale-Dienste-Gesetz (DDG)."
    >
      <LegalSection title="Diensteanbieter">
        <LegalPlaceholder
          label="Firmenname, Rechtsform, vollständige Anschrift"
          hint="Vollständiger Firmenname einschließlich Rechtsform sowie die ladungsfähige Anschrift. Ein Postfach genügt nicht."
        />
      </LegalSection>

      <LegalSection title="Kontakt">
        <LegalPlaceholder
          label="Telefonnummer und E-Mail-Adresse"
          hint="Angaben, die eine schnelle elektronische Kontaktaufnahme und unmittelbare Kommunikation ermöglichen."
        />
      </LegalSection>

      <LegalSection title="Vertretungsberechtigte">
        <LegalPlaceholder
          label="Geschäftsführung bzw. Inhaber"
          hint="Bei juristischen Personen die Vertretungsberechtigten, bei Einzelunternehmen der Inhaber."
        />
      </LegalSection>

      <LegalSection title="Registereintrag">
        <LegalPlaceholder
          label="Registergericht und Registernummer"
          hint="Handels-, Vereins-, Partnerschafts- oder Genossenschaftsregister mit Registernummer, sofern eine Eintragung besteht."
        />
      </LegalSection>

      <LegalSection title="Umsatzsteuer-Identifikationsnummer">
        <LegalPlaceholder
          label="USt-IdNr. nach § 27 a UStG"
          hint="Sofern vorhanden. Andernfalls kann die Steuernummer angegeben werden."
        />
      </LegalSection>

      <LegalSection title="Verantwortlich für den Inhalt">
        <LegalPlaceholder
          label="Name und Anschrift nach § 18 Abs. 2 MStV"
          hint="Erforderlich, sofern journalistisch-redaktionell gestaltete Inhalte angeboten werden – bei einem Ratgeberbereich mit eigenen Beiträgen ist das regelmäßig der Fall."
        />
      </LegalSection>

      <LegalSection title="Streitbeilegung">
        <LegalPlaceholder
          label="Hinweis zur Verbraucherschlichtung"
          hint="Angabe, ob eine Bereitschaft oder Verpflichtung zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle besteht."
        />
      </LegalSection>
    </LegalPage>
  )
}
