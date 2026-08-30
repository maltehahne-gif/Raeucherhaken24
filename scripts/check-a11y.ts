/**
 * Barrierefreiheits-Stichproben gegen den laufenden Entwicklungsserver.
 *
 * Geprüft werden die Punkte, die sich zuverlässig maschinell feststellen lassen
 * und in der Praxis am häufigsten schiefgehen: fehlende Alternativtexte,
 * Formularfelder ohne zugänglichen Namen, Bedienelemente ohne Beschriftung,
 * Überschriftenhierarchie, Landmarken, doppelte IDs und positive tabindex-Werte.
 *
 * Nicht geprüft werden Dinge, die ein Werkzeug nicht beurteilen kann:
 * Verständlichkeit der Texte, Sinnhaftigkeit der Alternativtexte,
 * Fokusreihenfolge im Detail. Dafür braucht es weiterhin einen Menschen mit
 * Tastatur und Screenreader.
 *
 * Voraussetzung: ein Chromium mit offenem Debug-Port.
 *
 *   /opt/pw-browsers/chromium-*\/chrome-linux/chrome \
 *     --headless --no-sandbox --remote-debugging-port=9333 about:blank &
 *   npx tsx scripts/check-a11y.ts
 */

// Eigener Modulgueltigkeitsbereich, damit sich Skripte im selben Ordner
// nicht gegenseitig ihre Namen ueberschreiben.
export {}

const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT ?? 9333)
const BASE = process.env.CHECK_BASE_URL ?? 'http://localhost:3100'

const DEFAULT_PATHS = [
  '/',
  '/kategorie',
  '/kategorie/raeucherhaken',
  '/kategorie/naturgewuerze',
  '/produkt/hofmeister-s-260',
  '/vergleich',
  '/konfigurator',
  '/beratung',
  '/sonderanfertigung',
  '/rezepte',
  '/rezepte/heissgeraeucherte-forelle-aus-der-salzlake',
  '/wissen',
  '/wissen/edelstahl-v2a-v4a',
  '/kontakt',
  '/sonderanfertigung/P-2026-101',
  '/suche?q=raeucherhaken',
  '/suche?q=xyzunfug',
  '/warenkorb',
  '/kasse',
  '/versand',
  '/impressum',
  '/datenschutz',
]

interface Problem {
  rule: string
  detail: string
}

/**
 * Wird im Browser ausgeführt. Bewusst als Zeichenkette, damit der Code im
 * Seitenkontext läuft und die tatsächlich gerenderte Ausgabe prüft.
 */
const CHECK_SCRIPT = `(() => {
  const problems = []
  const add = (rule, detail) => problems.push({ rule, detail })

  /*
   * Elemente unterhalb von aria-hidden erreichen Hilfstechnik nicht und werden
   * deshalb nicht geprueft. Ohne diese Einschraenkung meldet die Pruefung rein
   * darstellende Bereiche — etwa die Saeulen eines Diagramms, dessen Daten
   * daneben als Tabelle stehen.
   */
  const versteckt = (el) => el.closest('[aria-hidden="true"]') !== null

  for (const img of document.querySelectorAll('img')) {
    if (versteckt(img)) continue
    if (!img.hasAttribute('alt')) add('bild-ohne-alt', (img.getAttribute('src') || '?').slice(0, 60))
  }

  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (versteckt(el)) continue
    const id = el.getAttribute('id')
    const labelled =
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      (id && document.querySelector('label[for="' + CSS.escape(id) + '"]')) ||
      el.closest('label')
    if (!labelled) add('feld-ohne-beschriftung', (el.getAttribute('name') || el.tagName).slice(0, 40))
  }

  for (const el of document.querySelectorAll('button, a[href]')) {
    if (versteckt(el)) continue
    const text = (el.textContent || '').trim()
    const imgAlt = [...el.querySelectorAll('img')].map((i) => i.getAttribute('alt') || '').join(' ').trim()
    const svgLabel = [...el.querySelectorAll('svg[role=img]')].map((s) => s.getAttribute('aria-label') || '').join(' ').trim()
    if (!(text || el.getAttribute('aria-label') || el.getAttribute('title') || imgAlt || svgLabel)) {
      add('element-ohne-namen', el.tagName.toLowerCase() + ' ' + String(el.className || '').slice(0, 40))
    }
  }

  const h1s = document.querySelectorAll('h1')
  if (h1s.length === 0) add('keine-h1', 'Die Seite hat keine Hauptüberschrift.')
  if (h1s.length > 1) add('mehrere-h1', String(h1s.length))

  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]))
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] - levels[i - 1] > 1) add('ueberschriftensprung', 'h' + levels[i - 1] + ' auf h' + levels[i])
  }

  if (!document.querySelector('main')) add('kein-main-bereich', '')
  if (document.documentElement.lang !== 'de') add('sprache-nicht-de', document.documentElement.lang || '(leer)')

  const ids = new Map()
  for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) || 0) + 1)
  for (const [value, count] of ids) if (count > 1) add('doppelte-id', value + ' (' + count + 'x)')

  for (const el of document.querySelectorAll('[tabindex]')) {
    if (Number(el.getAttribute('tabindex')) > 0) add('positiver-tabindex', el.tagName.toLowerCase())
  }

  return problems
})()`

async function main() {
  const paths = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_PATHS

  let targets: Array<{ type: string; webSocketDebuggerUrl: string }>
  try {
    targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()
  } catch {
    console.error(
      `\nKein Browser auf Port ${DEBUG_PORT} erreichbar.\n` +
        'Bitte zuerst ein Chromium mit Debug-Port starten — siehe Kommentar in dieser Datei.\n',
    )
    process.exitCode = 1
    return
  }

  const target = targets.find((t) => t.type === 'page')
  if (!target) {
    console.error('Keine Seite im Browser gefunden.')
    process.exitCode = 1
    return
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  let messageId = 0
  const pending = new Map<number, (value: { result?: { result?: { value?: unknown } } }) => void>()

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number }
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)?.(message as never)
      pending.delete(message.id)
    }
  })
  await new Promise((resolve) => ws.addEventListener('open', resolve))

  function send(method: string, params: Record<string, unknown> = {}) {
    messageId += 1
    const current = messageId
    return new Promise<{ result?: { result?: { value?: unknown } } }>((resolve) => {
      pending.set(current, resolve)
      ws.send(JSON.stringify({ id: current, method, params }))
    })
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })

  let total = 0
  for (const path of paths) {
    // Der Statuscode wird getrennt abgefragt: Eine Fehlerseite ist gestalterisch
    // einwandfrei und bestuende jede Pruefung — ohne diese Abfrage haette das
    // Skript eine fehlende Seite als "OK" gemeldet.
    const status = await fetch(BASE + path, { redirect: 'manual' })
      .then((res) => res.status)
      .catch(() => 0)

    await send('Page.navigate', { url: BASE + path })
    await new Promise((resolve) => setTimeout(resolve, 2200))

    const response = await send('Runtime.evaluate', { returnByValue: true, expression: CHECK_SCRIPT })
    const problems = (response.result?.result?.value ?? []) as Problem[]
    if (status !== 200) {
      problems.unshift({
        rule: 'seite nicht erreichbar',
        detail: status === 0 ? 'keine Antwort vom Server' : `HTTP ${status}`,
      })
    }
    total += problems.length

    if (problems.length === 0) {
      console.log(`  OK    ${path}`)
      continue
    }

    console.log(`  ${problems.length} Befund(e)  ${path}`)
    const grouped = new Map<string, string[]>()
    for (const problem of problems) {
      grouped.set(problem.rule, [...(grouped.get(problem.rule) ?? []), problem.detail])
    }
    for (const [rule, details] of grouped) {
      const shown = details.slice(0, 3).join(' | ')
      const rest = details.length > 3 ? ` (+${details.length - 3} weitere)` : ''
      console.log(`        ${rule}: ${shown}${rest}`)
    }
  }

  console.log(`\n${total === 0 ? 'Keine Befunde.' : `${total} Befund(e) insgesamt.`}`)
  ws.close()
  process.exitCode = total === 0 ? 0 : 1
}

void main()
