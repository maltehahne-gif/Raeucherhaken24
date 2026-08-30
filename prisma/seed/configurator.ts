/**
 * Optionsgruppen des Räucherhaken-Konfigurators.
 *
 * Die Aufpreise liegen hier — und nur hier. Der Browser kennt sie zwar für die
 * Vorschau, entscheidet aber nichts: Beim Hinzufügen zum Warenkorb bewertet der
 * Server die übermittelten Optionsschlüssel erneut gegen genau diese Daten.
 */

export interface ConfigOptionSeed {
  key: string
  label: string
  description?: string
  /** Aufpreis je Stück in Cent */
  priceDeltaCents?: number
  /** Alternativ prozentualer Aufschlag in Basispunkten (500 = 5 %) */
  priceDeltaBp?: number
  weightDeltaGrams?: number
  numericValue?: number
  isDefault?: boolean
}

export interface ConfigGroupSeed {
  key: string
  label: string
  helpText?: string
  required: boolean
  options: ConfigOptionSeed[]
}

export const HOOK_CONFIG_GROUPS: ConfigGroupSeed[] = [
  {
    key: 'modell',
    label: 'Hakenmodell',
    helpText: 'Die Bauform bestimmt, wie das Räuchergut hängt und wie gleichmäßig der Rauch anliegt.',
    required: true,
    options: [
      {
        key: 's-haken',
        label: 'S-Haken',
        description: 'Der Klassiker für Forelle, Makrele und ganze Fische.',
        priceDeltaCents: 0,
        isDefault: true,
      },
      {
        key: 'doppelhaken',
        label: 'Doppelhaken',
        description: 'Zwei Schenkel für Filets und Seiten – hängt ruhiger als ein Einzelhaken.',
        priceDeltaCents: 45,
        weightDeltaGrams: 14,
      },
      {
        key: 'vierzinker',
        label: 'Vierzinker',
        description: 'Vier Dornen für Wurst und kleinere Stücke, sehr gute Rauchverteilung.',
        priceDeltaCents: 120,
        weightDeltaGrams: 32,
      },
      {
        key: 'spiesshaken',
        label: 'Spießhaken',
        description: 'Gerader Schaft mit Widerhaken – für Aal und lange Fische.',
        priceDeltaCents: 65,
        weightDeltaGrams: 18,
      },
    ],
  },
  {
    key: 'laenge',
    label: 'Gesamtlänge',
    helpText:
      'Gemessen von der Oberkante der Öse bis zur Spitze. Längere Haken schaffen Abstand zur Rauchquelle.',
    required: true,
    options: [
      { key: '100', label: '100 mm', numericValue: 100, priceDeltaCents: 0 },
      { key: '150', label: '150 mm', numericValue: 150, priceDeltaCents: 25, weightDeltaGrams: 8, isDefault: true },
      { key: '200', label: '200 mm', numericValue: 200, priceDeltaCents: 55, weightDeltaGrams: 17 },
      { key: '250', label: '250 mm', numericValue: 250, priceDeltaCents: 90, weightDeltaGrams: 26 },
      { key: '300', label: '300 mm', numericValue: 300, priceDeltaCents: 135, weightDeltaGrams: 36 },
      { key: '400', label: '400 mm', numericValue: 400, priceDeltaCents: 210, weightDeltaGrams: 54 },
    ],
  },
  {
    key: 'material',
    label: 'Werkstoff',
    helpText:
      'V4A enthält Molybdän und ist gegenüber chloridhaltiger Umgebung – also Pökellake und Salz – widerstandsfähiger als V2A.',
    required: true,
    options: [
      {
        key: 'va',
        label: 'VA (Edelstahl rostfrei)',
        description: 'Grundausführung für den gelegentlichen Einsatz.',
        priceDeltaCents: 0,
      },
      {
        key: 'v2a',
        label: 'V2A (1.4301)',
        description: 'Standard für Räucherkammern ohne dauerhaften Salzkontakt.',
        priceDeltaBp: 1500,
        isDefault: true,
      },
      {
        key: 'v4a',
        label: 'V4A (1.4404)',
        description: 'Für Dauereinsatz in Lake, Salz und feuchter Umgebung.',
        priceDeltaBp: 4500,
      },
    ],
  },
  {
    key: 'spitze',
    label: 'Spitzenausführung',
    helpText: 'Die Spitze entscheidet, wie leicht der Haken einsticht und wie schonend er das Gut hält.',
    required: true,
    options: [
      {
        key: 'angespitzt',
        label: 'Angespitzt',
        description: 'Maschinell angespitzt – die übliche Ausführung.',
        priceDeltaCents: 0,
        isDefault: true,
      },
      {
        key: 'handgeschliffen',
        label: 'Handgeschliffen',
        description: 'Feiner Anschliff, sticht leichter ein und reißt weniger aus.',
        priceDeltaCents: 55,
      },
      {
        key: 'abgerundet',
        label: 'Abgerundet',
        description: 'Ohne Spitze – zum Einhängen an Schlaufe oder Netz.',
        priceDeltaCents: 20,
      },
    ],
  },
  {
    key: 'bearbeitung',
    label: 'Oberfläche und Bearbeitung',
    helpText: 'Zusätzliche Bearbeitungsschritte nach dem Biegen.',
    required: true,
    options: [
      {
        key: 'standard',
        label: 'Ohne Zusatzbearbeitung',
        description: 'Werkstoffoberfläche wie angeliefert, entgratet.',
        priceDeltaCents: 0,
        isDefault: true,
      },
      {
        key: 'elektropoliert',
        label: 'Elektropoliert',
        description: 'Glatte, gut zu reinigende Oberfläche.',
        priceDeltaBp: 2200,
      },
      {
        key: 'gebuerstet',
        label: 'Gebürstet',
        description: 'Mattierte Oberfläche, unempfindlich gegen Gebrauchsspuren.',
        priceDeltaCents: 40,
      },
      {
        key: 'kennzeichnung',
        label: 'Mit Kennzeichnung',
        description: 'Eingeschlagene Nummer oder Kürzel zur Chargenzuordnung.',
        priceDeltaCents: 95,
      },
    ],
  },
]

/**
 * Mengenstaffel des Konfigurators.
 * Gilt zusätzlich zu Aktionspreisen und wird auf den Stückpreis angewendet.
 */
export const HOOK_PRICE_TIERS = [
  { minQty: 25, discountBp: 300 },
  { minQty: 50, discountBp: 600 },
  { minQty: 100, discountBp: 1000 },
  { minQty: 250, discountBp: 1400 },
  { minQty: 500, discountBp: 1800 },
]

/** Mengenstaffel für regulär gelistete Haken (weniger aggressiv). */
export const STANDARD_PRICE_TIERS = [
  { minQty: 10, discountBp: 300 },
  { minQty: 25, discountBp: 600 },
  { minQty: 50, discountBp: 900 },
]
