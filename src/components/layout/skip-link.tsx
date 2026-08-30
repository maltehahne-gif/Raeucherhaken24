/**
 * Sprunglink zum Hauptinhalt. Fuer Tastaturnutzende sichtbar, sobald er
 * den Fokus erhaelt — davor optisch ausgeblendet, aber im DOM vorhanden.
 */
export function SkipLink() {
  return (
    <a
      href="#hauptinhalt"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-[var(--surface-raised)] focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-ink focus:shadow-[var(--shadow-overlay)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--focus-ring)]"
    >
      Zum Hauptinhalt springen
    </a>
  )
}
