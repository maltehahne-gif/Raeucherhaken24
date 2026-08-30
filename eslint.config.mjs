import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

/**
 * Lint-Regeln.
 *
 * `eslint-config-next` liegt noch im alten eslintrc-Format vor. FlatCompat
 * uebersetzt es in die Flat-Config von ESLint 9, damit `npm run lint` ohne
 * interaktive Rueckfrage durchlaeuft — auch in einer Pipeline ohne Terminal.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'prisma/migrations/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Ungenutzte Bezeichner sind ein Fehler, ausser sie sind mit einem
      // fuehrenden Unterstrich ausdruecklich als bewusst ungenutzt markiert.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // `any` hebelt die Typpruefung aus; im Zweifel `unknown` und eine Pruefung.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Pruef- und Pflegeskripte laufen ausserhalb der Anwendung.
    files: ['scripts/**/*.ts', 'prisma/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]

export default config
