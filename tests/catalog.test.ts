import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  buildFilterHref,
  parseFilters,
  toggleValue,
  type CatalogFilters,
} from '@/lib/server/product-query'
import { buildConfigHash } from '@/lib/server/cart'
import {
  checkoutSchema,
  addToCartSchema,
  applyCouponSchema,
} from '@/lib/validation/checkout'
import { contactSchema } from '@/lib/validation/contact'

/**
 * Katalogfilter und Formularvalidierung.
 *
 * Der Filterzustand steckt vollständig in der URL. Diese Tests sichern ab, dass
 * eine manipulierte oder unsinnige URL den Katalog nicht unbenutzbar macht und
 * dass die Zurück-Taste keine Zustände verliert.
 */

describe('parseFilters', () => {
  it('liefert sinnvolle Vorgaben ohne Parameter', () => {
    const filters = parseFilters({})
    expect(filters.page).toBe(1)
    expect(filters.sort).toBe('beliebtheit')
    expect(filters.materials).toEqual([])
    expect(filters.minPriceCents).toBeNull()
    expect(filters.inStockOnly).toBe(false)
  })

  it('liest Mehrfachfilter aus einer kommaseparierten Liste', () => {
    expect(parseFilters({ material: 'V2A,V4A' }).materials).toEqual(['V2A', 'V4A'])
  })

  it('liest Mehrfachfilter auch aus wiederholten Parametern', () => {
    expect(parseFilters({ material: ['V2A', 'V4A'] }).materials).toEqual(['V2A', 'V4A'])
  })

  it('wandelt Preisangaben in Cent', () => {
    const filters = parseFilters({ preis_min: '10.50', preis_max: '99,90' })
    expect(filters.minPriceCents).toBe(1050)
    expect(filters.maxPriceCents).toBe(9990)
  })

  it('dreht vertauschte Preisgrenzen um, statt nichts zu finden', () => {
    const filters = parseFilters({ preis_min: '100', preis_max: '10' })
    expect(filters.minPriceCents).toBe(1000)
    expect(filters.maxPriceCents).toBe(10_000)
  })

  it('verwirft unsinnige Preisangaben still', () => {
    const filters = parseFilters({ preis_min: 'abc', preis_max: '-5' })
    expect(filters.minPriceCents).toBeNull()
    expect(filters.maxPriceCents).toBeNull()
  })

  it('fällt bei unbekannter Sortierung auf den Standard zurück', () => {
    expect(parseFilters({ sort: 'zufaellig' }).sort).toBe('beliebtheit')
  })

  it('fängt unsinnige Seitenzahlen ab', () => {
    expect(parseFilters({ seite: '0' }).page).toBe(1)
    expect(parseFilters({ seite: '-3' }).page).toBe(1)
    expect(parseFilters({ seite: 'abc' }).page).toBe(1)
    expect(parseFilters({ seite: '99999' }).page).toBe(500)
  })

  it('begrenzt die Anzahl der Mehrfachfilter', () => {
    const many = Array.from({ length: 40 }, (_, i) => `wert${i}`).join(',')
    expect(parseFilters({ material: many }).materials.length).toBeLessThanOrEqual(12)
  })

  it('verwirft überlange Filterwerte', () => {
    const tooLong = 'x'.repeat(200)
    expect(parseFilters({ material: tooLong }).materials).toEqual([])
  })

  it('kürzt eine überlange Suchanfrage', () => {
    const filters = parseFilters({ q: 'x'.repeat(500) })
    expect(filters.query?.length).toBeLessThanOrEqual(120)
  })

  it('übernimmt Vorgaben, etwa die Kategorie der Seite', () => {
    expect(parseFilters({}, { categorySlug: 'raeucherhaken' }).categorySlug).toBe('raeucherhaken')
  })
})

describe('buildFilterHref', () => {
  const base = parseFilters({})

  it('liefert ohne Filter den reinen Pfad', () => {
    expect(buildFilterHref('/kategorie', base, {})).toBe('/kategorie')
  })

  it('nimmt gesetzte Filter in die URL auf', () => {
    const href = buildFilterHref('/kategorie', base, { materials: ['V4A'], inStockOnly: true })
    expect(href).toContain('material=V4A')
    expect(href).toContain('lieferbar=1')
  })

  it('lässt die Standardsortierung aus der URL heraus', () => {
    expect(buildFilterHref('/kategorie', base, { sort: 'beliebtheit' })).toBe('/kategorie')
    expect(buildFilterHref('/kategorie', base, { sort: 'preis-asc' })).toContain('sort=preis-asc')
  })

  it('springt bei einer Filteränderung zurück auf Seite eins', () => {
    const onPageFive: CatalogFilters = { ...base, page: 5 }
    const href = buildFilterHref('/kategorie', onPageFive, { materials: ['V4A'] })
    expect(href).not.toContain('seite=')
  })

  it('behält die Seitenzahl beim reinen Blättern', () => {
    const withFilter: CatalogFilters = { ...base, materials: ['V4A'] }
    const href = buildFilterHref('/kategorie', withFilter, { page: 3 })
    expect(href).toContain('seite=3')
    expect(href).toContain('material=V4A')
  })

  it('formatiert Preisgrenzen wieder als Euro', () => {
    const href = buildFilterHref('/kategorie', base, { minPriceCents: 1050 })
    expect(href).toContain('preis_min=10.50')
  })

  it('erzeugt eine URL, die sich wieder einlesen lässt', () => {
    // Rundlauf: Filter -> URL -> Filter muss denselben Zustand ergeben.
    const original: CatalogFilters = {
      ...base,
      materials: ['V2A', 'V4A'],
      usages: ['Fisch'],
      minPriceCents: 1000,
      maxPriceCents: 5000,
      inStockOnly: true,
      onSaleOnly: true,
      sort: 'preis-desc',
      page: 4,
    }
    const href = buildFilterHref('/kategorie', original, { page: 4 })
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams.entries())
    const reparsed = parseFilters(params)

    expect(reparsed.materials).toEqual(original.materials)
    expect(reparsed.usages).toEqual(original.usages)
    expect(reparsed.minPriceCents).toBe(original.minPriceCents)
    expect(reparsed.maxPriceCents).toBe(original.maxPriceCents)
    expect(reparsed.inStockOnly).toBe(true)
    expect(reparsed.onSaleOnly).toBe(true)
    expect(reparsed.sort).toBe('preis-desc')
    expect(reparsed.page).toBe(4)
  })
})

describe('toggleValue und activeFilterCount', () => {
  it('schaltet einen Wert an und wieder aus', () => {
    expect(toggleValue([], 'V4A')).toEqual(['V4A'])
    expect(toggleValue(['V4A'], 'V4A')).toEqual([])
    expect(toggleValue(['V2A'], 'V4A')).toEqual(['V2A', 'V4A'])
  })

  it('zählt aktive Filter', () => {
    const base = parseFilters({})
    expect(activeFilterCount(base)).toBe(0)
    expect(
      activeFilterCount({
        ...base,
        materials: ['V2A', 'V4A'],
        usages: ['Fisch'],
        minPriceCents: 1000,
        inStockOnly: true,
      }),
    ).toBe(5)
  })
})

describe('buildConfigHash', () => {
  it('liefert für dieselbe Konfiguration denselben Wert', () => {
    const a = buildConfigHash('p1', null, { material: 'v4a', laenge: '200' })
    const b = buildConfigHash('p1', null, { laenge: '200', material: 'v4a' })
    // Die Reihenfolge der Schlüssel darf keine Rolle spielen — sonst landen
    // zwei identische Konfigurationen als getrennte Positionen im Warenkorb.
    expect(a).toBe(b)
  })

  it('unterscheidet verschiedene Konfigurationen', () => {
    const a = buildConfigHash('p1', null, { material: 'v4a' })
    const b = buildConfigHash('p1', null, { material: 'v2a' })
    expect(a).not.toBe(b)
  })

  it('unterscheidet Varianten desselben Produkts', () => {
    expect(buildConfigHash('p1', 'v1', null)).not.toBe(buildConfigHash('p1', 'v2', null))
  })

  it('unterscheidet verschiedene Produkte', () => {
    expect(buildConfigHash('p1', null, null)).not.toBe(buildConfigHash('p2', null, null))
  })
})

describe('checkoutSchema', () => {
  const valid = {
    firstName: 'Malte',
    lastName: 'Hahne',
    email: 'Malte.Hahne@Example.COM',
    street: 'Räucherweg 1',
    postalCode: '24376',
    city: 'Kappeln',
    terms: true,
    privacy: true,
    website: '',
    idempotencyKey: 'co_abcdefghijklmnop',
  }

  it('nimmt gültige Daten an und normalisiert die E-Mail', () => {
    const result = checkoutSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe('malte.hahne@example.com')
  })

  it('verlangt eine fünfstellige Postleitzahl', () => {
    expect(checkoutSchema.safeParse({ ...valid, postalCode: '1234' }).success).toBe(false)
    expect(checkoutSchema.safeParse({ ...valid, postalCode: '123456' }).success).toBe(false)
    expect(checkoutSchema.safeParse({ ...valid, postalCode: 'ABCDE' }).success).toBe(false)
  })

  it('verlangt beide Zustimmungen', () => {
    expect(checkoutSchema.safeParse({ ...valid, terms: false }).success).toBe(false)
    expect(checkoutSchema.safeParse({ ...valid, privacy: false }).success).toBe(false)
  })

  it('lehnt eine ausgefüllte Spamfalle ab', () => {
    expect(checkoutSchema.safeParse({ ...valid, website: 'http://spam.example' }).success).toBe(false)
  })

  it('lehnt ungültige E-Mail-Adressen ab', () => {
    expect(checkoutSchema.safeParse({ ...valid, email: 'keine-adresse' }).success).toBe(false)
  })

  it('entfernt überflüssige Leerzeichen', () => {
    const result = checkoutSchema.safeParse({ ...valid, firstName: '  Malte  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.firstName).toBe('Malte')
  })

  it('lehnt eine unplausible Telefonnummer ab', () => {
    expect(checkoutSchema.safeParse({ ...valid, phone: 'abc' }).success).toBe(false)
    expect(checkoutSchema.safeParse({ ...valid, phone: '+49 4642 123456' }).success).toBe(true)
  })

  it('liefert feldbezogene Fehlermeldungen auf Deutsch', () => {
    const result = checkoutSchema.safeParse({ ...valid, firstName: '', postalCode: 'x' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('firstName')
      expect(paths).toContain('postalCode')
      for (const issue of result.error.issues) {
        expect(issue.message.length).toBeGreaterThan(5)
      }
    }
  })
})

describe('addToCartSchema', () => {
  it('nimmt eine gültige Position an', () => {
    expect(addToCartSchema.safeParse({ productId: 'abc', quantity: 2 }).success).toBe(true)
  })

  it('lehnt Mengen ausserhalb des zulässigen Bereichs ab', () => {
    expect(addToCartSchema.safeParse({ productId: 'abc', quantity: 0 }).success).toBe(false)
    expect(addToCartSchema.safeParse({ productId: 'abc', quantity: -1 }).success).toBe(false)
    expect(addToCartSchema.safeParse({ productId: 'abc', quantity: 1000 }).success).toBe(false)
    expect(addToCartSchema.safeParse({ productId: 'abc', quantity: 1.5 }).success).toBe(false)
  })

  it('nimmt eine Konfiguration entgegen', () => {
    const result = addToCartSchema.safeParse({
      productId: 'abc',
      quantity: 1,
      configuration: { material: 'v4a', laenge: '200' },
    })
    expect(result.success).toBe(true)
  })
})

describe('applyCouponSchema', () => {
  it('normalisiert den Code', () => {
    const result = applyCouponSchema.safeParse({ code: '  rabatt10  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.code).toBe('RABATT10')
  })

  it('lehnt ungültige Zeichen ab', () => {
    expect(applyCouponSchema.safeParse({ code: 'ra<script>' }).success).toBe(false)
  })

  it('lehnt zu kurze Codes ab', () => {
    expect(applyCouponSchema.safeParse({ code: 'ab' }).success).toBe(false)
  })
})

describe('contactSchema', () => {
  const valid = {
    name: 'Malte Hahne',
    email: 'malte@example.com',
    topic: 'general' as const,
    subject: 'Frage zur Lieferzeit',
    message: 'Ich hätte gerne gewusst, wie lange die Lieferung dauert.',
    privacy: true,
    website: '',
  }

  it('nimmt gültige Daten an', () => {
    expect(contactSchema.safeParse(valid).success).toBe(true)
  })

  it('verlangt eine aussagekräftige Nachricht', () => {
    expect(contactSchema.safeParse({ ...valid, message: 'Hallo' }).success).toBe(false)
  })

  it('lehnt ein unbekanntes Anliegen ab', () => {
    expect(contactSchema.safeParse({ ...valid, topic: 'erfunden' }).success).toBe(false)
  })

  it('lehnt eine ausgefüllte Spamfalle ab', () => {
    expect(contactSchema.safeParse({ ...valid, website: 'spam' }).success).toBe(false)
  })
})
