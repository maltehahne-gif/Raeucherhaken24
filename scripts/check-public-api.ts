/**
 * Funktionsprüfung der öffentlichen Schnittstellen gegen den laufenden Server.
 *
 * Geprüft wird die Kontaktstrecke (Spam-Abwehr, Ticketnummer, Zuordnung einer
 * Bestellnummer, Ratenbegrenzung) und der Abruf einer Sonderanfertigung —
 * insbesondere, dass die technischen Angaben ohne Nachweis nicht
 * herausgegeben werden.
 *
 * Nach jedem Lauf wird der Ausgangszustand wiederhergestellt.
 *
 * Aufruf: npm run check:public
 */

// Eigener Modulgueltigkeitsbereich, damit sich Skripte im selben Ordner
// nicht gegenseitig ihre Namen ueberschreiben.
export {}

const SERVER = process.env.CHECK_BASE_URL ?? 'http://localhost:3100'

/** Absender aus dem Prueflauf; siehe `call`. */
const PRUEF_MAIL = 'prueflauf@example.com'

const cookies = new Map<string, string>()
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')

function absorb(res: Response) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const index = pair.indexOf('=')
    cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
  }
}

/**
 * Jeder Lauf bekommt ein eigenes Teilnetz, jede Pruefung eine eigene Adresse.
 *
 * Die Ratenbegrenzung zaehlt je Absender. Ohne diese Trennung naehmen sich die
 * Pruefungen gegenseitig das Kontingent weg, und ein zweiter Lauf innerhalb
 * des Zeitfensters schluege fehl, obwohl nichts kaputt ist. Die Adressen
 * liegen in 203.0.x.y — einem Bereich, der fuer Dokumentation reserviert ist
 * und nie einem echten Rechner gehoert.
 */
const RUN_OCTET = Math.floor(Math.random() * 254) + 1
const clients = new Map<string, number>()
function addressOf(client: string): string {
  if (!clients.has(client)) clients.set(client, clients.size + 1)
  return `203.0.${RUN_OCTET}.${clients.get(client)}`
}

interface CallOptions {
  method?: string
  body?: unknown
  /** false lässt den CSRF-Nachweis absichtlich weg. */
  csrf?: boolean
  /** Name des simulierten Absenders — bestimmt die Adresse. */
  client?: string
}

async function call(path: string, options: CallOptions = {}): Promise<Response> {
  const { method = 'POST', body, csrf = true, client = 'standard' } = options
  const res = await fetch(SERVER + path, {
    method,
    headers: {
      'content-type': 'application/json',
      Origin: SERVER,
      Cookie: cookieHeader(),
      'x-forwarded-for': addressOf(client),
      ...(csrf && cookies.has('rh24_csrf') ? { 'x-csrf-token': cookies.get('rh24_csrf')! } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  absorb(res)
  return res
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await res.json()
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'OK  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const VALID_MESSAGE =
  'Diese Nachricht stammt aus dem automatischen Prüflauf und darf entfernt werden.'

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  absorb(await fetch(SERVER + '/'))
  // Reste eines abgebrochenen Laufs entfernen, damit die Zählungen stimmen.
  await prisma.supportRequest.deleteMany({ where: { email: PRUEF_MAIL } })

  // --- Kontakt ---------------------------------------------------------------
  console.log('\nKontakt')

  const withoutCsrf = await call('/api/kontakt', { body: {}, csrf: false, client: 'ohne-csrf' })
  check('Ohne CSRF-Nachweis abgewiesen', withoutCsrf.status === 403, `Status ${withoutCsrf.status}`)

  const invalid = await call('/api/kontakt', {
    client: 'eingabefehler',
    body: {
      name: 'A',
      email: 'keine-mail',
      topic: 'general',
      subject: 'x',
      message: 'zu kurz',
      privacy: false,
    },
  })
  const invalidBody = await jsonOf(invalid)
  const fieldErrors = invalidBody.fieldErrors as Record<string, string> | undefined
  check('Fehlerhafte Eingaben abgewiesen', invalid.status === 422, `Status ${invalid.status}`)
  check('Feldfehler auf Deutsch', typeof fieldErrors?.email === 'string', fieldErrors?.email ?? '—')
  check('Fehlende Zustimmung wird benannt', typeof fieldErrors?.privacy === 'string')

  const honeypot = await call('/api/kontakt', {
    client: 'honeypot',
    body: {
      name: 'Bot Bot',
      email: 'bot@example.com',
      topic: 'general',
      subject: 'Werbung',
      message: VALID_MESSAGE,
      privacy: true,
      website: 'http://spam.example',
    },
  })
  check('Honeypot greift', !honeypot.ok, `Status ${honeypot.status}`)
  check(
    'Kein Vorgang aus dem Honeypot',
    (await prisma.supportRequest.count({ where: { email: 'bot@example.com' } })) === 0,
  )
  check(
    'Honeypot verrät sich nicht',
    !JSON.stringify(await jsonOf(honeypot)).toLowerCase().includes('website'),
  )

  const before = await prisma.supportRequest.count()

  const accepted = await call('/api/kontakt', {
    client: 'kontakt-erfolg',
    body: {
      name: 'Prüf Lauf',
      email: PRUEF_MAIL,
      phone: '+49 4104 962210',
      company: 'Räucherei Prüflauf',
      topic: 'order',
      orderNumber: 'RH-9999-99999',
      subject: 'Prüflauf der Kontaktstrecke',
      message: VALID_MESSAGE,
      privacy: true,
      website: '',
    },
  })
  const acceptedBody = await jsonOf(accepted)
  const ticket = acceptedBody.ticketNumber
  check('Anfrage angenommen', accepted.ok, `Status ${accepted.status}`)
  check(
    'Ticketnummer vergeben',
    typeof ticket === 'string' && ticket.startsWith('S-'),
    String(ticket),
  )
  check('Genau ein Vorgang mehr', (await prisma.supportRequest.count()) === before + 1)

  const saved =
    typeof ticket === 'string'
      ? await prisma.supportRequest.findUnique({ where: { ticketNumber: ticket } })
      : null
  check(
    'Unbekannte Bestellnummer nicht übernommen',
    saved !== null && saved.orderNumber === null,
    String(saved?.orderNumber),
  )
  check(
    'Hinweis auf die Bestellnummer im Text',
    String(acceptedBody.message ?? '').includes('nicht zuordnen'),
  )
  check('Anliegen gespeichert', saved?.topic === 'order', saved?.topic ?? '—')

  const complaint = await call('/api/kontakt', {
    client: 'reklamation',
    body: {
      name: 'Prüf Lauf',
      email: PRUEF_MAIL,
      topic: 'complaint',
      subject: 'Prüflauf Reklamation',
      message: VALID_MESSAGE,
      privacy: true,
    },
  })
  const complaintTicket = (await jsonOf(complaint)).ticketNumber
  const complaintRow =
    typeof complaintTicket === 'string'
      ? await prisma.supportRequest.findUnique({ where: { ticketNumber: complaintTicket } })
      : null
  check('Reklamation mit erhöhter Priorität', complaintRow?.priority === 'high', complaintRow?.priority ?? '—')

  // Ratenbegrenzung: derselbe Absender kommt nicht beliebig oft durch.
  let limited = 0
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const res = await call('/api/kontakt', {
      client: 'dauerfeuer',
      body: {
        name: 'Prüf Lauf',
        email: PRUEF_MAIL,
        topic: 'general',
        subject: `Prüflauf Ratenbegrenzung ${attempt}`,
        message: VALID_MESSAGE,
        privacy: true,
      },
    })
    if (res.status === 429) limited += 1
  }
  check('Ratenbegrenzung greift beim Dauerfeuer', limited > 0, `${limited} von 8 abgewiesen`)

  await prisma.supportRequest.deleteMany({ where: { email: PRUEF_MAIL } })
  check('Prüfvorgänge entfernt', (await prisma.supportRequest.count()) === before)

  // --- Sonderanfertigung -----------------------------------------------------
  console.log('\nSonderanfertigung')
  const project = await prisma.customProject.findFirst({
    select: { projectNumber: true, email: true, projectName: true, goalDescription: true },
  })

  if (!project) {
    check('Projekt vorhanden', false, 'keines in der Datenbank')
  } else {
    const page = await fetch(`${SERVER}/sonderanfertigung/${project.projectNumber}`).then((r) =>
      r.text(),
    )
    check('Öffentliche Seite zeigt die Nummer', page.includes(project.projectNumber))
    check(
      'Öffentliche Seite verrät den Projektnamen nicht',
      !page.includes(project.projectName),
      'ohne Nachweis kein Konstruktionsdetail',
    )
    check(
      'Öffentliche Seite verrät die Zielbeschreibung nicht',
      !page.includes(project.goalDescription.slice(0, 40)),
    )

    const wrongMail = await call(`/api/sonderanfertigung/${project.projectNumber}`, {
      client: 'projekt-falsch',
      body: { email: 'fremder@example.com' },
    })
    check('Falsche E-Mail abgewiesen', wrongMail.status === 404, `Status ${wrongMail.status}`)

    const unknownProject = await call('/api/sonderanfertigung/P-2099-99999', {
      client: 'projekt-unbekannt',
      body: { email: project.email },
    })
    check(
      'Unbekannte Projektnummer liefert dieselbe Antwort',
      unknownProject.status === wrongMail.status,
      `Status ${unknownProject.status}`,
    )

    const granted = await call(`/api/sonderanfertigung/${project.projectNumber}`, {
      client: 'projekt-richtig',
      body: { email: project.email },
    })
    const detail = await jsonOf(granted)
    check('Richtige E-Mail liefert den Entwurf', granted.ok, `Status ${granted.status}`)
    check(
      'Entwurf enthält die technischen Angaben',
      typeof detail.goalDescription === 'string' && detail.goalDescription.length > 10,
    )
    check('Entwurf gibt die E-Mail nicht zurück', detail.email === undefined)

    const lookupWithoutCsrf = await call(`/api/sonderanfertigung/${project.projectNumber}`, {
      client: 'projekt-ohne-csrf',
      csrf: false,
      body: { email: project.email },
    })
    check(
      'Abruf ohne CSRF-Nachweis abgewiesen',
      lookupWithoutCsrf.status === 403,
      `Status ${lookupWithoutCsrf.status}`,
    )
  }

  await prisma.$disconnect()
  console.log(
    `\n${failures === 0 ? 'Alle Prüfungen bestanden.' : `${failures} Prüfung(en) fehlgeschlagen.`}`,
  )
  process.exitCode = failures === 0 ? 0 : 1
}

void main()
