import { beforeEach, describe, expect, it } from 'vitest'
import { createCategory, prisma, resetDatabase } from './helpers/db'
import { recommend, findProductsForAdvice } from '@/lib/server/advisor'
import { extractProfile, answer, type ChatMessage } from '@/lib/server/smoky'

/**
 * Beratung.
 *
 * Die wichtigste Zusage des Beraters lautet: Es wird nichts empfohlen, was es
 * nicht gibt. Diese Tests sichern sie ab — und zusätzlich, dass die Empfehlung
 * fachlich passt. Ein Fleischerhaken für 40 kg an einer 300-g-Forelle wäre zwar
 * belastbar genug, aber eine schlechte Beratung.
 */

let index = 0

async function seedHooks() {
  // createCategory liefert den Datensatz, gebraucht wird die Id.
  const raeucherhaken = (await createCategory('raeucherhaken')).id
  const fleischerhaken = (await createCategory('fleischerhaken')).id
  const mehl = (await createCategory('raeuchermehl')).id
  const laugen = (await createCategory('raeucherlaugen')).id
  const gewuerze = (await createCategory('naturgewuerze')).id

  async function product(
    categoryId: string,
    name: string,
    extra: Record<string, unknown> = {},
  ) {
    index += 1
    return prisma.product.create({
      data: {
        slug: `artikel-${index}`,
        sku: `SKU-${index}`,
        articleNumber: `ART-${index}`,
        name,
        shortDescription: name,
        description: name,
        categoryId,
        priceCents: 1500,
        stock: 50,
        weightGrams: 100,
        ...extra,
      },
    })
  }

  await product(raeucherhaken, 'Leichter S-Haken für Forelle', {
    lengthMm: 130,
    loadCapacityGrams: 1_500,
    material: 'V2A',
    usage: 'Fisch',
  })
  await product(raeucherhaken, 'Schwerer S-Haken für Schinken', {
    lengthMm: 260,
    loadCapacityGrams: 12_000,
    material: 'V4A',
    usage: 'Schinken',
    priceCents: 2690,
  })
  await product(raeucherhaken, 'Vierzinker Kammhaken für Wurst', {
    lengthMm: 210,
    loadCapacityGrams: 2_400,
    material: 'V2A',
    usage: 'Wurst',
  })
  await product(fleischerhaken, 'Schlachthaken schwer', {
    lengthMm: 250,
    loadCapacityGrams: 40_000,
    material: 'V4A',
    usage: 'Fleisch',
    priceCents: 4500,
  })

  await product(mehl, 'Erlenmehl mittel', { material: 'Holz', baseUnitAmount: 1000 })
  await product(mehl, 'Buchenmehl fein', { material: 'Holz', baseUnitAmount: 1000 })
  await product(mehl, 'Eichenmehl grob', { material: 'Holz', baseUnitAmount: 1000 })

  await product(laugen, 'Forellenlauge Klassisch', { usage: 'Fisch', baseUnitAmount: 1000 })
  await product(laugen, 'Schinkenlauge Bauernart', { usage: 'Schinken', baseUnitAmount: 1000 })

  await product(gewuerze, 'Dillspitzen', { usage: 'Fisch' })
  await product(gewuerze, 'Wacholderbeeren ganz', { usage: 'Schinken' })
}

beforeEach(async () => {
  await resetDatabase()
  await seedHooks()
})

describe('recommend', () => {
  it('empfiehlt für Forellen den leichten Fischhaken', async () => {
    const result = await recommend({ foodType: 'fisch', foodDetail: 'Forelle', method: 'heiss' }, 2)
    expect(result.hooks[0].product.name).toContain('Forelle')
  })

  it('empfiehlt für Forellen keinen Schlachthaken', async () => {
    // Ein Haken für 40 kg trägt die Forelle mühelos — er ist trotzdem die
    // falsche Bauform. Grobe Überdimensionierung muss zurückgestuft werden.
    const result = await recommend({ foodType: 'fisch', foodDetail: 'Forelle', method: 'heiss' }, 3)
    const names = result.hooks.map((h) => h.product.name)
    expect(names[0]).not.toContain('Schlachthaken')
  })

  it('empfiehlt für Schinken den schweren Haken', async () => {
    const result = await recommend({ foodType: 'schinken', method: 'kalt', heavyBrineUse: true }, 2)
    expect(result.hooks[0].product.name).toContain('Schinken')
  })

  it('bevorzugt bei Lakekontakt V4A und begründet das', async () => {
    const result = await recommend({ foodType: 'schinken', method: 'kalt', heavyBrineUse: true }, 3)
    expect(result.hooks[0].product.material).toBe('V4A')
    expect(result.notes.some((n) => n.includes('V4A'))).toBe(true)
  })

  it('empfiehlt ohne Lakekontakt V2A und nennt V4A als haltbarere Wahl', async () => {
    const result = await recommend({ foodType: 'fisch', method: 'heiss', heavyBrineUse: false }, 3)
    expect(result.notes.some((n) => n.includes('V2A'))).toBe(true)
  })

  it('empfiehlt für Wurst den Kammhaken', async () => {
    const result = await recommend({ foodType: 'wurst', method: 'warm' }, 2)
    expect(result.hooks[0].product.name).toContain('Vierzinker')
  })

  it('wählt die Holzart nach Räuchergut und Geschmack', async () => {
    const mild = await recommend({ foodType: 'fisch', flavor: 'mild', method: 'heiss' }, 1)
    expect(mild.meal[0].product.name).toContain('Erle')

    const kraeftig = await recommend({ foodType: 'schinken', flavor: 'kraeftig', method: 'kalt' }, 1)
    expect(kraeftig.meal[0].product.name).toContain('Eiche')
  })

  it('wählt die Lauge passend zum Lebensmittel', async () => {
    const result = await recommend({ foodType: 'fisch', foodDetail: 'Forelle', method: 'heiss' }, 1)
    expect(result.brine[0].product.name).toContain('Forellen')
  })

  it('empfiehlt eine Menge Räuchermehl je nach Methode', async () => {
    const kalt = await recommend({ foodType: 'fisch', method: 'kalt' }, 1)
    const heiss = await recommend({ foodType: 'fisch', method: 'heiss' }, 1)
    // Kalträuchern läuft über Stunden und braucht deutlich mehr Mehl.
    expect(kalt.notes.some((n) => n.includes('Kalträuchern'))).toBe(true)
    expect(heiss.notes.some((n) => n.includes('Heißräuchern'))).toBe(true)
  })

  it('leitet die Hakenmenge aus der Stückzahl ab und plant Reserve ein', async () => {
    const result = await recommend({ foodType: 'fisch', method: 'heiss', pieceCount: 20 }, 1)
    expect(result.hooks[0].suggestedQuantity).toBeGreaterThan(20)
  })

  it('empfiehlt niemals einen inaktiven Artikel', async () => {
    await prisma.product.updateMany({ data: { active: false } })
    const result = await recommend({ foodType: 'fisch', method: 'heiss' }, 3)
    expect(result.hooks).toHaveLength(0)
    expect(result.meal).toHaveLength(0)
  })

  it('gibt jeder Empfehlung eine Begründung mit', async () => {
    const result = await recommend({ foodType: 'fisch', method: 'heiss' }, 3)
    for (const group of [result.hooks, result.meal, result.brine]) {
      for (const item of group) {
        expect(item.reason.length).toBeGreaterThan(10)
      }
    }
  })
})

describe('findProductsForAdvice', () => {
  it('findet Artikel über Stichworte', async () => {
    const found = await findProductsForAdvice(['Forelle'])
    expect(found.length).toBeGreaterThan(0)
  })

  it('liefert nichts bei zu kurzen Stichworten', async () => {
    expect(await findProductsForAdvice(['a'])).toHaveLength(0)
    expect(await findProductsForAdvice([])).toHaveLength(0)
  })
})

describe('extractProfile', () => {
  function messages(...texts: string[]): ChatMessage[] {
    return texts.map((content) => ({ role: 'user' as const, content }))
  }

  it('erkennt Lebensmittel und Methode', () => {
    const profile = extractProfile(messages('Ich möchte Forellen heiß räuchern.'))
    expect(profile.foodType).toBe('fisch')
    expect(profile.foodDetail).toBe('Forelle')
    expect(profile.method).toBe('heiss')
  })

  it('erkennt Kalträuchern und Geschmack', () => {
    const profile = extractProfile(messages('Lachs kalt räuchern, kräftig bitte.'))
    expect(profile.method).toBe('kalt')
    expect(profile.flavor).toBe('kraeftig')
    expect(profile.foodDetail).toBe('Lachs')
  })

  it('erkennt Mengenangaben in Stück und Kilogramm', () => {
    expect(extractProfile(messages('10 Forellen')).pieceCount).toBe(10)
    expect(extractProfile(messages('etwa 5 kg Lachs')).amountGrams).toBe(5000)
    expect(extractProfile(messages('rund 2,5 kg')).amountGrams).toBe(2500)
  })

  it('erkennt gewerblichen Einsatz und Lakekontakt', () => {
    const profile = extractProfile(messages('Wir sind eine Räucherei und arbeiten täglich mit Pökellake.'))
    expect(profile.experience).toBe('profi')
    expect(profile.heavyBrineUse).toBe(true)
  })

  it('erkennt Einsteiger', () => {
    expect(extractProfile(messages('Ich bin Anfänger.')).experience).toBe('einsteiger')
    expect(extractProfile(messages('Ich habe das noch nie gemacht.')).experience).toBe('einsteiger')
  })

  it('behält frühere Angaben und ergänzt neue', () => {
    const first = extractProfile(messages('Forellen'))
    const second = extractProfile(messages('Forellen', 'heiß räuchern'), first)
    expect(second.foodType).toBe('fisch')
    expect(second.method).toBe('heiss')
  })

  it('wertet nur Nutzernachrichten aus', () => {
    const withAssistant: ChatMessage[] = [
      { role: 'assistant', content: 'Möchten Sie Schinken kalt räuchern?' },
      { role: 'user', content: 'Nein, Forellen.' },
    ]
    const profile = extractProfile(withAssistant)
    expect(profile.foodDetail).toBe('Forelle')
  })
})

describe('answer', () => {
  it('fragt nach, solange Wesentliches fehlt', async () => {
    const reply = await answer([{ role: 'user', content: 'Hallo' }])
    expect(reply.products).toHaveLength(0)
    expect(reply.text).toContain('?')
    expect(reply.suggestions.length).toBeGreaterThan(0)
  })

  it('empfiehlt, sobald Räuchergut und Methode feststehen', async () => {
    const reply = await answer([{ role: 'user', content: 'Ich möchte Forellen heiß räuchern.' }])
    expect(reply.products.length).toBeGreaterThan(0)
    expect(reply.profile.foodType).toBe('fisch')
  })

  it('empfiehlt ausschließlich Artikel aus dem Katalog', async () => {
    const reply = await answer([{ role: 'user', content: 'Schinken kalt räuchern, 10 kg.' }])
    const known = new Set(
      (await prisma.product.findMany({ select: { slug: true } })).map((p) => p.slug),
    )
    for (const product of reply.products) {
      expect(known.has(product.slug)).toBe(true)
    }
  })

  it('arbeitet ohne KI-Anbieter regelbasiert weiter', async () => {
    // Ohne Schlüssel darf die Beratung nicht ausfallen.
    const reply = await answer([{ role: 'user', content: 'Forellen heiß räuchern.' }])
    expect(reply.source).toBe('regelwerk')
    expect(reply.text.length).toBeGreaterThan(20)
  })
})
