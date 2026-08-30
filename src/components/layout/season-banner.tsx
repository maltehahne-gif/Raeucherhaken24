import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * Hinweisbanner ueber der Kopfzeile.
 * Farben kommen aus den Saison-Tokens, damit der Banner in jedem Modus
 * stimmig bleibt, ohne dass es Sondervarianten braucht.
 */
export function SeasonBanner({ text, link }: { text: string; link: string | null }) {
  const content = (
    <span className="flex items-center justify-center gap-2 text-center">
      <span className="text-xs leading-relaxed font-medium">{text}</span>
      {link && (
        <ArrowRight
          className="size-3.5 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      )}
    </span>
  )

  return (
    <div
      className="px-4 py-2.5"
      style={{ backgroundColor: 'var(--banner-bg)', color: 'var(--banner-fg)' }}
    >
      {link ? (
        <Link href={link} className="group container-page block hover:opacity-90">
          {content}
        </Link>
      ) : (
        <div className="container-page">{content}</div>
      )}
    </div>
  )
}
