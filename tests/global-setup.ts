import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Einmalige Einrichtung der Testdatenbank für den gesamten Lauf.
 *
 * Bewusst als globalSetup und nicht als setupFile: Ein setupFile läuft je
 * Testdatei. Da alle Dateien in einem Prozess laufen, würde das Löschen der
 * Datei zwischen zwei Dateien einem bereits geöffneten Prisma-Client den
 * Boden unter den Füßen wegziehen — die Verbindung zeigte dann auf eine
 * gelöschte Datei, und alle Abfragen liefen ins Leere.
 */

const TEST_DB = join(process.cwd(), 'prisma', 'test.db')
const TEST_DB_URL = `file:${TEST_DB}`

function removeTestDb() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const path = `${TEST_DB}${suffix}`
    if (existsSync(path)) rmSync(path, { force: true })
  }
}

export function setup() {
  removeTestDb()
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  })
}

export function teardown() {
  removeTestDb()
}
