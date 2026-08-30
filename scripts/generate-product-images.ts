/**
 * Erzeugt die Produktabbildungen als SVG.
 *
 * Bis echte Produktfotografie vorliegt, zeigt der Shop technische
 * Strichzeichnungen statt grauer Platzhalter. Das ist ehrlich (eine Zeichnung
 * gibt sich nicht als Foto aus), passt zur Werkstattanmutung der Marke und
 * kostet im Gegensatz zu Bitmaps praktisch keine Ladezeit.
 *
 * Jede Zeichnung variiert leicht anhand eines aus der SKU abgeleiteten Wertes,
 * damit ein Raster aus 40 Gewuerzen nicht 40-mal identisch aussieht.
 *
 * Aufruf: npx tsx scripts/generate-product-images.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = join(process.cwd(), 'public', 'produkte')

export type Archetype =
  | 'hook-s'
  | 'hook-heavy'
  | 'hook-double'
  | 'hook-four'
  | 'hook-spear'
  | 'hook-rail'
  | 'hook-butcher'
  | 'meal'
  | 'brine'
  | 'spice-whole'
  | 'spice-ground'
  | 'spice-blend'
  | 'salt'
  | 'herb'
  | 'special'

/** Deterministischer Pseudozufall aus einem String. */
function seedFrom(input: string): () => number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PALETTES = [
  { ground: '#f3efe8', vignette: '#e7e0d5', ink: '#3f4750', accent: '#a8461f' },
  { ground: '#eff0f0', vignette: '#e0e3e4', ink: '#3a434b', accent: '#8d4520' },
  { ground: '#f5f1ea', vignette: '#eae2d6', ink: '#454039', accent: '#9c5124' },
  { ground: '#f1f2f1', vignette: '#e3e6e3', ink: '#3d4644', accent: '#96502a' },
]

interface DrawContext {
  rand: () => number
  ink: string
  accent: string
}

/** S-Haken: Oese oben, Schaft, gebogene Spitze. */
function drawHookS(ctx: DrawContext, weight: number): string {
  const { ink, accent } = ctx
  const tilt = (ctx.rand() - 0.5) * 5
  return `
  <g transform="translate(400 90) rotate(${tilt.toFixed(2)})" fill="none"
     stroke="${ink}" stroke-width="${weight}" stroke-linecap="round">
    <path d="M0 0 a34 34 0 1 1 -0.1 0" stroke-width="${weight * 0.92}"/>
    <path d="M0 68 V 372"/>
    <path d="M0 372 c0 74 54 116 112 116 54 0 92 -38 92 -88" stroke="${accent}"/>
    <path d="M204 400 l-6 -30" stroke="${accent}" stroke-width="${weight * 0.8}"/>
  </g>`
}

/** Schwerer Haken mit kraeftigerem Radius. */
function drawHookHeavy(ctx: DrawContext): string {
  const { ink, accent } = ctx
  const tilt = (ctx.rand() - 0.5) * 4
  return `
  <g transform="translate(400 80) rotate(${tilt.toFixed(2)})" fill="none"
     stroke="${ink}" stroke-width="17" stroke-linecap="round">
    <path d="M0 0 a42 42 0 1 1 -0.1 0"/>
    <path d="M0 84 V 350"/>
    <path d="M0 350 c0 92 66 140 136 140 66 0 112 -48 112 -108" stroke="${accent}"/>
    <path d="M248 382 l-8 -34" stroke="${accent}" stroke-width="14"/>
  </g>`
}

/** Doppelhaken / Zweizinker: zwei nach unten laufende Schenkel mit J-Spitzen. */
function drawHookDouble(ctx: DrawContext): string {
  const { ink, accent } = ctx
  return `
  <g transform="translate(400 96)" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 0 a30 30 0 1 1 -0.1 0"/>
    <path d="M0 60 V 214"/>
    <path d="M-96 262 q 0 -48 48 -48 h 96 q 48 0 48 48"/>
    <path d="M-96 262 v 118 c0 52 34 84 78 84 38 0 62 -26 62 -60" stroke="${accent}"/>
    <path d="M96 262 v 118 c0 52 -34 84 -78 84 -38 0 -62 -26 -62 -60" stroke="${accent}" opacity="0"/>
    <path d="M96 262 v 118 c0 52 34 84 78 84 38 0 62 -26 62 -60" stroke="${accent}"/>
    <path d="M44 396 l-4 -30" stroke="${accent}" stroke-width="10"/>
    <path d="M236 396 l-4 -30" stroke="${accent}" stroke-width="10"/>
  </g>`
}

/** Vierzinker / Kammhaken. */
function drawHookFour(ctx: DrawContext): string {
  const { ink, accent } = ctx
  const prongs = [-165, -55, 55, 165]
  const arms = prongs
    .map(
      (x) =>
        `<path d="M0 210 L ${x} 300 v 96 c0 30 20 48 46 48" stroke="${accent}" stroke-width="11"/>`,
    )
    .join('\n    ')
  return `
  <g transform="translate(400 100)" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round">
    <path d="M0 0 a30 30 0 1 1 -0.1 0"/>
    <path d="M0 60 V 210"/>
    <path d="M-172 300 H 172" stroke-width="12"/>
    ${arms}
  </g>`
}

/**
 * Gerader Spiess-/Stechhaken: langer Schaft, angeschliffene Spitze,
 * seitlicher Widerhaken. Bewusst schraeg gestellt, damit die Laenge wirkt.
 */
function drawHookSpear(ctx: DrawContext): string {
  const { ink, accent } = ctx
  const tilt = (ctx.rand() - 0.5) * 4
  return `
  <g transform="translate(400 92) rotate(${tilt.toFixed(2)})" fill="none"
     stroke="${ink}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 0 a36 36 0 1 1 -0.1 0"/>
    <path d="M0 72 V 512"/>
    <path d="M0 500 q 34 56 0 132 q -34 -76 0 -132 Z" stroke="${accent}" stroke-width="15"/>
    <path d="M0 430 q 62 10 74 62" stroke="${accent}" stroke-width="14"/>
    <path d="M0 310 q 62 10 74 62" stroke="${accent}" stroke-width="14" opacity="0.5"/>
    <path d="M0 190 q 62 10 74 62" stroke="${accent}" stroke-width="14" opacity="0.28"/>
  </g>`
}

/** Hakenleiste / Aufhaengeschiene. */
function drawHookRail(ctx: DrawContext): string {
  const { ink, accent } = ctx
  const positions = [-210, -105, 0, 105, 210]
  const hooks = positions
    .map(
      (x) =>
        `<path d="M${x} 210 v 96 c0 40 28 64 62 64 30 0 50 -20 50 -46" stroke="${accent}" stroke-width="10"/>`,
    )
    .join('\n    ')
  return `
  <g transform="translate(400 150)" fill="none" stroke="${ink}" stroke-width="14" stroke-linecap="round">
    <path d="M-268 0 a24 24 0 1 1 -0.1 0" stroke-width="10"/>
    <path d="M268 0 a24 24 0 1 1 -0.1 0" stroke-width="10"/>
    <path d="M-268 46 v 40 M268 46 v 40"/>
    <rect x="-286" y="86" width="572" height="124" rx="24" stroke-width="14"/>
    ${hooks}
  </g>`
}

/** Fleischerhaken mit kraeftiger Oese. */
function drawHookButcher(ctx: DrawContext): string {
  const { ink, accent } = ctx
  return `
  <g transform="translate(400 84)" fill="none" stroke="${ink}" stroke-width="20" stroke-linecap="round">
    <path d="M0 0 a50 50 0 1 1 -0.1 0" stroke-width="18"/>
    <path d="M0 100 V 320"/>
    <path d="M0 320 c0 106 78 160 156 160 74 0 124 -54 124 -122" stroke="${accent}"/>
    <path d="M280 358 l-10 -40" stroke="${accent}" stroke-width="16"/>
  </g>`
}

/** Raeuchermehl: offener Sack mit Spaenen. */
function drawMeal(ctx: DrawContext): string {
  const { ink, accent, rand } = ctx
  const chips = Array.from({ length: 22 }, () => {
    const x = 278 + rand() * 244
    const y = 236 + rand() * 74
    const r = 8 + rand() * 12
    const rot = rand() * 180
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(r * 2).toFixed(0)}" height="${r.toFixed(0)}" rx="3" transform="rotate(${rot.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${accent}" opacity="${(0.25 + rand() * 0.45).toFixed(2)}" stroke="none"/>`
  }).join('\n    ')
  return `
  <g fill="none" stroke="${ink}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
    <path d="M266 246 c16 -26 44 -36 70 -24 26 -40 76 -50 114 -26 38 -26 88 -14 108 22 28 -4 50 18 50 44"/>
    <path d="M258 290 h 284 a 12 12 0 0 1 12 14 q -8 68 -8 152 t 10 154 a 34 34 0 0 1 -34 38 H 290 a 34 34 0 0 1 -34 -38 q 10 -86 10 -154 t -8 -152 a 12 12 0 0 1 12 -14 Z"/>
    <path d="M254 340 h 292" stroke-width="8" opacity="0.32"/>
    <path d="M330 456 h 140" stroke-width="7" opacity="0.22"/>
    ${chips}
  </g>`
}

/** Raeucherlauge: Standbeutel mit Etikett. */
function drawBrine(ctx: DrawContext): string {
  const { ink, accent } = ctx
  return `
  <g fill="none" stroke="${ink}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round">
    <path d="M286 202 h 228 v 42 h -228 z"/>
    <path d="M272 244 h 256 l 16 336 c 2 26 -18 48 -44 48 H 300 c -26 0 -46 -22 -44 -48 Z"/>
    <rect x="316" y="326" width="168" height="152" rx="12" stroke="${accent}" stroke-width="10"/>
    <path d="M348 374 h 104 M348 410 h 104 M348 446 h 66" stroke="${accent}" stroke-width="8" opacity="0.6"/>
  </g>`
}

/** Gewuerzglas — Fuellung variiert je Archetyp. */
function drawSpiceJar(ctx: DrawContext, kind: 'whole' | 'ground' | 'blend' | 'salt'): string {
  const { ink, accent, rand } = ctx

  let fill = ''
  if (kind === 'whole') {
    fill = Array.from({ length: 34 }, () => {
      const x = 316 + rand() * 168
      const y = 372 + rand() * 190
      const r = 7 + rand() * 6
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${accent}" opacity="${(0.3 + rand() * 0.5).toFixed(2)}" stroke="none"/>`
    }).join('\n    ')
  } else if (kind === 'ground') {
    fill = `<path d="M310 380 h 180 v 174 a 12 12 0 0 1 -12 12 H 322 a 12 12 0 0 1 -12 -12 Z" fill="${accent}" opacity="0.32" stroke="none"/>
    <path d="M310 380 q 44 -18 90 0 t 90 0" fill="none" stroke="${accent}" stroke-width="7" opacity="0.5"/>`
  } else if (kind === 'salt') {
    fill = Array.from({ length: 40 }, () => {
      const x = 318 + rand() * 164
      const y = 392 + rand() * 170
      const s = 6 + rand() * 7
      return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="1.5" transform="rotate(${(rand() * 90).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${ink}" opacity="${(0.16 + rand() * 0.26).toFixed(2)}" stroke="none"/>`
    }).join('\n    ')
  } else {
    // Mischung: Schichten unterschiedlicher Koernung
    fill = `<path d="M310 392 h 180 v 58 h -180 z" fill="${accent}" opacity="0.34" stroke="none"/>
    <path d="M310 450 h 180 v 54 h -180 z" fill="${ink}" opacity="0.18" stroke="none"/>
    <path d="M310 504 h 180 v 62 a 12 12 0 0 1 -12 12 H 322 a 12 12 0 0 1 -12 -12 Z" fill="${accent}" opacity="0.2" stroke="none"/>`
  }

  return `
  <g fill="none" stroke="${ink}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round">
    <path d="M336 168 h 128 v 44 h -128 z" stroke-width="11"/>
    <rect x="318" y="212" width="164" height="52" rx="10" stroke-width="11"/>
    <path d="M300 264 h 200 a 12 12 0 0 1 12 12 v 300 a 36 36 0 0 1 -36 36 H 324 a 36 36 0 0 1 -36 -36 V 276 a 12 12 0 0 1 12 -12 Z"/>
    ${fill}
    <path d="M348 296 h 104" stroke-width="7" opacity="0.3"/>
  </g>`
}

/** Kraeuter: Bund mit Blaettern. */
function drawHerb(ctx: DrawContext): string {
  const { ink, accent, rand } = ctx
  const leaves = Array.from({ length: 9 }, (_, i) => {
    const angle = -74 + i * 18 + (rand() - 0.5) * 8
    const len = 150 + rand() * 90
    return `<g transform="translate(400 420) rotate(${angle.toFixed(1)})">
      <path d="M0 0 V ${-len.toFixed(0)}" stroke="${ink}" stroke-width="7"/>
      <path d="M0 ${(-len * 0.62).toFixed(0)} q -34 -26 0 -${(len * 0.36).toFixed(0)} q 34 26 0 ${(len * 0.36).toFixed(0)} Z" fill="${accent}" opacity="${(0.22 + rand() * 0.34).toFixed(2)}" stroke="${ink}" stroke-width="5"/>
    </g>`
  }).join('\n    ')
  return `
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${leaves}
    <path d="M340 424 h 120 v 74 a 20 20 0 0 1 -20 20 h -80 a 20 20 0 0 1 -20 -20 Z" stroke="${ink}" stroke-width="12"/>
    <path d="M336 452 h 128 M336 484 h 128" stroke="${accent}" stroke-width="8" opacity="0.55"/>
  </g>`
}

/** Sonderanfertigung: Haken mit Bemassung. */
function drawSpecial(ctx: DrawContext): string {
  const { ink, accent } = ctx
  return `
  <g fill="none" stroke-linecap="round">
    <g stroke="${ink}" stroke-width="13">
      <path d="M400 118 a30 30 0 1 1 -0.1 0"/>
      <path d="M400 178 V 400"/>
      <path d="M400 400 c0 66 48 104 100 104 48 0 82 -34 82 -78" stroke="${accent}"/>
    </g>
    <g stroke="${accent}" stroke-width="4" stroke-dasharray="10 8" opacity="0.75">
      <path d="M256 118 H 370"/>
      <path d="M256 504 H 470"/>
      <path d="M280 118 V 504"/>
      <path d="M272 130 l8 -14 8 14 M272 492 l8 14 8 -14" stroke-dasharray="none"/>
    </g>
    <text x="220" y="318" font-family="ui-sans-serif, system-ui, sans-serif" font-size="26"
          fill="${accent}" text-anchor="middle" transform="rotate(-90 220 318)" opacity="0.8">nach Maß</text>
  </g>`
}

const DRAWERS: Record<Archetype, (ctx: DrawContext) => string> = {
  'hook-s': (ctx) => drawHookS(ctx, 13),
  'hook-heavy': drawHookHeavy,
  'hook-double': drawHookDouble,
  'hook-four': drawHookFour,
  'hook-spear': drawHookSpear,
  'hook-rail': drawHookRail,
  'hook-butcher': drawHookButcher,
  meal: drawMeal,
  brine: drawBrine,
  'spice-whole': (ctx) => drawSpiceJar(ctx, 'whole'),
  'spice-ground': (ctx) => drawSpiceJar(ctx, 'ground'),
  'spice-blend': (ctx) => drawSpiceJar(ctx, 'blend'),
  salt: (ctx) => drawSpiceJar(ctx, 'salt'),
  herb: drawHerb,
  special: drawSpecial,
}

/** Baut eine vollstaendige SVG-Abbildung. */
export function buildProductSvg(archetype: Archetype, seed: string): string {
  const rand = seedFrom(seed)
  const palette = PALETTES[Math.floor(rand() * PALETTES.length)]
  const ctx: DrawContext = { rand, ink: palette.ink, accent: palette.accent }
  const body = DRAWERS[archetype](ctx)
  const glowX = 32 + rand() * 36
  const glowY = 12 + rand() * 24

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img">
  <defs>
    <radialGradient id="g" cx="${glowX.toFixed(0)}%" cy="${glowY.toFixed(0)}%" r="85%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="58%" stop-color="${palette.ground}"/>
      <stop offset="100%" stop-color="${palette.vignette}"/>
    </radialGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <g opacity="0.055" stroke="${palette.ink}" stroke-width="1">
    <path d="M0 200 H800 M0 400 H800 M0 600 H800 M200 0 V800 M400 0 V800 M600 0 V800"/>
  </g>
  ${body}
</svg>
`
}

/** Schreibt eine Abbildung und gibt den oeffentlichen Pfad zurueck. */
export function writeProductImage(archetype: Archetype, seed: string, fileName: string): string {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, `${fileName}.svg`), buildProductSvg(archetype, seed), 'utf8')
  return `/produkte/${fileName}.svg`
}

// Direktaufruf erzeugt eine Musterdatei je Archetyp zur Sichtpruefung.
if (process.argv[1]?.endsWith('generate-product-images.ts')) {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const archetype of Object.keys(DRAWERS) as Archetype[]) {
    writeFileSync(join(OUT_DIR, `muster-${archetype}.svg`), buildProductSvg(archetype, archetype), 'utf8')
  }
  console.log(`${Object.keys(DRAWERS).length} Musterabbildungen in public/produkte geschrieben.`)
}
