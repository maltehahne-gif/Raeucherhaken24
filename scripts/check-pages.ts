/**
 * Prüft alle Seiten des Shops gegen den laufenden Entwicklungsserver.
 *
 * Sinn: Ein Tippfehler in einer Prisma-Abfrage fällt beim Typcheck nicht auf,
 * wohl aber hier. Das Skript meldet jeden Status ausser 200 und jede Weiterleitung,
 * die nicht erwartet wird.
 *
 * Aufruf: npx tsx scripts/check-pages.ts [basis-url]
 */
const BASE = process.argv[2] ?? 'http://localhost:3100'

const jar = new Map<string, string>()
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')

function absorb(res: Response) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const idx = pair.indexOf('=')
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim())
  }
}

async function get(path: string) {
  const res = await fetch(BASE + path, {
    headers: { Cookie: cookieHeader() },
    redirect: 'manual',
  })
  absorb(res)
  return res
}

const PUBLIC_PAGES = [
  '/',
  '/kategorie',
  '/kategorie/raeucherhaken',
  '/kategorie/fleischerhaken',
  '/kategorie/raeuchermehl',
  '/kategorie/raeucherlaugen',
  '/kategorie/naturgewuerze',
  '/kategorie/naturgewuerze?material=Naturprodukt&sort=preis-asc&seite=2',
  '/kategorie/sonderanfertigungen',
  '/suche?q=raeucherhaken',
  '/suche?q=xyzunfug',
  '/vergleich',
  '/konfigurator',
  '/beratung',
  '/sonderanfertigung',
  '/rezepte',
  '/wissen',
  '/kontakt',
  '/warenkorb',
  '/kasse',
  '/versand',
  '/zahlung',
  '/impressum',
  '/datenschutz',
  '/agb',
  '/widerruf',
  '/sitemap.xml',
  '/robots.txt',
]

const ADMIN_PAGES = [
  '/admin',
  '/admin/bestellungen',
  '/admin/produkte',
  '/admin/produkte/neu',
  '/admin/lager',
  '/admin/lager/bewegungen',
  '/admin/kunden',
  '/admin/gutscheine',
  '/admin/gutscheine/neu',
  '/admin/support',
  '/admin/projekte',
  '/admin/mitarbeiter',
  '/admin/mitarbeiter/rollen',
  '/admin/saison',
  '/admin/protokoll',
]

async function main() {
  let failures = 0
  const skipped: string[] = []

  console.log('\nÖffentliche Seiten')
  for (const path of PUBLIC_PAGES) {
    const res = await get(path)
    const ok = res.status === 200
    if (!ok) failures += 1
    console.log(`  ${ok ? 'OK  ' : 'FEHL'} ${res.status}  ${path}`)
  }

  // Dynamische Detailseiten anhand echter Daten prüfen.
  console.log('\nDetailseiten')
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()
  const [product, recipe, order, project, article] = await Promise.all([
    prisma.product.findFirst({ where: { active: true, visible: true }, select: { slug: true } }),
    prisma.recipe.findFirst({ where: { published: true }, select: { slug: true } }),
    prisma.order.findFirst({ select: { orderNumber: true, id: true } }),
    prisma.customProject.findFirst({ select: { projectNumber: true, id: true } }),
    prisma.setting.findFirst({ where: { key: { startsWith: 'article:' } }, select: { key: true } }),
  ])
  const customer = await prisma.customer.findFirst({ select: { id: true } })
  const dbProduct = await prisma.product.findFirst({ select: { id: true } })
  const coupon = await prisma.coupon.findFirst({ select: { id: true } })
  const support = await prisma.supportRequest.findFirst({ select: { id: true } })
  const user = await prisma.user.findFirst({ select: { id: true } })

  const detailPages = [
    product && `/produkt/${product.slug}`,
    recipe && `/rezepte/${recipe.slug}`,
    article && `/wissen/${article.key.replace('article:', '')}`,
    order && `/bestellung/${order.orderNumber}`,
    project && `/sonderanfertigung/${project.projectNumber}`,
  ].filter((p): p is string => Boolean(p))

  for (const path of detailPages) {
    const res = await get(path)
    const ok = res.status === 200
    if (!ok) failures += 1
    console.log(`  ${ok ? 'OK  ' : 'FEHL'} ${res.status}  ${path}`)
  }

  // Anmeldung für den Verwaltungsbereich
  console.log('\nVerwaltungsbereich')
  await get('/admin/anmelden')
  const login = await fetch(`${BASE}/api/admin/auth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: BASE,
      Cookie: cookieHeader(),
      'x-csrf-token': jar.get('rh24_csrf') ?? '',
    },
    body: JSON.stringify({
      email: 'inhaber@raeucherhaken24.example',
      password: 'RaeucherhakenDemo2024!',
    }),
  })
  absorb(login)
  if (!login.ok) {
    console.log('  Anmeldung fehlgeschlagen — Verwaltungsseiten werden übersprungen.')
    console.log('  (Wurde der Seed ausgeführt? npm run db:seed)')
    skipped.push('Verwaltungsbereich')
  } else {
    const adminDetails = [
      order && `/admin/bestellungen/${order.orderNumber}`,
      dbProduct && `/admin/produkte/${dbProduct.id}`,
      customer && `/admin/kunden/${customer.id}`,
      coupon && `/admin/gutscheine/${coupon.id}`,
      support && `/admin/support/${support.id}`,
      project && `/admin/projekte/${project.id}`,
      user && `/admin/mitarbeiter/${user.id}`,
    ].filter((p): p is string => Boolean(p))

    for (const path of [...ADMIN_PAGES, ...adminDetails]) {
      const res = await get(path)
      const ok = res.status === 200
      if (!ok) failures += 1
      console.log(`  ${ok ? 'OK  ' : 'FEHL'} ${res.status}  ${path}`)
    }
  }

  await prisma.$disconnect()

  console.log(
    `\n${failures === 0 ? 'Alle geprüften Seiten antworten mit 200.' : `${failures} Seite(n) mit Fehler.`}`,
  )
  if (skipped.length > 0) console.log(`Übersprungen: ${skipped.join(', ')}`)
  process.exitCode = failures === 0 ? 0 : 1
}

void main()
