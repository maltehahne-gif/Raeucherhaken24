import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

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
    setupFiles: ['tests/setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
