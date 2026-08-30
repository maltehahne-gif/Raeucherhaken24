import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
import { LegalPage, LegalSection, LegalPlaceholder, LegalNote } from '@/components/layout/legal-page'

export const metadata: Metadata = buildMetadata({
  title: 'Widerrufsrecht',
  description: 'Widerrufsbelehrung und Muster-Widerrufsformular.',
  path: '/widerruf',
})

export default function WithdrawalPage() {
  return (
    <LegalPage
      title="Widerrufsrecht"
      intro="Widerrufsbelehrung für Verbraucher und Muster-Widerrufsformular."
    >
      <LegalNote>
        Für die Widerrufsbelehrung existiert ein gesetzliches Muster. Es darf nur unverändert und
        vollständig verwendet werden – deshalb steht hier bewusst kein zusammengekürzter Text.
      </LegalNote>

      <LegalSection title="Widerrufsbelehrung">
        <LegalPlaceholder
          label="Gesetzliche Muster-Widerrufsbelehrung"
          hint="Vollständige Belehrung einschließlich Widerrufsfrist, Anschrift des Unternehmers, Folgen des Widerrufs und Regelung zu den Rücksendekosten."
        />
      </LegalSection>

      <LegalSection title="Ausschluss des Widerrufsrechts">
        <LegalPlaceholder
          label="Ausnahmen, insbesondere bei Sonderanfertigungen"
          hint="Bei Waren, die nach Kundenspezifikation angefertigt oder eindeutig auf persönliche Bedürfnisse zugeschnitten sind, kann das Widerrufsrecht entfallen. Das betrifft Konfigurator-Varianten und Sonderanfertigungen und muss klar geregelt und im Bestellprozess kenntlich gemacht werden."
        />
      </LegalSection>

      <LegalSection title="Muster-Widerrufsformular">
        <LegalPlaceholder
          label="Gesetzliches Muster-Widerrufsformular"
          hint="Das Formular ist im gesetzlich vorgegebenen Wortlaut bereitzustellen, ergänzt um die eigenen Kontaktdaten."
        />
      </LegalSection>
    </LegalPage>
  )
}
