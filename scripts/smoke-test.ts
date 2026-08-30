import { PrismaClient } from '@prisma/client'

const B = 'http://localhost:3100'
const prisma = new PrismaClient()

/** Sammelt Cookies aus Set-Cookie-Headern und schickt sie bei Folgeaufrufen mit. */
const jar = new Map<string, string>()
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}
function absorb(res: Response) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const idx = pair.indexOf('=')
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim())
  }
}
/**
 * Antwort als JSON lesen, ohne am Fehlerfall zu zerbrechen.
 *
 * Der Entwicklungsserver von Next liefert bei einem Fehler eine HTML-Seite
 * statt JSON. `res.json()` wuerfe dort eine Ausnahme und der Prueflauf braeche
 * mitten im Ablauf ab — statt die betroffene Pruefung als fehlgeschlagen zu
 * melden und weiterzulaufen.
 */
interface CartPayload {
  itemCount?: number
  error?: string
  pricing?: {
    subtotalCents?: number
    discountCents?: number
    totalCents?: number
  }
}

interface OrderPayload {
  orderNumber?: string
  error?: string
}

async function body<T extends object>(res: Response): Promise<T> {
  try {
    const value: unknown = await res.json()
    return typeof value === 'object' && value !== null ? (value as T) : ({} as T)
  } catch {
    return {} as T
  }
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(B + path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Origin: B,
      Cookie: cookieHeader(),
      ...(jar.has('rh24_csrf') ? { 'x-csrf-token': jar.get('rh24_csrf')! } : {}),
    },
  })
  absorb(res)
  return res
}

async function main() {
  let fails = 0
  const check = (name: string, ok: boolean, detail = '') => {
    console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`)
    if (!ok) fails += 1
  }

  // Startseite laden -> CSRF-Cookie aus der Middleware
  absorb(await fetch(B + '/'))
  check('CSRF-Cookie wird gesetzt', jar.has('rh24_csrf'))

  // Bewusst ein Artikel ohne Konfigurator: Der Ablauf soll den Regelfall pruefen.
  const product = await prisma.product.findFirstOrThrow({
    where: { optionGroups: { none: {} }, stock: { gt: 50 }, active: true, visible: true, allowBackorder: false },
    orderBy: { priceCents: 'desc' },
    select: { id: true, name: true, slug: true, priceCents: true, stock: true },
  })
  console.log(`  Testartikel: ${product.name} (${product.slug}), Bestand ${product.stock}\n`)

  // Ein konfigurierbarer Artikel ohne Auswahl muss abgelehnt werden.
  const configurable = await prisma.product.findFirst({
    where: { optionGroups: { some: {} } },
    select: { id: true },
  })
  if (configurable) {
    const noConfig = await call('/api/cart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: configurable.id, quantity: 1 }),
    })
    check('Konfigurierbarer Artikel ohne Auswahl abgelehnt', noConfig.status === 400, `Status ${noConfig.status}`)

    const badOption = await call('/api/cart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        productId: configurable.id,
        quantity: 1,
        configuration: { material: 'gold-massiv' },
      }),
    })
    check('Erfundene Konfigurator-Option abgelehnt', badOption.status === 400, `Status ${badOption.status}`)
  }

  // --- Warenkorb ---
  let res = await call('/api/cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId: product.id, quantity: 3 }),
  })
  let cart = await body<CartPayload>(res)
  check('Artikel in den Warenkorb', res.ok && cart.itemCount === 3, `Summe ${cart.pricing?.subtotalCents}`)
  check(
    'Zwischensumme serverseitig korrekt',
    cart.pricing?.subtotalCents === product.priceCents * 3,
    `${cart.pricing?.subtotalCents} statt ${product.priceCents * 3}`,
  )

  // CSRF fehlt -> muss abgelehnt werden
  const noCsrf = await fetch(B + '/api/cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: B, Cookie: cookieHeader() },
    body: JSON.stringify({ productId: product.id, quantity: 1 }),
  })
  check('Ohne CSRF-Header abgelehnt', noCsrf.status === 403, `Status ${noCsrf.status}`)

  // Fremder Origin -> muss abgelehnt werden
  const badOrigin = await fetch(B + '/api/cart', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: 'https://angreifer.example',
      Cookie: cookieHeader(),
      'x-csrf-token': jar.get('rh24_csrf')!,
    },
    body: JSON.stringify({ productId: product.id, quantity: 1 }),
  })
  check('Fremder Origin abgelehnt', badOrigin.status === 403, `Status ${badOrigin.status}`)

  // Menge über Bestand -> muss abgelehnt werden
  const tooMany = await call('/api/cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId: product.id, quantity: product.stock + 500 }),
  })
  check('Menge über Bestand abgelehnt', tooMany.status === 409, `Status ${tooMany.status}`)

  // --- Gutschein ---
  res = await call('/api/cart/coupon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'RAUCHSTART10' }),
  })
  cart = await body<CartPayload>(res)
  const expectedDiscount = Math.round((product.priceCents * 3 * 1000) / 10000)
  check(
    'Gutschein RAUCHSTART10 wirkt',
    res.ok && cart.pricing?.discountCents === expectedDiscount,
    `Rabatt ${cart.pricing?.discountCents} erwartet ${expectedDiscount}`,
  )

  const expired = await call('/api/cart/coupon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'ABGELAUFEN' }),
  })
  check('Abgelaufener Gutschein abgelehnt', expired.status === 422, `Status ${expired.status}`)

  const exhausted = await call('/api/cart/coupon', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'AUSGESCHOEPFT' }),
  })
  check('Ausgeschöpfter Gutschein abgelehnt', exhausted.status === 422, `Status ${exhausted.status}`)

  // --- Checkout ---
  /*
   * Jeder Lauf bestellt unter einer eigenen Adresse.
   *
   * Der Gutschein RAUCHSTART10 ist auf eine Einloesung je Kunde begrenzt. Mit
   * einer festen Adresse liefe der Prueflauf genau einmal durch und schluege
   * danach an einer Regel fehl, die richtig arbeitet. Am Ende raeumt der Lauf
   * seine Spuren wieder ab (siehe unten).
   */
  const runId = `${Date.now().toString(36)}`
  const testEmail = `ablauf.test+${runId}@example.com`
  const idem = `co_test_${runId}`
  const payload = {
    firstName: 'Testkunde',
    lastName: 'Ablauf',
    email: testEmail,
    street: 'Räucherweg 1',
    postalCode: '24376',
    city: 'Kappeln',
    terms: true,
    privacy: true,
    website: '',
    idempotencyKey: idem,
  }

  const couponUsageBefore = (
    await prisma.coupon.findUniqueOrThrow({ where: { code: 'RAUCHSTART10' } })
  ).usageCount

  const stockBefore = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    select: { stock: true },
  })

  res = await call('/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const order = await body<OrderPayload>(res)
  check('Bestellung angelegt', res.ok && Boolean(order.orderNumber), order.orderNumber ?? order.error)

  const dbOrder = order.orderNumber
    ? await prisma.order.findUnique({ where: { orderNumber: order.orderNumber }, include: { items: true } })
    : null
  check(
    'Bestellsumme entspricht Serverberechnung',
    dbOrder?.totalCents === cart.pricing?.totalCents,
    `${dbOrder?.totalCents} statt ${cart.pricing?.totalCents}`,
  )
  check('Gutschein in Bestellung übernommen', dbOrder?.couponCode === 'RAUCHSTART10')
  check(
    'Rabatt in Bestellung übernommen',
    dbOrder?.discountCents === expectedDiscount,
    `${dbOrder?.discountCents}`,
  )

  const stockAfter = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    select: { stock: true },
  })
  check(
    'Bestand um 3 reduziert',
    stockAfter.stock === stockBefore.stock - 3,
    `${stockBefore.stock} -> ${stockAfter.stock}`,
  )

  const movement = order.orderNumber
    ? await prisma.inventoryMovement.findFirst({ where: { reference: order.orderNumber } })
    : null
  check('Lagerbewegung protokolliert', movement?.delta === -3, `delta ${movement?.delta}`)

  // Doppelklick: identischer Idempotenzschlüssel darf keine zweite Bestellung erzeugen
  const dup = await call('/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const dupOrder = await body<OrderPayload>(dup)
  check(
    'Doppelte Bestellung verhindert (Idempotenz)',
    dupOrder.orderNumber === order.orderNumber,
    `${dupOrder.orderNumber}`,
  )
  const orderCount = await prisma.order.count({ where: { idempotencyKey: idem } })
  check('Nur eine Bestellung in der Datenbank', orderCount === 1, `${orderCount}`)

  // Gutscheinnutzung wurde gezählt — relativ zum Stand vor dem Lauf, damit die
  // Prüfung auch auf einer Datenbank stimmt, in der schon eingelöst wurde.
  const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code: 'RAUCHSTART10' } })
  check(
    'Gutscheinnutzung gezählt',
    coupon.usageCount === couponUsageBefore + 1,
    `${couponUsageBefore} -> ${coupon.usageCount}`,
  )

  // Gutschein mit perCustomerLimit=1 darf derselbe Kunde nicht erneut nutzen
  await call('/api/cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId: product.id, quantity: 1 }),
  })
  const secondOrder = await call('/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, idempotencyKey: `co_test_${Date.now()}_2`, couponCode: 'RAUCHSTART10' }),
  })
  check(
    'Gutschein-Limit je Kunde greift',
    secondOrder.status === 409,
    `Status ${secondOrder.status}`,
  )

  // --- Warenkorb ist geleert ---
  res = await call('/api/cart')
  cart = await body<CartPayload>(res)
  check(
    'Warenkorb nach Bestellung geleert bzw. neu befüllt',
    (cart.itemCount ?? 0) <= 1,
    `${cart.itemCount}`,
  )

  // --- Anmeldung ---
  const badLogin = await call('/api/admin/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'inhaber@raeucherhaken24.example', password: 'falsch' }),
  })
  check('Falsches Passwort abgelehnt', badLogin.status === 401, `Status ${badLogin.status}`)

  const goodLogin = await call('/api/admin/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'inhaber@raeucherhaken24.example', password: 'RaeucherhakenDemo2024!' }),
  })
  check('Anmeldung erfolgreich', goodLogin.ok, `Status ${goodLogin.status}`)
  check('Session-Cookie gesetzt', jar.has('rh24_session'))

  // --- Sicherheits-Header ---
  const headRes = await fetch(B + '/')
  const csp = headRes.headers.get('content-security-policy') ?? ''
  check('CSP mit Nonce', csp.includes("'nonce-") && csp.includes("frame-ancestors 'none'"))
  check('X-Content-Type-Options', headRes.headers.get('x-content-type-options') === 'nosniff')
  check('Referrer-Policy', headRes.headers.get('referrer-policy') === 'strict-origin-when-cross-origin')

  /*
   * Aufräumen.
   *
   * Der Prüflauf legt eine echte Bestellung an — mit Bestandsabgang,
   * Lagerbewegung, Kundendatensatz und Gutscheineinlösung. Bliebe das stehen,
   * verfälschte jeder Lauf die Kennzahlen im Dashboard und der nächste Lauf
   * liefe gegen eine andere Ausgangslage.
   *
   * Rückgebaut wird in der umgekehrten Reihenfolge des Entstehens; der
   * Bestand wird auf den gemerkten Ausgangswert zurückgesetzt statt
   * hochgerechnet, damit ein abgebrochener Lauf keine Differenz hinterlässt.
   */
  const testCustomer = await prisma.customer.findUnique({ where: { email: testEmail } })
  const testOrders = await prisma.order.findMany({
    where: { email: testEmail },
    select: { id: true, orderNumber: true },
  })
  const orderIds = testOrders.map((o) => o.id)

  if (orderIds.length > 0) {
    // Lagerbewegungen tragen die Bestellnummer als Referenz, nicht die Id.
    await prisma.inventoryMovement.deleteMany({
      where: { reference: { in: testOrders.map((o) => o.orderNumber) } },
    })
    await prisma.couponRedemption.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
  }
  await prisma.coupon.update({
    where: { code: 'RAUCHSTART10' },
    data: { usageCount: couponUsageBefore },
  })
  await prisma.product.update({
    where: { id: product.id },
    data: { stock: stockBefore.stock },
  })
  if (testCustomer) await prisma.customer.delete({ where: { id: testCustomer.id } })

  const stockAfterCleanup = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    select: { stock: true },
  })
  check(
    'Ausgangszustand wiederhergestellt',
    stockAfterCleanup.stock === stockBefore.stock &&
      (await prisma.order.count({ where: { email: testEmail } })) === 0,
  )

  console.log(`\n${fails === 0 ? 'Alle Prüfungen bestanden.' : `${fails} Prüfung(en) fehlgeschlagen.`}`)
  await prisma.$disconnect()
  process.exitCode = fails === 0 ? 0 : 1
}

void main()
