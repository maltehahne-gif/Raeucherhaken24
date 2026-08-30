import { cn } from '@/lib/utils/cn'

/**
 * Technische Daten als echte Tabelle mit Zeilenkoepfen.
 * Screenreader lesen dadurch "Länge: 20 cm" statt zweier loser Zellen.
 */
export interface Spec {
  key: string
  label: string
  value: string
  group: string
}

export function SpecTable({ specs, className }: { specs: Spec[]; className?: string }) {
  if (specs.length === 0) return null

  const groups = new Map<string, Spec[]>()
  for (const spec of specs) {
    const list = groups.get(spec.group) ?? []
    list.push(spec)
    groups.set(spec.group, list)
  }

  return (
    <div className={cn('space-y-6', className)}>
      {[...groups.entries()].map(([group, items]) => (
        <div key={group}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{group}</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {items.map((spec) => (
                <tr key={spec.key}>
                  <th scope="row" className="w-2/5 py-2.5 pr-4 text-left font-normal text-ink-muted">
                    {spec.label}
                  </th>
                  <td className="py-2.5 font-medium text-ink">{spec.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
