import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, afterAll } from 'vitest'

/**
 * Testumgebung.
 *
 * Integrationstests laufen gegen eine eigene SQLite-Datei, nicht gegen die
 * Entwicklungsdatenbank. Sie wird vor dem Lauf frisch aus dem Prisma-Schema
 * erzeugt und danach wieder entfernt — dadurch kann ein Testlauf keine
 * Entwicklungsdaten beschädigen und startet immer vom selben Zustand.
 */

const TEST_DB = join(process.cwd(), 'prisma', 'test.db')

process.env.DATABASE_URL = `file:${TEST_DB}`
// Fester Pepper, damit Hashes im Test reproduzierbar sind.
process.env.IP_HASH_SECRET = 'test-pepper-nicht-fuer-produktion'
// NODE_ENV setzt Vitest selbst auf 'test'; ein erneutes Zuweisen ist nicht erlaubt.

function removeTestDb() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const path = `${TEST_DB}${suffix}`
    if (existsSync(path)) rmSync(path, { force: true })
  }
}

beforeAll(() => {
  removeTestDb()
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: 'pipe',
  })
}, 120_000)

afterAll(() => {
  removeTestDb()
})
