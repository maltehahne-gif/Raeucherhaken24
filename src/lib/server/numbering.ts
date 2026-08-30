import { prisma } from '@/lib/db'

/**
 * Fortlaufende, fachlich lesbare Nummernkreise.
 *
 * Die Zaehler liegen in der Setting-Tabelle und werden ausschliesslich
 * innerhalb einer Transaktion hochgezaehlt. Der Aufrufer muss die Transaktion
 * bereitstellen, damit Nummer und Datensatz gemeinsam entstehen oder gemeinsam
 * zurueckgerollt werden.
 */

type Tx = Pick<typeof prisma, 'setting'>

const COUNTER_KEYS = {
  order: 'counter:order',
  customer: 'counter:customer',
  ticket: 'counter:ticket',
  project: 'counter:project',
} as const

export type CounterKind = keyof typeof COUNTER_KEYS

const PREFIXES: Record<CounterKind, string> = {
  order: 'RH',
  customer: 'K',
  ticket: 'S',
  project: 'P',
}

const START_VALUES: Record<CounterKind, number> = {
  order: 10_000,
  customer: 1_000,
  ticket: 1_000,
  project: 100,
}

/**
 * Erhoeht den Zaehler und liefert die naechste Nummer.
 * Muss innerhalb einer Transaktion aufgerufen werden.
 */
export async function nextNumber(tx: Tx, kind: CounterKind, year: number): Promise<string> {
  const key = COUNTER_KEYS[kind]
  const current = await tx.setting.findUnique({ where: { key } })
  const next = current ? Number.parseInt(current.value, 10) + 1 : START_VALUES[kind] + 1

  await tx.setting.upsert({
    where: { key },
    create: { key, value: String(next) },
    update: { value: String(next) },
  })

  return `${PREFIXES[kind]}-${year}-${next}`
}
