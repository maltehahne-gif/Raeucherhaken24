import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SEASONAL_THEMES, SEASONAL_THEME_LABELS } from '@/lib/domain/enums'

/**
 * Saisonale Gestaltung.
 *
 * Die Saisonmodi aendern ausschliesslich Token-Werte unter einem
 * `[data-season]`-Selektor. Damit kann ein Modus in die Liste geraten, ohne
 * dass es dazu Gestaltung gibt — im Shop waere dann nichts zu sehen, und der
 * Fehler faellt erst im Advent auf. Dieser Test vergleicht deshalb die Liste
 * der Modi mit den tatsaechlich vorhandenen Regeln.
 */

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

describe('Saisonmodi', () => {
  it('kennt alle neun Modi', () => {
    expect(SEASONAL_THEMES).toHaveLength(9)
    expect(SEASONAL_THEMES[0]).toBe('normal')
  })

  it('hat zu jedem Modus eine deutsche Bezeichnung', () => {
    for (const key of SEASONAL_THEMES) {
      expect(SEASONAL_THEME_LABELS[key]?.length).toBeGreaterThan(0)
    }
  })

  it('hat zu jedem Modus ausser dem Standard eigene Token-Werte', () => {
    for (const key of SEASONAL_THEMES) {
      // Der Standard braucht keinen eigenen Block: Er ist die Grundeinstellung
      // in `:root`, auf die alle anderen Modi aufsetzen.
      if (key === 'normal') continue
      expect(css, `Kein CSS-Block fuer den Saisonmodus "${key}"`).toContain(`[data-season='${key}']`)
    }
  })

  it('aendert im Saisonblock nur Farbwerte, kein Layout', () => {
    // Ein Saisonmodus, der Abstaende oder Anordnung veraendert, koennte die
    // Seite zerlegen. Erlaubt sind deshalb nur Eigenschaftsdefinitionen.
    const blocks = css.match(/\[data-season='[^']+'\][^{]*\{[^}]*\}/g) ?? []
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      const body = block.slice(block.indexOf('{') + 1, -1)
      for (const line of body.split('\n')) {
        const declaration = line.trim()
        if (declaration.length === 0 || declaration.startsWith('/*') || declaration.startsWith('*')) continue
        expect(declaration, `Unerwartete Regel im Saisonblock: ${declaration}`).toMatch(/^--[a-z0-9-]+:/)
      }
    }
  })

  it('beruecksichtigt reduzierte Bewegung', () => {
    expect(css).toContain('prefers-reduced-motion')
  })
})
