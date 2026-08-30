import { cn } from '@/lib/utils/cn'

export interface TocItem {
  /** id des Zielabschnitts auf derselben Seite. */
  id: string
  label: string
}

/**
 * Inhaltsverzeichnis eines Artikels.
 *
 * Bewusst eine Server Component aus reinen Sprungmarken: Sie funktioniert ohne
 * JavaScript, ist von Suchmaschinen lesbar und laesst sich per Tastatur
 * bedienen. Eine mitlaufende Markierung des aktiven Abschnitts waere ein
 * hoher Preis in Skriptgroesse fuer einen Beitrag, der ohnehin am Stueck
 * gelesen wird.
 *
 * Die Zielabschnitte tragen `scroll-mt-*`, damit die klebende Kopfzeile die
 * angesprungene Ueberschrift nicht verdeckt.
 */
export function ArticleToc({
  items,
  className,
  title = 'Inhalt dieses Beitrags',
}: {
  items: TocItem[]
  className?: string
  title?: string
}) {
  if (items.length < 2) return null

  return (
    <nav
      aria-label={title}
      className={cn(
        'rounded-xl border border-[var(--border-subtle)] bg-paper-sunken/60 px-4 py-4',
        className,
      )}
    >
      <p className="text-2xs font-semibold tracking-[0.12em] text-ink-faint uppercase">{title}</p>
      <ol className="mt-2.5 space-y-0.5">
        {items.map((item, index) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="flex min-h-10 items-baseline gap-2.5 rounded-md px-1.5 py-2 text-sm leading-snug text-ink-soft transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--accent)]"
            >
              <span className="tabular shrink-0 text-xs font-semibold text-ink-faint" aria-hidden="true">
                {index + 1}
              </span>
              <span className="min-w-0">{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
