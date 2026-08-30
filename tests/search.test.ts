import { describe, expect, it } from 'vitest'
import {
  BASE_SYNONYMS,
  expandTokens,
  levenshtein,
  looksLikeIdentifier,
  scoreProduct,
  scoreToken,
  toleranceFor,
  type SearchableProduct,
} from '@/lib/server/search'
import { normalizeSearch, slugify, tokenize, transliterate } from '@/lib/utils/text'

/**
 * Suche.
 *
 * Die Suche ist der wichtigste Weg zum Produkt. Diese Tests sichern ab, dass
 * Umlaute, Tippfehler und Synonyme nicht dazu führen, dass ein vorhandener
 * Artikel unauffindbar wird — und dass die Rangfolge nachvollziehbar bleibt.
 */

describe('Normalisierung', () => {
  it('ersetzt Umlaute durch ASCII', () => {
    expect(transliterate('Räucherhaken')).toBe('Raeucherhaken')
    expect(transliterate('Größe')).toBe('Groesse')
  })

  it('normalisiert für die Suche', () => {
    expect(normalizeSearch('  Räucher-Haken, 20 cm!  ')).toBe('raeucher haken 20 cm')
  })

  it('zerlegt in Tokens', () => {
    expect(tokenize('Räucherhaken V4A 20cm')).toEqual(['raeucherhaken', 'v4a', '20cm'])
    expect(tokenize('   ')).toEqual([])
  })

  it('erzeugt URL-taugliche Slugs', () => {
    expect(slugify('Räucherhaken 20 cm, V4A')).toBe('raeucherhaken-20-cm-v4a')
    expect(slugify('Süßholz & Zimt')).toBe('suessholz-zimt')
  })
})

describe('levenshtein', () => {
  it('erkennt Gleichheit', () => {
    expect(levenshtein('haken', 'haken')).toBe(0)
  })

  it('zählt einzelne Änderungen', () => {
    expect(levenshtein('haken', 'hakan')).toBe(1)
    expect(levenshtein('haken', 'hake')).toBe(1)
    expect(levenshtein('haken', 'hakenn')).toBe(1)
  })

  it('bricht früh ab, wenn die Grenze überschritten wird', () => {
    // Statt der echten Distanz genügt „größer als die Grenze“.
    expect(levenshtein('haken', 'raeuchermehl', 2)).toBeGreaterThan(2)
  })

  it('kommt mit leeren Zeichenketten zurecht', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
  })
})

describe('toleranceFor', () => {
  it('erlaubt bei kurzen Wörtern keine Abweichung', () => {
    // Sonst würde „aal“ auf „öl“ oder „all“ passen.
    expect(toleranceFor('aal')).toBe(0)
  })

  it('erlaubt mit zunehmender Länge mehr Abweichung', () => {
    expect(toleranceFor('haken')).toBe(1)
    expect(toleranceFor('lorbeer')).toBe(2)
    expect(toleranceFor('raeucherhaken')).toBe(3)
  })
})

describe('scoreToken', () => {
  it('bewertet exakte Treffer am höchsten', () => {
    const exact = scoreToken('haken', 'haken', 10)
    const prefix = scoreToken('haken', 'haken aus edelstahl', 10)
    const inner = scoreToken('haken', 'edelstahl haken lang', 10)
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(inner)
  })

  it('bewertet ein ganzes Wort höher als einen bloßen Wortanfang', () => {
    // Wer „Pfeffer“ sucht, meint Pfeffer und nicht Pfefferminze — auch dann,
    // wenn die Minze zufällig am Anfang des Namens steht.
    const wholeWord = scoreToken('pfeffer', 'schwarzer pfeffer ganz 250 g', 10)
    const wordPrefix = scoreToken('pfeffer', 'pfefferminze gerebelt 250 g', 10)
    expect(wholeWord).toBeGreaterThan(wordPrefix)
  })

  it('bewertet Wortanfänge höher als Treffer im Wortinneren', () => {
    const wordStart = scoreToken('haken', 'fleischer haken', 10)
    const insideWord = scoreToken('haken', 'fleischerhaken', 10)
    expect(wordStart).toBeGreaterThan(insideWord)
  })

  it('findet Wörter trotz Tippfehler', () => {
    expect(scoreToken('rauchermehl', 'raeuchermehl buche', 10)).toBeGreaterThan(0)
  })

  it('findet nichts bei völlig anderem Wort', () => {
    expect(scoreToken('haken', 'pfeffer gemahlen', 10)).toBe(0)
  })

  it('sucht unscharf nur gegen einzelne Wörter, nicht gegen den ganzen Text', () => {
    // Ohne diese Begrenzung würde jeder lange Text auf alles passen.
    expect(scoreToken('xyz', 'ein sehr langer beschreibungstext ohne bezug', 10)).toBe(0)
  })
})

describe('expandTokens', () => {
  const synonyms = new Map(Object.entries(BASE_SYNONYMS))

  it('ergänzt Synonyme', () => {
    const result = expandTokens(['haken'], synonyms)
    expect(result).toContain('haken')
    expect(result).toContain('raeucherhaken')
  })

  it('löst umgangssprachliche Begriffe auf', () => {
    expect(expandTokens(['spaene'], synonyms)).toContain('raeuchermehl')
    expect(expandTokens(['lake'], synonyms)).toContain('raeucherlauge')
    expect(expandTokens(['fleischhaken'], synonyms)).toContain('raeucherhaken')
  })

  it('lässt unbekannte Begriffe unverändert', () => {
    expect(expandTokens(['sonderbegriff'], synonyms)).toEqual(['sonderbegriff'])
  })

  it('erzeugt keine Dubletten', () => {
    const result = expandTokens(['haken', 'fleischhaken'], synonyms)
    expect(new Set(result).size).toBe(result.length)
  })
})

function product(overrides: Partial<SearchableProduct> = {}): SearchableProduct {
  return {
    id: 'p1',
    slug: 'raeucherhaken-s-130',
    name: 'Räucherhaken S 130',
    sku: 'HAK-0001',
    articleNumber: 'RH-HAK-0001',
    shortDescription: 'S-Haken aus V2A für Forelle und Makrele',
    description: 'Der Arbeitshaken für den täglichen Fischgang.',
    material: 'V2A',
    usage: 'Fisch',
    categoryName: 'Räucherhaken',
    categorySlug: 'raeucherhaken',
    priceCents: 1390,
    popularity: 50,
    bestseller: false,
    stock: 100,
    imageUrl: null,
    ...overrides,
  }
}

describe('scoreProduct', () => {
  it('bewertet einen Namenstreffer höher als einen Beschreibungstreffer', () => {
    const byName = scoreProduct(product(), ['raeucherhaken'])
    const byDescription = scoreProduct(product(), ['arbeitshaken'])
    expect(byName).toBeGreaterThan(byDescription)
  })

  it('findet über die Artikelnummer', () => {
    expect(scoreProduct(product(), ['rh', 'hak', '0001'])).toBeGreaterThan(0)
  })

  it('belohnt vollständige Abdeckung aller Suchbegriffe', () => {
    const both = scoreProduct(product(), ['raeucherhaken', 'v2a'])
    const onlyOne = scoreProduct(product(), ['raeucherhaken', 'kirschholz'])
    expect(both).toBeGreaterThan(onlyOne)
  })

  it('stuft ausverkaufte Artikel leicht zurück', () => {
    const inStock = scoreProduct(product({ stock: 10 }), ['raeucherhaken'])
    const soldOut = scoreProduct(product({ stock: 0 }), ['raeucherhaken'])
    expect(inStock).toBeGreaterThan(soldOut)
  })

  it('bevorzugt Bestseller bei sonst gleichem Treffer', () => {
    const normal = scoreProduct(product(), ['raeucherhaken'])
    const best = scoreProduct(product({ bestseller: true }), ['raeucherhaken'])
    expect(best).toBeGreaterThan(normal)
  })

  it('liefert null ohne Suchbegriff', () => {
    expect(scoreProduct(product(), [])).toBe(0)
  })

  it('liefert null bei völlig unpassender Suche', () => {
    expect(scoreProduct(product(), ['zimtstange'])).toBe(0)
  })

  it('findet trotz fehlender Umlaute', () => {
    // Wer „raucherhaken“ ohne Umlaut tippt, muss den Artikel finden.
    expect(scoreProduct(product(), ['raucherhaken'])).toBeGreaterThan(0)
  })
})

describe('looksLikeIdentifier', () => {
  it('erkennt Artikelnummern und SKUs', () => {
    expect(looksLikeIdentifier('RH-HAK-0001')).toBe(true)
    expect(looksLikeIdentifier('rh-hak-0001')).toBe(true)
    expect(looksLikeIdentifier('HAK-0001')).toBe(true)
    expect(looksLikeIdentifier('HAK-0042-V4A-200')).toBe(true)
  })

  it('hält gewöhnliche Suchanfragen davon fern', () => {
    // Ohne den rein numerischen Abschnitt wäre "V4A-Draht" fälschlich eine
    // Artikelnummer, und die normale Suche würde übersprungen.
    expect(looksLikeIdentifier('V4A-Draht')).toBe(false)
    expect(looksLikeIdentifier('raeucherhaken')).toBe(false)
    expect(looksLikeIdentifier('S-Haken')).toBe(false)
    expect(looksLikeIdentifier('pfeffer schwarz')).toBe(false)
  })

  it('lehnt zu kurze und zu lange Eingaben ab', () => {
    expect(looksLikeIdentifier('A-1')).toBe(false)
    expect(looksLikeIdentifier(`A-${'1'.repeat(60)}`)).toBe(false)
  })

  it('erkennt Werkstoffbezeichnungen mit Punkt', () => {
    // 1.4404 ist keine Artikelnummer des Shops, hat aber dieselbe Form.
    // Der Sonderweg fängt das ab und sucht die Zeichenkette wörtlich.
    expect(looksLikeIdentifier('1.4404')).toBe(true)
  })
})
