/**
 * Läuft je Testdatei und setzt nur Umgebungswerte.
 *
 * Die Testdatenbank selbst wird in tests/global-setup.ts genau einmal für den
 * gesamten Lauf angelegt — siehe die Begründung dort.
 */

// Fester Pepper, damit Hashes im Test reproduzierbar sind.
process.env.IP_HASH_SECRET = 'test-pepper-nicht-fuer-produktion'

export {}
