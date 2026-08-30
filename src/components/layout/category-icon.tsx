import { Beef, Blend, Droplets, Flame, Leaf, Package, Ruler, Sprout } from 'lucide-react'

/**
 * Kategoriesymbole.
 *
 * Der Schlüssel steht in der Datenbank (Category.icon), damit sich Symbole im
 * Verwaltungsbereich pflegen lassen, ohne den Code anzufassen. Unbekannte
 * Schlüssel fallen auf ein neutrales Symbol zurück statt die Seite zu brechen.
 */
export function CategoryIcon({ name, className = 'size-5' }: { name: string | null; className?: string }) {
  switch (name) {
    case 'hook':
      return <HookGlyph className={className} />
    case 'beef':
      return <Beef className={className} aria-hidden="true" />
    case 'flame':
      return <Flame className={className} aria-hidden="true" />
    case 'droplets':
      return <Droplets className={className} aria-hidden="true" />
    case 'leaf':
      return <Leaf className={className} aria-hidden="true" />
    case 'sprout':
      return <Sprout className={className} aria-hidden="true" />
    case 'blend':
      return <Blend className={className} aria-hidden="true" />
    case 'salt':
      return <SaltGlyph className={className} />
    case 'ruler':
      return <Ruler className={className} aria-hidden="true" />
    default:
      return <Package className={className} aria-hidden="true" />
  }
}

/** Eigener Haken, weil es dafür kein passendes Symbol in der Bibliothek gibt. */
function HookGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="4.4" r="2.2" />
      <path d="M12 6.6v7.6" />
      <path d="M12 14.2c0 3.1 2.2 4.9 4.4 4.9 2 0 3.4-1.4 3.4-3.2" />
    </svg>
  )
}

/** Salzstreuer — ebenfalls nicht in der Bibliothek enthalten. */
function SaltGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 9h8l1 11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1Z" />
      <path d="M9 9a3 3 0 0 1 6 0" />
      <path d="M10.5 5.2v.9M12 4v1.2M13.5 5.2v.9" />
    </svg>
  )
}
