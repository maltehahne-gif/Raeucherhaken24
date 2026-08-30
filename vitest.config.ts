import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

/*
 * Absoluter Pfad zur Testdatenbank.
 * Prisma loest relative SQLite-Pfade gegen den Ort des Schemas auf, nicht
 * gegen das Arbeitsverzeichnis — ein relativer Pfad landete deshalb in
 * prisma/prisma/. Der absolute Pfad ist eindeutig.
 */
const TEST_DB_URL = `file:${fileURLToPath(new URL('./prisma/test.db', import.meta.url))}`

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` wirft beim Import ausserhalb einer Server-Umgebung.
      // Im Testlauf wird es durch ein leeres Modul ersetzt; die Schutzwirkung
      // im Produktionsbundle bleibt davon unberuehrt.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Einmalig fuer den ganzen Lauf: legt die Testdatenbank an und raeumt sie ab.
    globalSetup: ['tests/global-setup.ts'],
    // Je Testdatei: nur Umgebungswerte.
    setupFiles: ['tests/setup.ts'],
    env: {
      // Integrationstests laufen niemals gegen die Entwicklungsdatenbank.
      DATABASE_URL: TEST_DB_URL,
    },
    hookTimeout: 60_000,
    testTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
