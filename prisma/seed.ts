/**
 * Seed-Daten für Räucherhaken24.
 *
 * Legt eine vollständig arbeitsfähige Demo-Umgebung an: Rollen und Rechte,
 * Kategoriebaum, rund 170 Artikel mit Bildern und technischen Daten, den
 * Räucherhaken-Konfigurator, Gutscheine, Saisonmodi, Rezepte, Wissensartikel
 * sowie Beispielkunden, -bestellungen, -support- und -projektanfragen.
 *
 * Trennung von Produktionsdaten: Die redaktionellen Inhalte liegen als JSON
 * in prisma/seed-data/ und lassen sich vollständig durch echte Produktdaten
 * ersetzen, ohne die Anlagelogik anzufassen. Alle Demodatensätze sind über
 * `npm run db:reset` restlos entfernbar.
 *
 * Der Lauf ist deterministisch: Bestände, Bewertungen und Bestelldaten
 * entstehen aus einem festen Startwert, damit Tests reproduzierbar bleiben.
 *
 * Aufruf: npm run db:seed
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'
import { CATEGORIES, type CategorySeed } from './seed/categories'
import { HOOK_CONFIG_GROUPS, HOOK_PRICE_TIERS, STANDARD_PRICE_TIERS } from './seed/configurator'
import { COUPONS, SEARCH_SYNONYMS, SEASONAL_THEME_SEEDS, seasonalThemeName } from './seed/marketing'
import {
  articleNumber,
  baseUnitReference,
  buildSku,
  daysAgo,
  daysAhead,
  makeRandom,
  pick,
  pickArchetype,
  randomInt,
  uniqueSlug,
} from './seed/helpers'
import type { SeedArticle, SeedCatalog, SeedProduct, SeedRecipe } from './seed/types'
import { writeProductImage } from '../scripts/generate-product-images'
import { DEFAULT_ROLES, PERMISSIONS, PERMISSION_KEYS } from '../src/lib/server/permissions'
import { hashPassword } from '../src/lib/server/crypto'
import { slugify, truncate } from '../src/lib/utils/text'

const prisma = new PrismaClient()

/** Fester Bezugszeitpunkt, damit ein erneuter Lauf dieselben Daten erzeugt. */
const NOW = new Date()
const YEAR = NOW.getFullYear()
const rand = makeRandom('raeucherhaken24-seed-v1')

/** Zuordnung der generierten Produktgruppen zu Kategorien. */
const GROUP_TO_CATEGORY: Record<keyof SeedCatalog, { slug: string; prefix: string }> = {
  haken: { slug: 'raeucherhaken', prefix: 'HAK' },
  fleischerhaken: { slug: 'fleischerhaken', prefix: 'FLH' },
  raeuchermehl: { slug: 'raeuchermehl', prefix: 'MEH' },
  laugen: { slug: 'raeucherlaugen', prefix: 'LAU' },
  sonder: { slug: 'sonderanfertigungen', prefix: 'SON' },
  'gewuerze-1': { slug: 'gewuerze-einzeln', prefix: 'GEW' },
  'gewuerze-2': { slug: 'kraeuter', prefix: 'KRA' },
  'gewuerze-3': { slug: 'gewuerze-einzeln', prefix: 'GEW' },
  'gewuerze-4': { slug: 'gewuerzmischungen', prefix: 'MIS' },
}

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), 'prisma', 'seed-data', name), 'utf8')) as T
}

async function main() {
  console.log('Seed startet …')

  await clearDatabase()
  const permissionIds = await seedPermissions()
  const roleIds = await seedRoles(permissionIds)
  await seedUsers(roleIds)
  const categoryIds = await seedCategories()
  const products = await seedProducts(categoryIds)
  await seedConfigurator(products)
  await seedPromotionsAndTiers(products)
  await seedRelations(products)
  await seedCoupons()
  await seedSeasonalThemes()
  await seedSynonyms()
  const recipeSlugs = await seedRecipes(products)
  await seedArticles()
  await seedDemoOrders(products)
  await seedSupportAndProjects()
  await seedRecipeRatings(recipeSlugs)
  await syncCounters()

  const counts = await Promise.all([
    prisma.product.count(),
    prisma.category.count(),
    prisma.recipe.count(),
    prisma.order.count(),
    prisma.user.count(),
  ])

  console.log(
    [
      '',
      'Seed abgeschlossen:',
      `  ${counts[0]} Artikel in ${counts[1]} Kategorien`,
      `  ${counts[2]} Rezepte`,
      `  ${counts[3]} Beispielbestellungen`,
      `  ${counts[4]} Mitarbeiterkonten`,
      '',
      'Anmeldung im Verwaltungsbereich unter /admin/anmelden:',
      '  inhaber@raeucherhaken24.example      / RaeucherhakenDemo2024!',
      '  verwaltung@raeucherhaken24.example   / RaeucherhakenDemo2024!',
      '  lager@raeucherhaken24.example        / RaeucherhakenDemo2024!',
      '  service@raeucherhaken24.example      / RaeucherhakenDemo2024!',
      '',
      'Diese Zugangsdaten sind ausschliesslich fuer die lokale Entwicklung.',
      'Vor dem Produktivgang: Konten loeschen und mit "npm run admin:create" neu anlegen.',
      '',
    ].join('\n'),
  )
}

/** Entfernt alle Daten. Reihenfolge folgt den Fremdschlüsseln. */
async function clearDatabase() {
  await prisma.$transaction([
    prisma.recipeRating.deleteMany(),
    prisma.recipeProduct.deleteMany(),
    prisma.recipeStep.deleteMany(),
    prisma.recipeIngredient.deleteMany(),
    prisma.recipe.deleteMany(),
    prisma.projectAttachment.deleteMany(),
    prisma.customProject.deleteMany(),
    prisma.supportMessage.deleteMany(),
    prisma.supportRequest.deleteMany(),
    prisma.couponRedemption.deleteMany(),
    prisma.orderStatusHistory.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.address.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.configOption.deleteMany(),
    prisma.configOptionGroup.deleteMany(),
    prisma.priceTier.deleteMany(),
    prisma.promotion.deleteMany(),
    prisma.productRelation.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.productSpec.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.session.deleteMany(),
    prisma.loginAttempt.deleteMany(),
    prisma.user.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.seasonalTheme.deleteMany(),
    prisma.searchSynonym.deleteMany(),
    prisma.searchQueryLog.deleteMany(),
    prisma.setting.deleteMany(),
  ])
}

async function seedPermissions(): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const key of PERMISSION_KEYS) {
    const definition = PERMISSIONS[key]
    const record = await prisma.permission.create({
      data: { key, name: definition.name, group: definition.group },
      select: { id: true },
    })
    ids.set(key, record.id)
  }
  console.log(`  ${ids.size} Berechtigungen`)
  return ids
}

async function seedRoles(permissionIds: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const role of DEFAULT_ROLES) {
    const record = await prisma.role.create({
      data: {
        key: role.key,
        name: role.name,
        description: role.description,
        system: role.system,
        permissions: {
          create: role.permissions
            .map((key) => permissionIds.get(key))
            .filter((id): id is string => Boolean(id))
            .map((permissionId) => ({ permissionId })),
        },
      },
      select: { id: true },
    })
    ids.set(role.key, record.id)
  }
  console.log(`  ${ids.size} Rollen`)
  return ids
}

async function seedUsers(roleIds: Map<string, string>) {
  // Ein bewusst langes Demopasswort. Es erfüllt die Mindestlänge der
  // Hash-Funktion und ist in der Ausgabe klar als Demozugang gekennzeichnet.
  const password = await hashPassword('RaeucherhakenDemo2024!')

  const users: Array<{ email: string; firstName: string; lastName: string; role: string }> = [
    { email: 'inhaber@raeucherhaken24.example', firstName: 'Katrin', lastName: 'Bohnsack', role: 'owner' },
    { email: 'verwaltung@raeucherhaken24.example', firstName: 'Jonas', lastName: 'Rethwisch', role: 'manager' },
    { email: 'lager@raeucherhaken24.example', firstName: 'Milan', lastName: 'Petrov', role: 'staff' },
    { email: 'service@raeucherhaken24.example', firstName: 'Ayse', lastName: 'Yildirim', role: 'support' },
  ]

  for (const user of users) {
    const roleId = roleIds.get(user.role)
    if (!roleId) continue
    await prisma.user.create({
      data: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        passwordHash: password,
        roleId,
      },
    })
  }
  console.log(`  ${users.length} Mitarbeiterkonten`)
}

async function seedCategories(): Promise<Map<string, string>> {
  const ids = new Map<string, string>()

  async function create(category: CategorySeed, parentId: string | null) {
    const record = await prisma.category.create({
      data: {
        slug: category.slug,
        name: category.name,
        teaser: category.teaser,
        description: category.description,
        icon: category.icon,
        sortOrder: category.sortOrder,
        metaTitle: category.metaTitle,
        metaDescription: category.metaDescription,
        parentId,
      },
      select: { id: true },
    })
    ids.set(category.slug, record.id)
    for (const child of category.children ?? []) {
      await create(child, record.id)
    }
  }

  for (const category of CATEGORIES) await create(category, null)
  console.log(`  ${ids.size} Kategorien`)
  return ids
}

interface CreatedProduct {
  id: string
  slug: string
  categorySlug: string
  group: keyof SeedCatalog
  name: string
  priceCents: number
  stock: number
}

async function seedProducts(categoryIds: Map<string, string>): Promise<CreatedProduct[]> {
  const catalog = loadJson<SeedCatalog>('catalog.json')
  const usedSlugs = new Set<string>()
  const created: CreatedProduct[] = []
  let counter = 0

  for (const [group, items] of Object.entries(catalog) as Array<[keyof SeedCatalog, SeedProduct[]]>) {
    const mapping = GROUP_TO_CATEGORY[group]
    const categoryId = categoryIds.get(mapping.slug)
    if (!categoryId) {
      console.warn(`  Kategorie ${mapping.slug} fehlt — Gruppe ${group} übersprungen`)
      continue
    }

    for (const item of items) {
      counter += 1
      const slug = uniqueSlug(item.name, usedSlugs)
      const sku = buildSku(mapping.prefix, counter, item.material, item.lengthMm ?? item.weightGrams)
      const artNr = articleNumber(mapping.prefix, counter)

      // Abbildung erzeugen — deterministisch anhand der SKU.
      const imageUrl = writeProductImage(
        pickArchetype(mapping.slug, item.name, item.subtitle, item.shortDescription),
        sku,
        slug,
      )

      const isConfigurable = group === 'haken' && counter <= 2
      const record = await prisma.product.create({
        data: {
          slug,
          sku,
          articleNumber: artNr,
          name: item.name,
          subtitle: item.subtitle ?? null,
          shortDescription: item.shortDescription,
          description: item.description,
          type: isConfigurable ? 'configurable' : group === 'sonder' ? 'custom' : 'simple',
          categoryId,
          priceCents: item.priceCents,
          baseUnit: item.baseUnit ?? null,
          baseUnitAmount: item.baseUnitAmount ?? null,
          baseUnitReference: baseUnitReference(item.baseUnit),
          weightGrams: item.weightGrams ?? null,
          shippingWeightGrams: item.shippingWeightGrams ?? (item.weightGrams ? item.weightGrams + 80 : null),
          packagingUnit: item.packagingUnit ?? 1,
          lengthMm: item.lengthMm ?? null,
          wireDiameterMm: item.wireDiameterTenthMm ?? null,
          loadCapacityGrams: item.loadCapacityGrams ?? null,
          material: item.material ?? null,
          usage: item.usage ?? null,
          tipFinish: item.tipFinish ?? null,
          deliveryDaysMin: item.deliveryDaysMin ?? 2,
          deliveryDaysMax: item.deliveryDaysMax ?? 4,
          stock: item.stock ?? randomInt(rand, 0, 180),
          lowStockThreshold: group === 'haken' || group === 'fleischerhaken' ? 20 : 8,
          allowBackorder: group === 'sonder',
          bestseller: item.bestseller ?? false,
          popularity: randomInt(rand, 0, 240),
          sortOrder: counter,
          metaTitle: truncate(`${item.name} kaufen`, 60),
          metaDescription: truncate(item.shortDescription, 155),
          images: {
            create: {
              url: imageUrl,
              alt: `${item.name} – technische Darstellung`,
              width: 800,
              height: 800,
              sortOrder: 0,
            },
          },
          specs: {
            create: (item.specs ?? []).map((spec, index) => ({
              key: spec.key,
              label: spec.label,
              value: spec.value,
              group: spec.group ?? 'Allgemein',
              sortOrder: index,
            })),
          },
        },
        select: { id: true, slug: true, name: true, priceCents: true, stock: true },
      })

      // Erstbestand als Journaleintrag, damit jeder Bestand herleitbar bleibt.
      if (record.stock > 0) {
        await prisma.inventoryMovement.create({
          data: {
            productId: record.id,
            delta: record.stock,
            stockAfter: record.stock,
            reason: 'seed',
            note: 'Ersteinrichtung',
          },
        })
      }

      created.push({
        id: record.id,
        slug: record.slug,
        categorySlug: mapping.slug,
        group,
        name: record.name,
        priceCents: record.priceCents,
        stock: record.stock,
      })
    }
  }

  console.log(`  ${created.length} Artikel mit Abbildungen`)
  return created
}

/** Legt den Konfigurator auf den ersten beiden Hakenmodellen an. */
async function seedConfigurator(products: CreatedProduct[]) {
  const configurable = products.filter((p) => p.group === 'haken').slice(0, 2)

  for (const product of configurable) {
    for (const [groupIndex, group] of HOOK_CONFIG_GROUPS.entries()) {
      await prisma.configOptionGroup.create({
        data: {
          productId: product.id,
          key: group.key,
          label: group.label,
          helpText: group.helpText ?? null,
          required: group.required,
          sortOrder: groupIndex * 10,
          options: {
            create: group.options.map((option, index) => ({
              key: option.key,
              label: option.label,
              description: option.description ?? null,
              priceDeltaCents: option.priceDeltaCents ?? 0,
              priceDeltaBp: option.priceDeltaBp ?? 0,
              weightDeltaGrams: option.weightDeltaGrams ?? 0,
              numericValue: option.numericValue ?? null,
              isDefault: option.isDefault ?? false,
              sortOrder: index * 10,
            })),
          },
        },
      })
    }

    for (const tier of HOOK_PRICE_TIERS) {
      await prisma.priceTier.create({
        data: { productId: product.id, minQty: tier.minQty, discountBp: tier.discountBp },
      })
    }
  }
  console.log(`  Konfigurator auf ${configurable.length} Modellen`)
}

/** Mengenstaffeln auf Haken sowie einige zeitlich begrenzte Aktionen. */
async function seedPromotionsAndTiers(products: CreatedProduct[]) {
  const hookProducts = products.filter(
    (p) => p.categorySlug === 'raeucherhaken' || p.categorySlug === 'fleischerhaken',
  )

  for (const product of hookProducts) {
    const existing = await prisma.priceTier.count({ where: { productId: product.id } })
    if (existing > 0) continue
    for (const tier of STANDARD_PRICE_TIERS) {
      await prisma.priceTier.create({
        data: { productId: product.id, minQty: tier.minQty, discountBp: tier.discountBp },
      })
    }
  }

  // Laufende Aktionen auf einer Auswahl von Artikeln.
  const promotable = products.filter((p) => p.stock > 10)
  const running = shuffle(promotable, rand).slice(0, 9)

  for (const [index, product] of running.entries()) {
    const discountBp = pick(rand, [1000, 1200, 1500, 2000])
    await prisma.promotion.create({
      data: {
        productId: product.id,
        name: index % 3 === 0 ? 'Wochenangebot' : index % 3 === 1 ? 'Saisonpreis' : 'Aktionspreis',
        discountBp,
        startsAt: daysAgo(randomInt(rand, 1, 6), NOW),
        endsAt: daysAhead(randomInt(rand, 4, 21), NOW),
        active: true,
      },
    })
  }

  // Eine bereits abgelaufene und eine noch nicht gestartete Aktion, damit
  // die Zeitsteuerung im Betrieb nachvollziehbar ist.
  const extra = shuffle(promotable, rand).slice(9, 11)
  if (extra[0]) {
    await prisma.promotion.create({
      data: {
        productId: extra[0].id,
        name: 'Abgelaufene Aktion',
        discountBp: 2500,
        startsAt: daysAgo(40, NOW),
        endsAt: daysAgo(12, NOW),
        active: true,
      },
    })
  }
  if (extra[1]) {
    await prisma.promotion.create({
      data: {
        productId: extra[1].id,
        name: 'Kommende Aktion',
        discountBp: 1500,
        startsAt: daysAhead(10, NOW),
        endsAt: daysAhead(24, NOW),
        active: true,
      },
    })
  }

  console.log(`  ${running.length} laufende Aktionen, Mengenstaffeln auf ${hookProducts.length} Haken`)
}

/** Cross-Selling: Haken mit Mehl, Lauge und passenden Gewürzen verknüpfen. */
async function seedRelations(products: CreatedProduct[]) {
  const byGroup = (group: keyof SeedCatalog) => products.filter((p) => p.group === group)
  const hooks = [...byGroup('haken'), ...byGroup('fleischerhaken')]
  const meals = byGroup('raeuchermehl')
  const brines = byGroup('laugen')
  const spices = [...byGroup('gewuerze-1'), ...byGroup('gewuerze-2'), ...byGroup('gewuerze-4')]

  let count = 0
  for (const hook of hooks) {
    const targets = [
      ...shuffle(meals, rand).slice(0, 1),
      ...shuffle(brines, rand).slice(0, 1),
      ...shuffle(spices, rand).slice(0, 2),
    ]
    for (const [index, target] of targets.entries()) {
      if (target.id === hook.id) continue
      await prisma.productRelation.create({
        data: { sourceId: hook.id, targetId: target.id, kind: 'cross-sell', sortOrder: index },
      })
      count += 1
    }
  }

  // Laugen verweisen auf passende Gewürze und umgekehrt.
  for (const brine of brines) {
    const targets = shuffle(spices, rand).slice(0, 3)
    for (const [index, target] of targets.entries()) {
      await prisma.productRelation.create({
        data: { sourceId: brine.id, targetId: target.id, kind: 'related', sortOrder: index },
      })
      count += 1
    }
  }

  console.log(`  ${count} Produktverknüpfungen`)
}

async function seedCoupons() {
  for (const coupon of COUPONS) {
    await prisma.coupon.create({
      data: {
        code: coupon.code,
        description: coupon.description,
        type: coupon.type,
        value: coupon.value,
        minOrderValueCents: coupon.minOrderValueCents ?? 0,
        maxDiscountCents: coupon.maxDiscountCents ?? 0,
        usageLimit: coupon.usageLimit ?? 0,
        // Der Demo-Gutschein "AUSGESCHOEPFT" startet bereits am Limit.
        usageCount: coupon.code === 'AUSGESCHOEPFT' ? (coupon.usageLimit ?? 1) : 0,
        perCustomerLimit: coupon.perCustomerLimit ?? 0,
        startsAt: coupon.startsInDays !== undefined && coupon.startsInDays !== null
          ? daysAhead(coupon.startsInDays, NOW)
          : null,
        endsAt: coupon.endsInDays !== undefined && coupon.endsInDays !== null
          ? daysAhead(coupon.endsInDays, NOW)
          : null,
        active: coupon.active ?? true,
      },
    })
  }
  console.log(`  ${COUPONS.length} Gutscheine`)
}

async function seedSeasonalThemes() {
  for (const theme of SEASONAL_THEME_SEEDS) {
    await prisma.seasonalTheme.create({
      data: {
        key: theme.key,
        name: seasonalThemeName(theme.key),
        description: theme.description,
        bannerText: theme.bannerText,
        bannerLink: theme.bannerLink,
        active: theme.key === 'normal',
        sortOrder: theme.sortOrder,
      },
    })
  }
  await prisma.setting.createMany({
    data: [
      { key: 'shop:seasonal_theme', value: 'normal' },
      { key: 'shop:banner_active', value: 'false' },
      { key: 'shop:banner_text', value: '' },
      { key: 'shop:banner_link', value: '' },
    ],
  })
  console.log(`  ${SEASONAL_THEME_SEEDS.length} Saisonmodi`)
}

async function seedSynonyms() {
  await prisma.searchSynonym.createMany({ data: SEARCH_SYNONYMS })
  console.log(`  ${SEARCH_SYNONYMS.length} Suchsynonyme`)
}

async function seedRecipes(products: CreatedProduct[]): Promise<string[]> {
  const recipes = loadJson<SeedRecipe[]>('recipes.json')
  const usedSlugs = new Set<string>()
  const slugs: string[] = []

  // Verweise auf echte Artikel: Haken, Mehl und Lauge passend zur Methode.
  const hooks = products.filter((p) => p.group === 'haken')
  const meals = products.filter((p) => p.group === 'raeuchermehl')
  const brines = products.filter((p) => p.group === 'laugen')

  for (const [index, recipe] of recipes.entries()) {
    const slug = uniqueSlug(recipe.title, usedSlugs)
    slugs.push(slug)

    const imageUrl = writeProductImage(
      recipe.foodType === 'fisch' ? 'hook-s' : recipe.foodType === 'wurst' ? 'hook-four' : 'hook-heavy',
      `rezept-${slug}`,
      `rezept-${slug}`,
    )

    // Passende Artikel: bevorzugt die Holzart aus dem Rezept.
    const matchingMeal =
      meals.find((m) => m.name.toLowerCase().includes(recipe.woodType.toLowerCase())) ?? meals[index % meals.length]
    const matchingBrine = brines[index % brines.length]
    const matchingHook = hooks[index % hooks.length]

    const productLinks = [matchingHook, matchingMeal, matchingBrine]
      .filter((p): p is CreatedProduct => Boolean(p))
      .map((p, order) => ({ productSlug: p.slug, sortOrder: order }))

    await prisma.recipe.create({
      data: {
        slug,
        title: recipe.title,
        teaser: recipe.teaser,
        intro: recipe.intro,
        imageUrl,
        imageAlt: `${recipe.title} – Darstellung`,
        method: recipe.method,
        foodType: recipe.foodType,
        flavor: recipe.flavor,
        woodType: recipe.woodType,
        difficulty: recipe.difficulty,
        prepMinutes: recipe.prepMinutes ?? 30,
        brineHours: recipe.brineHours ?? 0,
        smokeMinutes: recipe.smokeMinutes ?? 120,
        servings: recipe.servings ?? 4,
        source: 'editorial',
        published: true,
        metaTitle: truncate(recipe.title, 60),
        metaDescription: truncate(recipe.teaser, 155),
        ingredients: {
          create: recipe.ingredients.map((ingredient, i) => ({
            label: ingredient.label,
            amount: ingredient.amount ?? null,
            group: ingredient.group ?? 'Zutaten',
            sortOrder: i,
          })),
        },
        steps: {
          create: recipe.steps.map((step, i) => ({
            position: i + 1,
            title: step.title,
            body: step.body,
            durationMinutes: step.durationMinutes ?? null,
          })),
        },
        products: { create: productLinks },
      },
    })
  }

  console.log(`  ${recipes.length} Rezepte`)
  return slugs
}

/** Wissensartikel liegen als Setting, weil sie reiner Redaktionsinhalt sind. */
async function seedArticles() {
  const articles = loadJson<SeedArticle[]>('articles.json')
  for (const article of articles) {
    await prisma.setting.create({
      data: {
        key: `article:${slugify(article.slug)}`,
        value: JSON.stringify(article),
      },
    })
  }
  console.log(`  ${articles.length} Wissensartikel`)
}

const DEMO_CUSTOMERS = [
  { firstName: 'Hendrik', lastName: 'Möller', company: 'Räucherei Möller e. K.', city: 'Kappeln', postalCode: '24376' },
  { firstName: 'Silke', lastName: 'Ahrends', company: null, city: 'Oldenburg', postalCode: '26123' },
  { firstName: 'Bernd', lastName: 'Kruse', company: 'Fleischerei Kruse GmbH', city: 'Verden', postalCode: '27283' },
  { firstName: 'Theresa', lastName: 'Lindner', company: null, city: 'Bamberg', postalCode: '96047' },
  { firstName: 'Ottmar', lastName: 'Sauer', company: 'Landmetzgerei Sauer', city: 'Villingen', postalCode: '78050' },
  { firstName: 'Jana', lastName: 'Wollenberg', company: null, city: 'Rostock', postalCode: '18055' },
  { firstName: 'Frank', lastName: 'Deistler', company: 'Hofladen Deistler', city: 'Cottbus', postalCode: '03046' },
  { firstName: 'Marit', lastName: 'Jansen', company: null, city: 'Emden', postalCode: '26721' },
] as const

const STREETS = ['Am Hafen 12', 'Lange Reihe 4', 'Mühlenweg 27', 'Zum Bruch 9', 'Feldstraße 66', 'Alter Kirchweg 3']

/** Beispielbestellungen über die letzten 60 Tage — Grundlage für das Dashboard. */
async function seedDemoOrders(products: CreatedProduct[]) {
  const sellable = products.filter((p) => p.stock > 5)
  if (sellable.length === 0) return

  let orderCounter = 10_000
  let customerCounter = 1_000
  const customerIds: string[] = []

  for (const customer of DEMO_CUSTOMERS) {
    customerCounter += 1
    const record = await prisma.customer.create({
      data: {
        customerNumber: `K-${YEAR}-${customerCounter}`,
        email: `${slugify(`${customer.firstName}.${customer.lastName}`)}@example.com`,
        firstName: customer.firstName,
        lastName: customer.lastName,
        company: customer.company,
        phone: `+49 ${randomInt(rand, 300, 999)} ${randomInt(rand, 100000, 999999)}`,
        tags: customer.company ? 'gewerblich' : 'privat',
        notes: customer.company
          ? 'Bestellt regelmäßig größere Mengen. Rechnungskauf wurde angefragt.'
          : null,
        addresses: {
          create: {
            kind: 'shipping',
            firstName: customer.firstName,
            lastName: customer.lastName,
            company: customer.company,
            street: pick(rand, STREETS),
            postalCode: customer.postalCode,
            city: customer.city,
            isDefault: true,
          },
        },
      },
      select: { id: true },
    })
    customerIds.push(record.id)
  }

  const statuses: Array<{ status: string; payment: string; weight: number }> = [
    { status: 'delivered', payment: 'paid', weight: 5 },
    { status: 'shipped', payment: 'paid', weight: 3 },
    { status: 'packed', payment: 'paid', weight: 2 },
    { status: 'picking', payment: 'paid', weight: 2 },
    { status: 'confirmed', payment: 'pending', weight: 2 },
    { status: 'new', payment: 'pending', weight: 3 },
    { status: 'cancelled', payment: 'refunded', weight: 1 },
  ]
  const weighted = statuses.flatMap((s) => Array.from({ length: s.weight }, () => s))

  let created = 0
  for (let day = 59; day >= 0; day -= 1) {
    // Mehr Bestellungen an Werktagen, an manchen Tagen keine.
    const date = daysAgo(day, NOW)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const orderCount = isWeekend ? randomInt(rand, 0, 2) : randomInt(rand, 0, 4)

    for (let i = 0; i < orderCount; i += 1) {
      orderCounter += 1
      const customerIndex = randomInt(rand, 0, DEMO_CUSTOMERS.length - 1)
      const customer = DEMO_CUSTOMERS[customerIndex]
      const state = pick(rand, weighted)
      const itemCount = randomInt(rand, 1, 4)
      const chosen = shuffle(sellable, rand).slice(0, itemCount)

      const items = chosen.map((product) => {
        const quantity = randomInt(rand, 1, 4)
        return {
          productId: product.id,
          name: product.name,
          quantity,
          unitPriceCents: product.priceCents,
          lineTotalCents: product.priceCents * quantity,
        }
      })

      const subtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0)
      const shipping = subtotal >= 7_900 ? 0 : 495
      const total = subtotal + shipping
      const tax = Math.round((total * 1900) / 11_900)
      const createdAt = new Date(date.getTime() + randomInt(rand, 8, 20) * 60 * 60 * 1000)

      const productRows = await prisma.product.findMany({
        where: { id: { in: chosen.map((c) => c.id) } },
        select: { id: true, sku: true, articleNumber: true },
      })
      const meta = new Map(productRows.map((row) => [row.id, row]))

      await prisma.order.create({
        data: {
          orderNumber: `RH-${YEAR}-${orderCounter}`,
          customerId: customerIds[customerIndex],
          email: `${slugify(`${customer.firstName}.${customer.lastName}`)}@example.com`,
          firstName: customer.firstName,
          lastName: customer.lastName,
          company: customer.company,
          street: pick(rand, STREETS),
          postalCode: customer.postalCode,
          city: customer.city,
          subtotalCents: subtotal,
          shippingCents: shipping,
          totalCents: total,
          taxCents: tax,
          status: state.status,
          paymentStatus: state.payment,
          refundedCents: state.status === 'cancelled' ? total : 0,
          cancelledAt: state.status === 'cancelled' ? createdAt : null,
          shippedAt: ['shipped', 'delivered'].includes(state.status) ? createdAt : null,
          deliveredAt: state.status === 'delivered' ? createdAt : null,
          trackingNumber: ['shipped', 'delivered'].includes(state.status)
            ? `00340434${randomInt(rand, 100000000, 999999999)}`
            : null,
          carrier: ['shipped', 'delivered'].includes(state.status) ? 'dhl' : null,
          createdAt,
          updatedAt: createdAt,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              name: item.name,
              sku: meta.get(item.productId)?.sku ?? 'UNBEKANNT',
              articleNumber: meta.get(item.productId)?.articleNumber ?? 'UNBEKANNT',
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              listPriceCents: item.unitPriceCents,
              lineTotalCents: item.lineTotalCents,
              restockedQty: state.status === 'cancelled' ? item.quantity : 0,
            })),
          },
          statusHistory: {
            create: { field: 'status', toValue: state.status, note: 'Demodaten', createdAt },
          },
        },
      })
      created += 1
    }
  }

  // Kundenkennzahlen aus den tatsächlich angelegten Bestellungen ableiten.
  for (const customerId of customerIds) {
    const aggregate = await prisma.order.aggregate({
      where: { customerId, status: { not: 'cancelled' } },
      _sum: { totalCents: true },
      _count: { _all: true },
    })
    const last = await prisma.order.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        orderCount: aggregate._count._all,
        totalSpentCents: aggregate._sum.totalCents ?? 0,
        lastOrderAt: last?.createdAt ?? null,
      },
    })
  }

  console.log(`  ${created} Beispielbestellungen`)
}

async function seedSupportAndProjects() {
  const requests = [
    {
      name: 'Hendrik Möller',
      email: 'hendrik.moeller@example.com',
      company: 'Räucherei Möller e. K.',
      topic: 'product',
      subject: 'Belastbarkeit der Hakenleiste bei ganzen Seiten',
      message:
        'Wir hängen regelmäßig Lachsseiten mit gut vier Kilogramm auf. Reicht die Hakenleiste dafür aus, wenn alle fünf Positionen belegt sind, oder sollten wir auf Einzelhaken ausweichen?',
      status: 'new',
      priority: 'normal',
    },
    {
      name: 'Silke Ahrends',
      email: 'silke.ahrends@example.com',
      company: null,
      topic: 'order',
      subject: 'Lieferung noch nicht angekommen',
      message:
        'Meine Bestellung ist laut Sendungsverfolgung seit vier Tagen unterwegs, aber noch nicht angekommen. Können Sie nachsehen, wo die Sendung steht?',
      status: 'in_progress',
      priority: 'high',
    },
    {
      name: 'Bernd Kruse',
      email: 'bernd.kruse@example.com',
      company: 'Fleischerei Kruse GmbH',
      topic: 'general',
      subject: 'Rechnungskauf für Gewerbekunden',
      message:
        'Wir bestellen etwa monatlich und würden gerne auf Rechnung kaufen. Welche Unterlagen brauchen Sie dafür von uns?',
      status: 'waiting',
      priority: 'normal',
    },
    {
      name: 'Theresa Lindner',
      email: 'theresa.lindner@example.com',
      company: null,
      topic: 'product',
      subject: 'V2A oder V4A für Kaltrauch im Freien',
      message:
        'Mein Räucherschrank steht im Garten unter einem Vordach. Reicht V2A oder sollte ich gleich V4A nehmen? Ich räuchere hauptsächlich kalt und arbeite mit Lake.',
      status: 'resolved',
      priority: 'low',
    },
    {
      name: 'Ottmar Sauer',
      email: 'ottmar.sauer@example.com',
      company: 'Landmetzgerei Sauer',
      topic: 'complaint',
      subject: 'Gebogene Spitze bei zwei Haken',
      message:
        'Bei zwei Haken aus der letzten Lieferung ist die Spitze leicht verbogen angekommen. Vermutlich ein Transportschaden. Wie gehen wir vor?',
      status: 'new',
      priority: 'high',
    },
  ]

  let ticket = 1_000
  for (const request of requests) {
    ticket += 1
    await prisma.supportRequest.create({
      data: {
        ticketNumber: `S-${YEAR}-${ticket}`,
        name: request.name,
        email: request.email,
        company: request.company,
        topic: request.topic,
        subject: request.subject,
        message: request.message,
        status: request.status,
        priority: request.priority,
        createdAt: daysAgo(randomInt(rand, 0, 20), NOW),
      },
    })
  }

  const projects = [
    {
      projectName: 'Aalhaken für Räucherei Möller',
      contactName: 'Hendrik Möller',
      company: 'Räucherei Möller e. K.',
      email: 'hendrik.moeller@example.com',
      foodType: 'Aal',
      purpose: 'Kalträuchern im Altonaer Ofen',
      goalDescription:
        'Unsere jetzigen Haken biegen sich bei ganzen Aalen über 1,2 kg auf, und die Spitze reißt beim Umhängen aus dem Nackenfleisch. Wir brauchen etwas Stabileres, das trotzdem noch sauber durch die Kiemen passt und nicht zu dick aufträgt.',
      totalLengthMm: 280,
      wireDiameterTenthMm: 40,
      prongCount: 1,
      openingWidthMm: 26,
      material: 'V4A',
      quantity: 250,
      status: 'in_review',
    },
    {
      projectName: 'Aufhängeschiene Kühlraum',
      contactName: 'Bernd Kruse',
      company: 'Fleischerei Kruse GmbH',
      email: 'bernd.kruse@example.com',
      foodType: 'Rohschinken',
      purpose: 'Reifung im Kühlraum, Dauerbelegung',
      goalDescription:
        'Wir möchten die vorhandene Rohrbahn besser ausnutzen. Gesucht ist eine Schiene mit acht Positionen, die sich in die Bahn einhängen lässt und je Position rund zehn Kilogramm trägt.',
      totalLengthMm: 900,
      wireDiameterTenthMm: 80,
      prongCount: 8,
      material: 'V4A',
      quantity: 40,
      status: 'quoted',
    },
    {
      projectName: 'Musterset Wurstaufhängung',
      contactName: 'Frank Deistler',
      company: 'Hofladen Deistler',
      email: 'frank.deistler@example.com',
      foodType: 'Rohwurst',
      purpose: 'Erprobung verschiedener Zinkenabstände',
      goalDescription:
        'Wir arbeiten mit unterschiedlichen Kalibern und wissen noch nicht, welcher Zinkenabstand für uns richtig ist. Wir bräuchten ein Musterset mit drei Varianten zum Ausprobieren.',
      material: 'V2A',
      quantity: 3,
      status: 'new',
    },
  ]

  let projectNumber = 100
  for (const project of projects) {
    projectNumber += 1
    await prisma.customProject.create({
      data: {
        projectNumber: `P-${YEAR}-${projectNumber}`,
        projectName: project.projectName,
        contactName: project.contactName,
        company: project.company,
        email: project.email,
        foodType: project.foodType,
        purpose: project.purpose,
        goalDescription: project.goalDescription,
        totalLengthMm: project.totalLengthMm ?? null,
        wireDiameterTenthMm: project.wireDiameterTenthMm ?? null,
        prongCount: project.prongCount ?? null,
        openingWidthMm: project.openingWidthMm ?? null,
        material: project.material,
        quantity: project.quantity,
        specConfirmed: true,
        status: project.status,
        createdAt: daysAgo(randomInt(rand, 1, 30), NOW),
      },
    })
  }

  console.log(`  ${requests.length} Supportanfragen, ${projects.length} Sonderanfertigungen`)
}

/** Bewertungen, damit die Sortierung nach Bewertung echte Daten hat. */
async function seedRecipeRatings(slugs: string[]) {
  let total = 0
  for (const slug of slugs) {
    const count = randomInt(rand, 0, 18)
    if (count === 0) continue

    let sum = 0
    const data: Prisma.RecipeRatingCreateManyInput[] = []
    const recipe = await prisma.recipe.findUnique({ where: { slug }, select: { id: true } })
    if (!recipe) continue

    for (let i = 0; i < count; i += 1) {
      // Bewertungen liegen realistisch im oberen Bereich, nicht gleichverteilt.
      const stars = pick(rand, [3, 4, 4, 4, 5, 5, 5, 5])
      sum += stars
      data.push({ recipeId: recipe.id, voterKey: `seed-${slug}-${i}`, stars })
    }

    await prisma.recipeRating.createMany({ data })
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { ratingSum: sum, ratingCount: count },
    })
    total += count
  }
  console.log(`  ${total} Rezeptbewertungen`)
}


/**
 * Setzt die Nummernkreise auf den höchsten tatsächlich vergebenen Wert.
 *
 * Ohne diesen Schritt würde die erste echte Bestellung nach dem Seed eine
 * Nummer ziehen, die eine Demobestellung bereits belegt — der eindeutige
 * Index schlägt dann zu, und die Bestellung scheitert.
 *
 * Die Ableitung erfolgt bewusst aus den vorhandenen Datensätzen statt aus
 * mitgezählten Variablen: So heilt der Zähler auch dann, wenn Daten aus einem
 * Altsystem importiert wurden.
 */
async function syncCounters() {
  const numbers: Array<{ key: string; values: string[]; fallback: number }> = [
    {
      key: 'counter:order',
      values: (await prisma.order.findMany({ select: { orderNumber: true } })).map((o) => o.orderNumber),
      fallback: 10_000,
    },
    {
      key: 'counter:customer',
      values: (await prisma.customer.findMany({ select: { customerNumber: true } })).map(
        (c) => c.customerNumber,
      ),
      fallback: 1_000,
    },
    {
      key: 'counter:ticket',
      values: (await prisma.supportRequest.findMany({ select: { ticketNumber: true } })).map(
        (r) => r.ticketNumber,
      ),
      fallback: 1_000,
    },
    {
      key: 'counter:project',
      values: (await prisma.customProject.findMany({ select: { projectNumber: true } })).map(
        (p) => p.projectNumber,
      ),
      fallback: 100,
    },
  ]

  for (const entry of numbers) {
    // Nummernformat: PREFIX-JAHR-LAUFNUMMER
    const highest = entry.values.reduce((max, value) => {
      const parsed = Number.parseInt(value.split('-').pop() ?? '', 10)
      return Number.isFinite(parsed) && parsed > max ? parsed : max
    }, entry.fallback)

    await prisma.setting.upsert({
      where: { key: entry.key },
      create: { key: entry.key, value: String(highest) },
      update: { value: String(highest) },
    })
  }
  console.log('  Nummernkreise auf den höchsten vergebenen Wert gesetzt')
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

main()
  .catch((error) => {
    console.error('Seed fehlgeschlagen:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
