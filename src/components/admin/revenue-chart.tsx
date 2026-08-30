'use client'

import { useId, useMemo, useState } from 'react'
import { Table as TableIcon } from 'lucide-react'
import { formatPrice, formatNumber } from '@/lib/money'
import type { RevenuePoint } from '@/lib/server/analytics'
import { cn } from '@/lib/utils/cn'

/**
 * Tagesumsätze der letzten 30 Tage.
 *
 * Gestaltungsentscheidungen:
 *  - Eine Datenreihe, eine Farbe. Kein Farbverlauf nach Höhe — die Länge der
 *    Säule trägt die Information bereits.
 *  - Keine Legende: Der Titel benennt, was gezeigt wird.
 *  - Beschriftet wird nur der beste Tag; alles Übrige tragen Achse, Tooltip
 *    und die Tabellenansicht.
 *  - Die Tabellenansicht ist kein Zusatz, sondern der barrierefreie Zugang zu
 *    denselben Zahlen.
 */

const CHART_HEIGHT = 190
const AXIS_BAND = 22
const BAR_MAX_WIDTH = 24
const BAR_GAP = 2

export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()

  const { max, ticks, total, bestIndex } = useMemo(() => {
    const values = points.map((p) => p.revenueCents)
    const rawMax = Math.max(...values, 0)
    const niceMax = niceCeiling(rawMax)
    return {
      max: niceMax,
      ticks: buildTicks(niceMax),
      total: values.reduce((a, b) => a + b, 0),
      bestIndex: rawMax > 0 ? values.indexOf(rawMax) : -1,
    }
  }, [points])

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">Noch keine Umsatzdaten vorhanden.</p>
  }

  const slotPercent = 100 / points.length
  const activePoint = hovered !== null ? points[hovered] : null

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Summe:{' '}
          <strong className="tabular font-semibold text-ink">{formatPrice(total)}</strong>
        </p>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          <TableIcon className="size-3.5" aria-hidden="true" />
          {showTable ? 'Tabelle ausblenden' : 'Als Tabelle anzeigen'}
        </button>
      </div>

      <div className="relative mt-4">
        {/* Werteachse */}
        <div
          className="absolute inset-y-0 left-0 w-14 pr-2"
          style={{ bottom: AXIS_BAND }}
          aria-hidden="true"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="tabular absolute right-2 -translate-y-1/2 text-2xs text-ink-faint"
              style={{ top: `${(1 - tick / max) * CHART_HEIGHT}px` }}
            >
              {tick === 0 ? '0' : compactEuro(tick)}
            </span>
          ))}
        </div>

        <div className="ml-14">
          {/* Gitternetz — hauchfein, einfarbig, nie gestrichelt */}
          <div className="relative" style={{ height: CHART_HEIGHT }}>
            {ticks.map((tick) => (
              <div
                key={tick}
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-[var(--border-subtle)]"
                style={{ top: `${(1 - tick / max) * CHART_HEIGHT}px` }}
              />
            ))}

            {/*
              Die Säulenfläche ist rein darstellend: Sie trägt keine Information,
              die nicht auch in der Tabelle darunter steht. Deshalb ist sie für
              Hilfstechnik ausgeblendet — sonst entstünden dreißig Tabstopps ohne
              eigenen Nutzen. Der barrierefreie Zugang zu denselben Zahlen ist
              die Tabellenansicht.
            */}
            <div className="absolute inset-0 flex items-end" aria-hidden="true">
              {points.map((point, index) => {
                const height = max > 0 ? (point.revenueCents / max) * CHART_HEIGHT : 0
                const isHovered = hovered === index
                return (
                  <div
                    key={point.date}
                    className="relative flex h-full items-end justify-center"
                    style={{ width: `${slotPercent}%` }}
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setHovered(isHovered ? null : index)}
                  >
                    <span
                      className={cn(
                        'relative rounded-t-[4px] transition-opacity duration-150',
                        point.revenueCents > 0
                          ? isHovered
                            ? 'bg-[var(--accent-hover)]'
                            : 'bg-[var(--accent)]'
                          : 'bg-steel-200',
                      )}
                      style={{
                        height: `${Math.max(height, point.revenueCents > 0 ? 3 : 1)}px`,
                        width: `calc(100% - ${BAR_GAP}px)`,
                        maxWidth: BAR_MAX_WIDTH,
                      }}
                    />
                  </div>
                )
              })}
            </div>

            {/* Beschriftet wird nur der beste Tag */}
            {bestIndex >= 0 && hovered === null && (
              <span
                aria-hidden="true"
                className="tabular pointer-events-none absolute -translate-x-1/2 -translate-y-full pb-1 text-2xs font-semibold text-ink"
                style={{
                  left: `${(bestIndex + 0.5) * slotPercent}%`,
                  top: `${(1 - points[bestIndex].revenueCents / max) * CHART_HEIGHT}px`,
                }}
              >
                {compactEuro(points[bestIndex].revenueCents)}
              </span>
            )}

            {/* Tooltip */}
            {activePoint && (
              <div
                role="status"
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-steel-900 px-2.5 py-1.5 text-2xs whitespace-nowrap text-steel-50 shadow-[var(--shadow-raised)]"
                style={{
                  left: `${Math.min(Math.max((hovered! + 0.5) * slotPercent, 8), 92)}%`,
                  top: `${Math.max((1 - activePoint.revenueCents / max) * CHART_HEIGHT - 6, 0)}px`,
                }}
              >
                <span className="block font-semibold">{activePoint.label}</span>
                <span className="tabular block">{formatPrice(activePoint.revenueCents)}</span>
                <span className="block text-steel-400">
                  {formatNumber(activePoint.orderCount)}{' '}
                  {activePoint.orderCount === 1 ? 'Bestellung' : 'Bestellungen'}
                </span>
              </div>
            )}
          </div>

          {/* Zeitachse: nur jedes fünfte Datum, sonst überlagern sich die Labels */}
          <div className="flex" style={{ height: AXIS_BAND }} aria-hidden="true">
            {points.map((point, index) => (
              <span
                key={point.date}
                className="tabular pt-1.5 text-center text-2xs text-ink-faint"
                style={{ width: `${slotPercent}%` }}
              >
                {index % 5 === 0 ? point.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabellenansicht — derselbe Datensatz, ohne Farb- oder Formwahrnehmung */}
      <div id={tableId} hidden={!showTable} className="scroll-area mt-4 max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Tagesumsätze der letzten 30 Tage</caption>
          <thead className="sticky top-0 bg-[var(--surface-raised)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th scope="col" className="py-2 text-left text-2xs font-semibold tracking-wide text-ink-muted uppercase">
                Datum
              </th>
              <th scope="col" className="py-2 text-right text-2xs font-semibold tracking-wide text-ink-muted uppercase">
                Bestellungen
              </th>
              <th scope="col" className="py-2 text-right text-2xs font-semibold tracking-wide text-ink-muted uppercase">
                Umsatz
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {points.map((point) => (
              <tr key={point.date}>
                <th scope="row" className="py-1.5 text-left font-normal text-ink-muted">
                  {point.label}
                </th>
                <td className="tabular py-1.5 text-right">{formatNumber(point.orderCount)}</td>
                <td className="tabular py-1.5 text-right font-medium">{formatPrice(point.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Rundet die Achsenobergrenze auf einen glatten Wert auf. */
function niceCeiling(valueCents: number): number {
  if (valueCents <= 0) return 10_000
  const magnitude = 10 ** Math.floor(Math.log10(valueCents))
  const normalized = valueCents / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function buildTicks(max: number): number[] {
  return [0, max * 0.25, max * 0.5, max * 0.75, max].map((t) => Math.round(t))
}

/** Kompakte Euro-Angabe für die Achse: 1.250 € statt 1.250,00 €. */
function compactEuro(cents: number): string {
  const euro = cents / 100
  if (euro >= 1000) {
    return `${(euro / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} T€`
  }
  return `${euro.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`
}
