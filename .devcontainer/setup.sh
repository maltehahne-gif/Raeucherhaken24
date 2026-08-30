#!/usr/bin/env bash
#
# Einrichtung des Entwicklungscontainers (GitHub Codespaces oder Dev Container).
#
# Drei Dinge fehlen in einem frischen Klon zwangslaeufig, weil sie nicht ins
# Repository gehoeren:
#
#   1. .env             — enthaelt Konfiguration und Geheimnisse
#   2. der Prisma-Client — wird aus dem Schema erzeugt, nicht eingecheckt
#   3. prisma/dev.db     — die SQLite-Datei mit den Beispieldaten
#
# Ohne sie startet der Server zwar, aber jede Seite laeuft auf einen Fehler.
# Dieses Skript legt alle drei an.

set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Abhängigkeiten installieren"
npm ci --no-audit --no-fund

if [ ! -f .env ]; then
  echo "→ .env aus .env.example anlegen"
  cp .env.example .env

  # Der Pepper pseudonymisiert IP-Adressen. Ein fester Wert aus der Vorlage
  # waere in jedem Container derselbe und damit wertlos.
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
  node - "$SECRET" <<'NODE'
const fs = require('node:fs')
const secret = process.argv[2]
const file = '.env'
const content = fs
  .readFileSync(file, 'utf8')
  .replace(/^IP_HASH_SECRET=.*$/m, `IP_HASH_SECRET="${secret}"`)
fs.writeFileSync(file, content)
NODE

  # In Codespaces ist der Shop nicht unter localhost erreichbar, sondern unter
  # der weitergeleiteten Adresse. Canonical-URLs, Sitemap und Open Graph
  # muessen darauf zeigen, sonst verweisen sie ins Leere.
  if [ -n "${CODESPACE_NAME:-}" ]; then
    DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
    URL="https://${CODESPACE_NAME}-3000.${DOMAIN}"
    echo "→ NEXT_PUBLIC_SITE_URL auf ${URL} setzen"
    node - "$URL" <<'NODE'
const fs = require('node:fs')
const url = process.argv[2]
const file = '.env'
const content = fs
  .readFileSync(file, 'utf8')
  .replace(/^NEXT_PUBLIC_SITE_URL=.*$/m, `NEXT_PUBLIC_SITE_URL="${url}"`)
fs.writeFileSync(file, content)
NODE
  fi
else
  echo "→ .env ist vorhanden und bleibt unverändert"
fi

echo "→ Prisma-Client erzeugen, Datenbank anlegen und mit Beispieldaten füllen"
npm run setup

cat <<'MSG'

Fertig. Starten mit:

    npm run dev

Die Seite erscheint NICHT unter localhost, sondern unter der weitergeleiteten
Adresse: Reiter "PORTS" -> Zeile 3000 -> Weltkugel-Symbol (Open in Browser).

Verwaltungsbereich: /admin/anmelden
    inhaber@raeucherhaken24.example / RaeucherhakenDemo2024!
    (Demozugang, ausschliesslich fuer die Entwicklung)

MSG
