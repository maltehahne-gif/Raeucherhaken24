import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/seo/metadata'
import { LegalPage, LegalSection, LegalPlaceholder, LegalNote } from '@/components/layout/legal-page'

export const metadata: Metadata = buildMetadata({
  title: 'Datenschutzerklärung',
  description: 'Informationen zur Verarbeitung personenbezogener Daten in diesem Onlineshop.',
  path: '/datenschutz',
})

/**
 * Datenschutzseite.
 *
 * Der technische Teil ist ausgefüllt, weil er sich aus der tatsächlichen
 * Implementierung ergibt und niemand ihn besser beschreiben kann als der Code
 * selbst. Alles Rechtsverbindliche bleibt Platzhalter.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Datenschutzerklärung"
      intro="Informationen nach Art. 13 und 14 DSGVO zur Verarbeitung personenbezogener Daten."
    >
      <LegalSection title="Verantwortlicher">
        <LegalPlaceholder
          label="Name und Kontaktdaten des Verantwortlichen"
          hint="Identisch mit den Angaben im Impressum, ergänzt um die Kontaktdaten des Datenschutzbeauftragten, sofern einer benannt ist."
        />
      </LegalSection>

      <LegalSection title="Welche Daten dieser Shop technisch verarbeitet">
        <LegalNote>
          <p className="font-medium text-ink">
            Dieser Abschnitt beschreibt den tatsächlichen technischen Stand der Anwendung. Er ersetzt
            keine juristische Prüfung, gibt dem Betreiber aber eine belastbare Grundlage.
          </p>
        </LegalNote>

        <h3 className="pt-2 font-display text-base font-semibold text-ink">Cookies</h3>
        <p>Die Anwendung setzt ausschließlich technisch notwendige Cookies:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong className="font-medium text-ink">rh24_cart</strong> – ein zufälliger Token, über
            den der serverseitig gespeicherte Warenkorb zugeordnet wird. HttpOnly, SameSite=Lax,
            Laufzeit 30 Tage. Enthält selbst keine personenbezogenen Daten.
          </li>
          <li>
            <strong className="font-medium text-ink">rh24_csrf</strong> – ein Zufallswert zum Schutz
            vor websiteübergreifender Anfragenfälschung. Laufzeit 12 Stunden.
          </li>
          <li>
            <strong className="font-medium text-ink">rh24_session</strong> – nur im
            Verwaltungsbereich, für die Anmeldung von Mitarbeitenden. HttpOnly, SameSite=Lax.
          </li>
        </ul>
        <p>
          Es werden keine Cookies zu Analyse-, Werbe- oder Reichweitenmesszwecken gesetzt. Aus diesem
          Grund enthält der Shop auch keinen Zustimmungsbanner.
        </p>

        <h3 className="pt-2 font-display text-base font-semibold text-ink">Lokaler Browserspeicher</h3>
        <p>
          Suchverlauf, zuletzt angesehene Artikel und selbst erstellte Rezepte werden ausschließlich
          im Speicher Ihres Browsers abgelegt. Diese Daten verlassen Ihr Gerät nicht und erreichen
          unseren Server nicht.
        </p>

        <h3 className="pt-2 font-display text-base font-semibold text-ink">Bestellungen</h3>
        <p>
          Zur Abwicklung einer Bestellung verarbeiten wir Name, Anschrift, E-Mail-Adresse sowie
          optional Firma, Telefonnummer und Ihren Bestellhinweis. Rechtsgrundlage ist die Erfüllung
          des Vertrags (Art. 6 Abs. 1 lit. b DSGVO); für die Aufbewahrung gelten die handels- und
          steuerrechtlichen Fristen.
        </p>

        <h3 className="pt-2 font-display text-base font-semibold text-ink">Server- und Sicherheitsprotokolle</h3>
        <p>
          Für die Begrenzung von Anmeldeversuchen und Formularanfragen speichern wir IP-Adressen
          ausschließlich als kryptografischen Hashwert mit geheimem Zusatz. Ein Rückschluss auf die
          ursprüngliche Adresse ist damit praktisch ausgeschlossen. Diese Einträge werden nach 24
          Stunden gelöscht.
        </p>

        <h3 className="pt-2 font-display text-base font-semibold text-ink">Schriftarten</h3>
        <p>
          Die verwendeten Schriftarten werden beim Erstellen der Seite heruntergeladen und von unserem
          eigenen Server ausgeliefert. Beim Besuch dieser Seite wird keine Verbindung zu externen
          Schriftanbietern aufgebaut.
        </p>
      </LegalSection>

      <LegalSection title="Empfänger und Auftragsverarbeiter">
        <LegalPlaceholder
          label="Hosting, Versanddienstleister, Zahlungsdienstleister, E-Mail-Versand"
          hint="Alle Stellen aufführen, an die Daten weitergegeben werden, jeweils mit Zweck und Rechtsgrundlage. Auftragsverarbeitungsverträge sind abzuschließen."
        />
      </LegalSection>

      <LegalSection title="Speicherdauer">
        <LegalPlaceholder
          label="Konkrete Löschfristen je Verarbeitungszweck"
          hint="Handels- und steuerrechtliche Aufbewahrungsfristen sowie die Löschfristen für Support- und Projektanfragen benennen."
        />
      </LegalSection>

      <LegalSection title="Ihre Rechte">
        <LegalPlaceholder
          label="Betroffenenrechte und zuständige Aufsichtsbehörde"
          hint="Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch und Beschwerderecht – mit Angabe der zuständigen Aufsichtsbehörde."
        />
      </LegalSection>
    </LegalPage>
  )
}
