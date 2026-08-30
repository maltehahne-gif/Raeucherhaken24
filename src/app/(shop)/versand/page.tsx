import type { Metadata } from 'next'
import { Package, Truck, Weight } from 'lucide-react'
import { buildMetadata } from '@/lib/seo/metadata'
import { LegalPage, LegalSection, LegalPlaceholder } from '@/components/layout/legal-page'
import { DEFAULT_SHIPPING_RULE } from '@/lib/server/pricing'
import { formatPrice } from '@/lib/money'
import { formatWeight } from '@/lib/utils/text'

export const metadata: Metadata = buildMetadata({
  title: 'Versand und Lieferung',
  description:
    'Versandkosten, Lieferzeiten und Liefergebiet bei Räucherhaken24. Versandkostenfrei ab 79 € Warenwert innerhalb Deutschlands.',
  path: '/versand',
})

/**
 * Versandseite.
 *
 * Die Konditionen kommen aus derselben Konstante, mit der die Pricing Engine
 * rechnet. Damit kann die Seite nicht veralten, wenn sich die Regel ändert.
 */
export default function ShippingPage() {
  const rule = DEFAULT_SHIPPING_RULE

  return (
    <LegalPage
      title="Versand und Lieferung"
      intro="Wie wir versenden, was es kostet und wie lange es dauert."
    >
      <LegalSection title="Versandkosten innerhalb Deutschlands">
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <Truck className="mt-0.5 size-4.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <span>
              <strong className="font-medium text-ink">
                Versandkostenfrei ab {formatPrice(rule.freeShippingThresholdCents)} Warenwert.
              </strong>{' '}
              Maßgeblich ist der Warenwert nach Abzug von Rabatten und Gutscheinen.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Package className="mt-0.5 size-4.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <span>
              Unterhalb dieser Grenze beträgt der Grundbetrag{' '}
              <strong className="font-medium text-ink">{formatPrice(rule.baseCents)}</strong> je
              Sendung.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Weight className="mt-0.5 size-4.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <span>
              Ab einem Versandgewicht von {formatWeight(rule.perKgOverGrams)} kommen{' '}
              {formatPrice(rule.perKgCents)} je angefangenem weiteren Kilogramm hinzu. Ab{' '}
              {formatWeight(rule.heavyWeightGrams)} berechnen wir zusätzlich einen Sperrgutzuschlag
              von {formatPrice(rule.heavySurchargeCents)}.
            </span>
          </li>
        </ul>
        <p className="pt-2">
          Die genauen Versandkosten Ihrer Bestellung sehen Sie jederzeit im Warenkorb, bevor Sie die
          Bestellung abschließen. Sie werden serverseitig berechnet – es gibt keine Nachberechnung
          nach der Bestellung.
        </p>
      </LegalSection>

      <LegalSection title="Lieferzeit">
        <p>
          Die Lieferzeit steht bei jedem Artikel auf der Produktseite, üblicherweise zwei bis vier
          Werktage. Sonderanfertigungen und Artikel, die nach Auftrag gefertigt werden, sind
          gesondert gekennzeichnet und haben längere Vorlaufzeiten.
        </p>
        <p>
          Bei Vorkasse beginnt die Lieferzeit mit dem Tag nach dem Zahlungseingang. Enthält eine
          Bestellung Artikel mit unterschiedlichen Lieferzeiten, richtet sich der Versand nach dem
          Artikel mit der längsten Lieferzeit, sofern nichts anderes vereinbart ist.
        </p>
      </LegalSection>

      <LegalSection title="Liefergebiet">
        <p>
          Wir liefern derzeit ausschließlich innerhalb Deutschlands. Für Lieferungen in andere Länder
          schreiben Sie uns bitte über das Kontaktformular – wir melden uns mit einem Angebot
          einschließlich Versandkosten.
        </p>
      </LegalSection>

      <LegalSection title="Versanddienstleister und Sendungsverfolgung">
        <LegalPlaceholder
          label="Eingesetzte Versanddienstleister"
          hint="Welche Dienstleister werden tatsächlich eingesetzt? Die Anwendung unterstützt DHL, DPD, GLS, UPS, Speditionsversand und Selbstabholung und erzeugt zu einer hinterlegten Sendungsnummer automatisch den passenden Verfolgungslink."
        />
      </LegalSection>

      <LegalSection title="Transportschäden">
        <LegalPlaceholder
          label="Vorgehen bei Transportschäden"
          hint="Beschreibung des Vorgehens bei sichtbaren Schäden an der Verpackung und bei verdeckten Mängeln, ohne die gesetzlichen Rechte einzuschränken."
        />
      </LegalSection>
    </LegalPage>
  )
}
