/**
 * Funktionsprüfung der Verwaltungs-Schnittstellen gegen den laufenden Server.
 *
 * Geprüft wird nicht nur, ob eine Antwort kommt, sondern ob die Wirkung in der
 * Datenbank ankommt — und ob dieselbe Anfrage ohne Anmeldung, ohne
 * CSRF-Nachweis oder mit fehlender Berechtigung abgewiesen wird.
 *
 * Nach jedem Lauf wird der Ausgangszustand wiederhergestellt.
 *
 * Aufruf: npx tsx scripts/check-admin-api.ts
 */

// Eigener Modulgueltigkeitsbereich, damit sich Skripte im selben Ordner
// nicht gegenseitig ihre Namen ueberschreiben.
export {}

const SERVER = process.env.CHECK_BASE_URL ?? 'http://localhost:3100'

const cookies = new Map<string, string>()
const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')

function absorb(res: Response) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const index = pair.indexOf('=')
    cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
  }
}

async function call(path: string, init: RequestInit = {}, withCsrf = true) {
  const res = await fetch(SERVER + path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Origin: SERVER,
      Cookie: cookieHeader(),
      ...(withCsrf && cookies.has('rh24_csrf') ? { 'x-csrf-token': cookies.get('rh24_csrf')! } : {}),
    },
  })
  absorb(res)
  return res
}

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'OK  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  absorb(await fetch(SERVER + '/'))

  // --- Zugriffsschutz vor der Anmeldung --------------------------------------
  console.log('\nZugriffsschutz')
  const product = await prisma.product.findFirstOrThrow({
    select: { id: true, stock: true, name: true, lowStockThreshold: true },
  })

  const anonymous = await call('/api/admin/lager', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'single', productId: product.id, stock: 999, lowStockThreshold: 8 }),
  })
  check('Lagerbuchung ohne Anmeldung abgewiesen', anonymous.status === 401 || anonymous.status === 403,
    `Status ${anonymous.status}`)

  const stockUnchanged = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
  check('Bestand unverändert', stockUnchanged.stock === product.stock)

  // --- Anmeldung -------------------------------------------------------------
  console.log('\nAnmeldung')
  await call('/admin/anmelden')
  const login = await call('/api/admin/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'inhaber@raeucherhaken24.example',
      password: 'RaeucherhakenDemo2024!',
    }),
  })
  check('Anmeldung erfolgreich', login.ok, `Status ${login.status}`)
  if (!login.ok) {
    console.log('  Ohne Anmeldung sind die weiteren Prüfungen sinnlos — Abbruch.')
    await prisma.$disconnect()
    process.exitCode = 1
    return
  }

  const withoutCsrf = await call(
    '/api/admin/lager',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'single', productId: product.id, stock: 999, lowStockThreshold: 8 }),
    },
    false,
  )
  check('Angemeldet, aber ohne CSRF-Nachweis abgewiesen', withoutCsrf.status === 403,
    `Status ${withoutCsrf.status}`)

  // --- Lagerbuchung ----------------------------------------------------------
  console.log('\nLager')
  const before = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
  const target = before.stock + 7

  const booking = await call('/api/admin/lager', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'single',
      productId: product.id,
      stock: target,
      lowStockThreshold: before.lowStockThreshold,
      note: 'Prüflauf',
    }),
  })
  check('Bestand gebucht', booking.ok, `Status ${booking.status}`)

  const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
  check('Bestand in der Datenbank angekommen', after.stock === target, `${before.stock} -> ${after.stock}`)

  const movement = await prisma.inventoryMovement.findFirst({
    where: { productId: product.id, reason: 'manual' },
    orderBy: { createdAt: 'desc' },
  })
  check('Buchung im Journal', movement?.delta === 7, `delta ${movement?.delta}`)
  check('Bearbeiter im Journal vermerkt', Boolean(movement?.userId))

  const negative = await call('/api/admin/lager', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'single',
      productId: product.id,
      stock: -5,
      lowStockThreshold: before.lowStockThreshold,
    }),
  })
  check('Negativer Bestand abgewiesen', !negative.ok, `Status ${negative.status}`)

  // Sammelbuchung über mehrere Artikel
  const bulkTargets = await prisma.product.findMany({ take: 3, select: { id: true, stock: true } })
  const bulk = await call('/api/admin/lager', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'bulk',
      mode: 'increase',
      value: 5,
      productIds: bulkTargets.map((p) => p.id),
      note: 'Prüflauf Sammelbuchung',
    }),
  })
  check('Sammelbuchung angenommen', bulk.ok, `Status ${bulk.status}`)

  const bulkAfter = await prisma.product.findMany({
    where: { id: { in: bulkTargets.map((p) => p.id) } },
    select: { id: true, stock: true },
  })
  const bulkById = new Map(bulkAfter.map((p) => [p.id, p.stock]))
  check(
    'Alle Artikel der Sammelbuchung erhöht',
    bulkTargets.every((p) => bulkById.get(p.id) === p.stock + 5),
  )

  // Sammelbuchung zurücknehmen
  await call('/api/admin/lager', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'bulk',
      mode: 'decrease',
      value: 5,
      productIds: bulkTargets.map((p) => p.id),
      note: 'Prüflauf zurückgesetzt',
    }),
  })

  // Ausgangszustand wiederherstellen
  await call('/api/admin/lager', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'single',
      productId: product.id,
      stock: before.stock,
      lowStockThreshold: before.lowStockThreshold,
      note: 'Prüflauf zurückgesetzt',
    }),
  })
  const restored = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
  check('Ausgangsbestand wiederhergestellt', restored.stock === before.stock)

  // --- Bestellstatus ---------------------------------------------------------
  console.log('\nBestellungen')
  const order = await prisma.order.findFirst({
    where: { status: 'new' },
    select: { id: true, orderNumber: true, status: true },
  })
  if (!order) {
    console.log('  Keine Bestellung im Status "neu" vorhanden — übersprungen.')
  } else {
    const invalid = await call(`/api/admin/bestellungen/${order.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'status', status: 'delivered' }),
    })
    check('Unzulässiger Statussprung abgewiesen', !invalid.ok, `Status ${invalid.status}`)

    const valid = await call(`/api/admin/bestellungen/${order.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'status', status: 'confirmed', note: 'Prüflauf' }),
    })
    check('Zulässiger Statuswechsel angenommen', valid.ok, `Status ${valid.status}`)

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    check('Status in der Datenbank', updated.status === 'confirmed', updated.status)

    const history = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    })
    check('Statuswechsel protokolliert', history?.toValue === 'confirmed' && Boolean(history.userId))
  }

  // --- Gutscheine ------------------------------------------------------------
  console.log('\nGutscheine')
  const code = `PRUEFLAUF${Date.now().toString(36).toUpperCase().slice(-5)}`
  const created = await call('/api/admin/gutscheine', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      description: 'Angelegt durch den Prüflauf',
      type: 'percent',
      value: '10',
      minOrderValueCents: '40,00',
      maxDiscountCents: '30,00',
      usageLimit: '100',
      perCustomerLimit: '1',
      active: true,
    }),
  })
  check('Gutschein angelegt', created.ok, `Status ${created.status}`)

  const savedCoupon = await prisma.coupon.findUnique({ where: { code } })
  if (savedCoupon) {
    // 10 % müssen als 1000 Basispunkte, 40,00 € als 4000 Cent ankommen.
    check('Prozentwert als Basispunkte gespeichert', savedCoupon.value === 1000, `${savedCoupon.value}`)
    check('Mindestbestellwert als Cent gespeichert', savedCoupon.minOrderValueCents === 4000,
      `${savedCoupon.minOrderValueCents}`)

    const duplicate = await call('/api/admin/gutscheine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, description: 'Doppelt', type: 'fixed', value: '5', active: true }),
    })
    check('Doppelter Gutscheincode abgewiesen', !duplicate.ok, `Status ${duplicate.status}`)

    await prisma.coupon.delete({ where: { code } })
    check('Prüfgutschein wieder entfernt', true)
  } else {
    check('Gutschein in der Datenbank', false, 'nicht gefunden')
  }

  // --- Saisonmodus -----------------------------------------------------------
  console.log('\nSaison')
  const previousTheme = (await prisma.setting.findUnique({ where: { key: 'shop:seasonal_theme' } }))?.value ?? 'normal'

  const season = await call('/api/admin/saison', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theme: 'advent', bannerText: '', bannerLink: '', bannerActive: false }),
  })
  check('Saisonmodus umgestellt', season.ok, `Status ${season.status}`)

  const storedTheme = await prisma.setting.findUnique({ where: { key: 'shop:seasonal_theme' } })
  check('Saisonmodus in der Datenbank', storedTheme?.value === 'advent', `${storedTheme?.value}`)

  const shopHtml = await fetch(SERVER + '/').then((res) => res.text())
  check('Saisonmodus wirkt sofort auf die Startseite', shopHtml.includes('data-season="advent"'))

  const unknownTheme = await call('/api/admin/saison', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theme: 'karneval', bannerText: '', bannerLink: '', bannerActive: false }),
  })
  check('Unbekannter Saisonmodus abgewiesen', !unknownTheme.ok, `Status ${unknownTheme.status}`)

  // Ein Bannerlink landet im Kopfbereich jeder Seite — javascript: waere dort
  // ein Einfallstor.
  const scriptLink = await call('/api/admin/saison', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      theme: 'normal',
      bannerText: 'Test',
      bannerLink: 'javascript:alert(1)',
      bannerActive: true,
    }),
  })
  check('Bannerlink mit javascript: abgewiesen', !scriptLink.ok, `Status ${scriptLink.status}`)

  await call('/api/admin/saison', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theme: previousTheme, bannerText: '', bannerLink: '', bannerActive: false }),
  })
  const restoredTheme = await prisma.setting.findUnique({ where: { key: 'shop:seasonal_theme' } })
  check('Saisonmodus zurueckgesetzt', (restoredTheme?.value ?? 'normal') === previousTheme)

  // --- Mitarbeitende: Schutz vor Selbstaussperrung ---------------------------
  console.log('\nMitarbeitende')
  const me = await prisma.user.findFirstOrThrow({
    where: { email: 'inhaber@raeucherhaken24.example' },
    select: { id: true, roleId: true, firstName: true, lastName: true, email: true },
  })

  const selfOff = await call(`/api/admin/mitarbeiter/${me.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ intent: 'activation', active: false }),
  })
  check('Eigenes Konto kann nicht deaktiviert werden', selfOff.status === 409, `Status ${selfOff.status}`)

  const stillActive = await prisma.user.findUniqueOrThrow({ where: { id: me.id } })
  check('Eigenes Konto weiterhin aktiv', stillActive.active)

  const otherRole = await prisma.role.findFirst({ where: { id: { not: me.roleId } }, select: { id: true } })
  if (otherRole) {
    const selfUpgrade = await call(`/api/admin/mitarbeiter/${me.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: me.firstName,
        lastName: me.lastName,
        email: me.email,
        roleId: otherRole.id,
        active: true,
        password: '',
        passwordConfirm: '',
      }),
    })
    check('Eigene Rolle kann nicht geaendert werden', selfUpgrade.status === 403, `Status ${selfUpgrade.status}`)

    const unchangedRole = await prisma.user.findUniqueOrThrow({ where: { id: me.id } })
    check('Eigene Rolle unveraendert', unchangedRole.roleId === me.roleId)
  }

  const weakPassword = await call('/api/admin/mitarbeiter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Prüf',
      lastName: 'Lauf',
      email: `prueflauf-${Date.now().toString(36)}@raeucherhaken24.example`,
      roleId: me.roleId,
      active: true,
      password: 'passwort',
      passwordConfirm: 'passwort',
    }),
  })
  check('Zu schwaches Passwort abgewiesen', weakPassword.status === 422, `Status ${weakPassword.status}`)

  // --- Rollen ----------------------------------------------------------------
  console.log('\nRollen')
  const ownerRole = await prisma.role.findFirst({ where: { key: 'owner' }, select: { id: true } })
  if (ownerRole) {
    const strip = await call(`/api/admin/rollen/${ownerRole.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ permissions: [] }),
    })
    check('Rechte der Inhaberrolle gesperrt', strip.status === 409, `Status ${strip.status}`)

    const ownerPermissions = await prisma.rolePermission.count({ where: { roleId: ownerRole.id } })
    check('Inhaberrolle hat weiterhin Rechte', ownerPermissions > 0, `${ownerPermissions}`)
  }

  const unknownPermission = await prisma.role.findFirst({
    where: { key: { not: 'owner' } },
    select: { id: true },
  })
  if (unknownPermission) {
    const bogus = await call(`/api/admin/rollen/${unknownPermission.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ permissions: ['alles:duerfen'] }),
    })
    check('Unbekannte Berechtigung abgewiesen', !bogus.ok, `Status ${bogus.status}`)
  }

  // --- Abmeldung -------------------------------------------------------------
  console.log('\nAbmeldung')
  const logout = await call('/api/admin/auth', { method: 'DELETE' })
  check('Abmeldung erfolgreich', logout.ok, `Status ${logout.status}`)

  const afterLogout = await call('/api/admin/lager', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'single', productId: product.id, stock: 1, lowStockThreshold: 8 }),
  })
  check('Nach Abmeldung kein Zugriff mehr', afterLogout.status === 401 || afterLogout.status === 403,
    `Status ${afterLogout.status}`)

  await prisma.$disconnect()
  console.log(`\n${failures === 0 ? 'Alle Prüfungen bestanden.' : `${failures} Prüfung(en) fehlgeschlagen.`}`)
  process.exitCode = failures === 0 ? 0 : 1
}

void main()
