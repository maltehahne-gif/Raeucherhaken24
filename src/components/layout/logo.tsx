import { cn } from '@/lib/utils/cn'

/**
 * Wortmarke mit Hakensymbol.
 * Als Inline-SVG, damit es die Akzentfarbe des jeweiligen Saisonmodus
 * uebernimmt und ohne zusaetzliche Anfrage geladen wird.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 210 32"
      role="img"
      aria-label="Räucherhaken24"
      className={cn('text-ink', className)}
    >
      {/* Haken: senkrechter Schaft mit Oese oben und gebogener Spitze unten,
          darueber ein Glutfunke — die Wiederkehr des Rauchhaus-Motivs. */}
      <circle cx="16.5" cy="2.4" r="1.15" className="text-[var(--color-ember-400)]" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
        <path d="M11 5.5a3.2 3.2 0 1 1 0 6.4" className="text-[var(--accent)]" stroke="currentColor" />
        <path d="M11 11.9v9.4" />
        <path
          d="M11 21.3c0 3.4 2.5 5.6 5.2 5.6 2.6 0 4.6-1.9 4.6-4.3"
          className="text-[var(--accent)]"
          stroke="currentColor"
        />
      </g>
      <text
        x="32"
        y="23"
        className="font-display"
        fontSize="20"
        fontWeight="600"
        letterSpacing="-0.4"
        fill="currentColor"
      >
        Räucherhaken
      </text>
      <text x="186" y="23" fontSize="20" fontWeight="600" fill="currentColor" opacity="0.42">
        24
      </text>
    </svg>
  )
}
