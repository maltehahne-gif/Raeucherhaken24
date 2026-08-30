# Räucherhaken24

Onlineshop für professionellen Räucherbedarf: Räucherhaken und Fleischerhaken aus
Edelstahl, Räuchermehl, Räucherlaugen und Naturgewürze — mit Konfigurator,
Kaufberatung, Rezeptbereich und vollständigem Verwaltungsbereich.

---

## Inhalt

- [Schnellstart](#schnellstart)
- [Technischer Aufbau](#technischer-aufbau)
- [Architekturentscheidungen](#architekturentscheidungen)
- [Projektstruktur](#projektstruktur)
- [Datenbank](#datenbank)
- [Umgebungsvariablen](#umgebungsvariablen)
- [Tests](#tests)
- [Verwaltungsbereich](#verwaltungsbereich)
- [Sicherheit](#sicherheit)
- [Produktivbetrieb](#produktivbetrieb)
- [Offene externe Anbindungen](#offene-externe-anbindungen)

---

## Schnellstart

Voraussetzung: Node.js 20.9 oder neuer.

```bash
git clone <repository-url>
cd Raeucherhaken24
npm install

cp .env.example .env        # Werte anpassen, siehe unten
npm run setup               # Prisma-Client, Datenbank und Seed-Daten
npm run dev                 # http://localhost:3000
```

`npm run setup` fasst drei Schritte zusammen: `prisma generate`, `prisma db push`
und `prisma/seed.ts`. Nach dem Seed steht ein vollständiges Demo-Sortiment mit
rund 170 Artikeln, 16 Rezepten, 10 Wissensartikeln und 100 Beispielbestellungen
bereit.

Die Anmeldedaten für den Verwaltungsbereich gibt der Seed am Ende aus. Sie
gelten ausschließlich für die lokale Entwicklung — siehe
[Produktivbetrieb](#produktivbetrieb).

---

## Technischer Aufbau

| Bereich | Wahl | Begründung |
|---|---|---|
| Framework | Next.js 15, App Router | Server Components halten den Katalog ohne Client-JavaScript renderbar |
| Sprache | TypeScript (strict) | Preis- und Bestandslogik ist zu heikel für lose Typen |
| Datenbank | Prisma, SQLite in der Entwicklung | Kein Serverprozess nötig; das Schema ist PostgreSQL-tauglich |
| Gestaltung | Tailwind CSS 4 | Design-Tokens als CSS-Variablen — der Saisonmodus ändert nur Werte |
| Validierung | Zod | Ein Schema je Vorgang, serverseitig durchgesetzt |
| Tests | Vitest | Unit- und Integrationstests gegen eine echte Datenbank |
| Schrift | Inter, Fraunces über `next/font` | Wird zur Bauzeit geladen und selbst ausgeliefert |

Bewusst **nicht** eingesetzt: State-Management-Bibliothek, Komponentenbibliothek,
ORM-Zusatzschichten, Formularbibliothek, Animationsbibliothek. Jede dieser
Abhängigkeiten hätte Gewicht gekostet, ohne ein Problem zu lösen, das der Shop
tatsächlich hat.

---

## Architekturentscheidungen

### Preise entstehen ausschließlich auf dem Server

`src/lib/server/pricing.ts` ist die einzige Stelle, an der ein Preis entsteht.
Warenkorb, Konfiguratorvorschau, Checkout und Bestellanlage rufen dieselben
Funktionen auf. Der Browser sendet nur Absichten — Produkt, Menge,
Optionsschlüssel, Gutscheincode — und bekommt das Ergebnis zurück.

Die Reihenfolge ist festgelegt und getestet:

1. Basispreis beziehungsweise Variantenpreis
2. Konfigurator-Optionen: erst absolute Aufschläge, dann prozentuale
3. Aktionspreis, falls zeitlich gültig und günstiger
4. Mengenstaffel auf den Stückpreis
5. Gutschein auf die Warenkorbsumme
6. Versandkosten
7. Gesamtsumme und enthaltene Umsatzsteuer

Der Konfigurator zeigt eine Live-Vorschau, weil er dieselbe reine Funktion
(`priceLine`) im Browser aufruft. Verbindlich ist trotzdem allein die
Serverberechnung: Beim Hinzufügen bewertet die API die übermittelten
Optionsschlüssel erneut gegen die Stammdaten und weist unbekannte Kombinationen
ab.

### Geld ist immer eine ganze Zahl

Alle Beträge sind Cent als `Int`. Es gibt keine Gleitkomma-Arithmetik auf Geld.
Rabatte werden über `distribute()` nach dem Largest-Remainder-Verfahren
verlustfrei auf die Positionen verteilt, damit Steueranteile je Steuersatz
korrekt bleiben. Gewichte sind Gramm, Längen Millimeter.

### Overselling wird durch bedingte Updates verhindert

Der Bestandsabzug läuft als `UPDATE … WHERE stock >= menge`. Ändert die
Anweisung null Zeilen, war die Ware zwischenzeitlich vergriffen, und die
umgebende Transaktion bricht ab. Das funktioniert unabhängig vom
Isolationslevel der Datenbank und ohne Sperren.

Jede Bestandsänderung erzeugt genau einen Eintrag in `InventoryMovement`.
Damit ist jeder Bestand nachvollziehbar hergeleitet und nicht nur behauptet.

### Doppelbestellungen sind ausgeschlossen

Das Checkout-Formular erzeugt einmalig einen Idempotenzschlüssel. Ein zweiter
Klick, ein Netzwerk-Retry oder ein doppelt abgeschickter Request liefern dieselbe
Bestellung zurück, statt eine zweite anzulegen — abgesichert über einen
eindeutigen Index, nicht über eine Prüfung im Anwendungscode.

### Filterzustand lebt in der URL

Kategoriefilter, Sortierung und Seitenzahl stehen vollständig in der URL. Die
Filter selbst sind Links, die Sortierung ist ein `<select>` mit
Formular-Rückfall. Dadurch funktionieren Zurück-Taste, Mittelklick, Teilen und
Lesezeichen ohne eigenen Verlaufszustand — und der Katalog rendert ohne
Client-JavaScript.

### Der Saisonmodus ändert nur Token

Neun Saisonmodi (Advent, Nikolaus, Weihnachten, Silvester, Neujahr, Ostern,
Black Week, Black Friday, Standard) setzen ausschließlich CSS-Variablen unter
`[data-season="…"]` in `src/app/globals.css` neu. Es gibt keine saisonalen
Sonderkomponenten und keine Layoutumbauten — dadurch bleibt jede Saison
automatisch konsistent, und ein neuer Modus ist ein Block CSS.

### Empfehlungen stammen immer aus dem echten Katalog

Der Räucherberater „Smoky“ arbeitet in drei getrennten Schritten: verstehen,
belegen, formulieren. Das Beratungsprofil entsteht aus dem Gespräch, die Artikel
ausschließlich aus einer Datenbankabfrage. Ist ein KI-Anbieter konfiguriert,
erhält das Modell genau diese Artikel als einzige zulässige Grundlage und
schreibt nur den Fließtext; die angezeigten Produktkarten stammen immer aus der
eigenen Abfrage. Ein Modell kann damit weder einen Artikel erfinden noch einen
Preis verändern. Ohne Anbieter formuliert die Anwendung selbst aus Bausteinen —
die Beratung fällt nie aus.

---

## Projektstruktur

```
prisma/
  schema.prisma          Datenmodell (30 Entitäten)
  seed.ts                Seed-Einstieg
  seed/                  Kategorien, Konfigurator, Marketing, Hilfsfunktionen
  seed-data/             Redaktionelle Inhalte als JSON (austauschbar)
scripts/
  create-admin.ts        Verwaltungskonto anlegen
  generate-product-images.ts  Erzeugt die Produktabbildungen
  smoke-test.ts          Ablaufprüfung gegen den laufenden Server
src/
  app/
    (shop)/              Storefront
    admin/(dashboard)/   Verwaltungsbereich (Anmeldung liegt außerhalb)
    api/                 Route Handler
    globals.css          Design-Tokens und Saisonmodi
  components/
    ui/                  Bausteine: Button, Feld, Dialog, Tabelle, Zustände
    layout/ product/ cart/ catalog/ admin/ advisor/ recipe/ project/
  lib/
    money.ts             Cent-Arithmetik
    domain/enums.ts      Alle Status- und Typwerte an einer Stelle
    server/              Preise, Bestellungen, Lager, Gutscheine, Auth, Suche
    validation/          Zod-Schemata
    seo/                 Metadaten und strukturierte Daten
tests/                   Vitest
```

---

## Datenbank

### Entwicklung

SQLite, keine Installation nötig:

```env
DATABASE_URL="file:./dev.db"
```

Nützliche Befehle:

```bash
npm run db:push        # Schema ohne Migration anwenden (Entwicklung)
npm run db:migrate     # Migration erzeugen und anwenden
npm run db:seed        # Demodaten neu einspielen
npm run db:reset       # Datenbank leeren und neu aufbauen
npm run db:studio      # Prisma Studio
```

### PostgreSQL für den Produktivbetrieb

Das Schema ist portierbar. Nötige Schritte:

1. In `prisma/schema.prisma` den Provider umstellen:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. `DATABASE_URL` auf die Postgres-Verbindung setzen.
3. `npx prisma migrate dev --name init` ausführen.

Optional, aber empfohlen: Die als `String` geführten Status- und Typfelder lassen
sich unter PostgreSQL in echte `enum`-Typen überführen. Die erlaubten Werte
stehen vollständig in `src/lib/domain/enums.ts`. SQLite unterstützt keine
Prisma-Enums — daher die jetzige Lösung.

Ein Hinweis zum Bestandsabzug: `decrementStock` nutzt bewusst eine
SQL-Anweisung mit Bedingung. Unter PostgreSQL funktioniert sie unverändert.

### Seed-Daten

Die redaktionellen Inhalte liegen als JSON in `prisma/seed-data/`
(`catalog.json`, `recipes.json`, `articles.json`) und lassen sich vollständig
durch echte Produktdaten ersetzen, ohne die Anlagelogik anzufassen.

Der Seed ist deterministisch: Bestände, Bewertungen und Bestelldaten entstehen
aus einem festen Startwert, damit ein erneuter Lauf dieselben Daten erzeugt und
Tests reproduzierbar bleiben.

Bewusst enthalten, damit sich Fehlerpfade überhaupt prüfen lassen:
ausverkaufte Artikel, eine abgelaufene und eine noch nicht gestartete Aktion,
ein abgelaufener und ein ausgeschöpfter Gutschein.

---

## Umgebungsvariablen

Alle Variablen sind in `.env.example` dokumentiert. **Die `.env` gehört nicht ins
Repository** — sie steht in `.gitignore`.

### Erforderlich

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Datenbankverbindung |
| `NEXT_PUBLIC_SITE_URL` | Öffentliche Basis-URL, ohne abschließenden Schrägstrich. Grundlage für Canonical-URLs, Sitemap, Open Graph und strukturierte Daten |
| `IP_HASH_SECRET` | Pepper für die Pseudonymisierung von IP-Adressen. In Produktion zwingend durch einen langen Zufallswert ersetzen |
| `UPLOAD_DIR` | Ablage für Datei-Uploads. Muss **außerhalb** von `public/` liegen |

Zufallswert erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Optional

| Variable | Wirkung, wenn nicht gesetzt |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | E-Mails werden nicht versendet |
| `MAIL_FROM`, `MAIL_SUPPORT` | Absender- und Serviceadresse in der Oberfläche |
| `ANTHROPIC_API_KEY` | Smoky formuliert regelbasiert statt mit einem Sprachmodell |
| `SMOKY_MODEL` | Modellauswahl für Smoky |

---

## Tests

```bash
npm test              # Alle Tests einmalig
npm run test:watch    # Beobachtungsmodus
npm run typecheck     # TypeScript ohne Ausgabe
npm run lint          # ESLint
```

Die Integrationstests laufen gegen eine eigene SQLite-Datei
(`prisma/test.db`), die vor dem Lauf aus dem Schema erzeugt und danach entfernt
wird. Ein Testlauf kann die Entwicklungsdatenbank nicht beschädigen.

Abgedeckt sind die Bereiche, in denen ein Fehler unmittelbar Geld oder Ware
kostet:

| Datei | Prüft |
|---|---|
| `tests/money.test.ts` | Rundung, Basispunkte, verlustfreie Verteilung von Rabatten |
| `tests/pricing.test.ts` | Preis-Engine: Staffeln, Aufschläge, Aktionen, Versand, Steuer |
| `tests/orders.test.ts` | Bestellung, Bestand, Idempotenz, Statuswechsel, Gutscheineinlösung |
| `tests/catalog.test.ts` | Filter, Sortierung, Facetten, Seitenaufteilung |
| `tests/search.test.ts` | Umlaute, Tippfehler, Synonyme, Artikelnummern |
| `tests/advisor.test.ts` | Beratung: passende Empfehlung, nur vorhandene Artikel |
| `tests/security.test.ts` | Passwörter, Sitzungen, CSRF, Rechte, Uploads, Ratenbegrenzung |
| `tests/validation.test.ts` | Umrechnung Formularfeld ↔ Speicherwert, fachliche Regeln |
| `tests/theme.test.ts` | Zu jedem Saisonmodus existiert Gestaltung |

Gegen den laufenden Server prüfen zusätzlich drei Skripte die tatsächliche
Wirkung — nicht nur, ob eine Antwort kommt:

```bash
npm run dev            # in einem Terminal
npm run check:flow     # Warenkorb → Gutschein → Bestellung, CSRF, Header
npm run check:admin    # Verwaltungs-Schnittstellen inkl. Zugriffsschutz
npm run check:pages    # Erreichbarkeit aller Seiten
npm run check:a11y     # Barrierefreiheits-Stichproben (benötigt Chromium)
```

`npm run check:a11y` erwartet einen Chromium mit offenem Debug-Port:

```bash
/opt/pw-browsers/chromium-*/chrome-linux/chrome \
  --headless --no-sandbox --remote-debugging-port=9333 about:blank &
```

---

## Verwaltungsbereich

Erreichbar unter `/admin`, Anmeldung unter `/admin/anmelden`.

Ein erstes Konto anlegen:

```bash
npm run admin:create
```

Das Skript fragt E-Mail, Name, Rolle und Passwort ab und legt das Konto mit
scrypt-Hash an.

### Rollen

| Rolle | Umfang |
|---|---|
| Inhaber | Alle Rechte einschließlich Rollenverwaltung |
| Administration | Vollzugriff auf den Shopbetrieb, ohne Änderung der Rollenrechte |
| Shop-Management | Katalog, Lager, Bestellungen, Kunden, Marketing |
| Lager & Versand | Kommissionierung, Versand, Bestandsbuchungen |
| Kundenservice | Supportanfragen, Kundenakten, Einsicht in Bestellungen |

Die Rechte sind feingranular (`bereich:aktion`) und in
`src/lib/server/permissions.ts` definiert. Die Navigation blendet Punkte ohne
Berechtigung aus — die eigentliche Absicherung liegt in jeder Route und jeder
API, nicht in der ausgeblendeten Navigation.

---

## Sicherheit

| Bereich | Umsetzung |
|---|---|
| Passwörter | scrypt aus der Node-Standardbibliothek, Salz je Konto, zeitkonstanter Vergleich |
| Sitzungen | Opake Zufallstoken; in der Datenbank liegt nur der SHA-256-Hash |
| Session Fixation | Nach erfolgreichem Login werden alle bestehenden Sitzungen des Kontos verworfen und eine neue vergeben |
| Cookies | HttpOnly, SameSite=Lax, unter HTTPS zusätzlich Secure |
| CSRF | Double-Submit-Token plus Origin- und Referer-Prüfung bei jeder zustandsändernden Anfrage |
| Ratenbegrenzung | Login datenbankgestützt je IP und je Konto; Suche, Kontakt, Checkout, Beratung und Uploads prozesslokal |
| Kontenaufzählung | Unbekanntes Konto und falsches Passwort liefern dieselbe Meldung und vergleichen beide einen Hash |
| SQL | Ausschließlich parametrisierte Abfragen über Prisma |
| Eingaben | Zod-Schemata, serverseitig durchgesetzt; Formularfehler feldbezogen auf Deutsch |
| Ausgaben | React escapet standardmäßig; JSON-LD wird zusätzlich maskiert |
| CSP | Nonce je Anfrage, `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'` |
| Weitere Header | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` |
| Uploads | Prüfung am Dateiinhalt (magische Bytes), nicht am gemeldeten MIME-Typ; serverseitig vergebener Dateiname; Ablage außerhalb von `public/`; Download nur als `attachment` mit neutralem Content-Type |
| Protokoll | Sicherheitsrelevante Admin-Aktionen landen im Audit-Log; IP-Adressen nur pseudonymisiert |
| Fehlerausgabe | Endnutzer sehen ausschließlich verständliche Meldungen, technische Details bleiben im Serverlog |

### Bekannte Einschränkung

Für Styles enthält die CSP derzeit `'unsafe-inline'`. Next.js und die
Schriftoptimierung erzeugen Inline-Styles ohne Nonce. Das ist die übliche
Einschränkung und deutlich weniger kritisch als bei Skripten — für Skripte
kommt die Anwendung ohne `'unsafe-inline'` aus.

---

## Produktivbetrieb

### Vor dem ersten Start

```bash
npm run build      # prisma generate + next build
npm start
```

### Checkliste

- [ ] `DATABASE_URL` auf PostgreSQL umgestellt, Provider im Schema angepasst
- [ ] `npx prisma migrate deploy` ausgeführt
- [ ] `IP_HASH_SECRET` durch einen langen Zufallswert ersetzt
- [ ] `NEXT_PUBLIC_SITE_URL` auf die echte Domain gesetzt
- [ ] `UPLOAD_DIR` auf ein beschreibbares Verzeichnis außerhalb von `public/` gesetzt und in die Datensicherung aufgenommen
- [ ] **Demokonten gelöscht**, eigene Konten über `npm run admin:create` angelegt
- [ ] **Demo-Gutscheine geprüft oder deaktiviert** (`RAUCHSTART10`, `HAKEN5`, `VERSANDFREI`, `PROFI15` und die beiden Testcodes)
- [ ] Seed-Produktdaten durch echte Artikel ersetzt
- [ ] **Rechtstexte ergänzt und juristisch geprüft**: Impressum, Datenschutz, AGB, Widerruf. Die Seiten enthalten dafür deutlich gekennzeichnete Platzhalter
- [ ] Versandkonditionen in `DEFAULT_SHIPPING_RULE` (`src/lib/server/pricing.ts`) geprüft
- [ ] HTTPS eingerichtet — sonst greifen Secure-Cookies und HSTS nicht
- [ ] Datensicherung für Datenbank und Uploadverzeichnis eingerichtet

### Wiederkehrende Aufgaben

Abgelaufene Warenkörbe und Sitzungen werden nicht automatisch entfernt.
Empfehlenswert ist ein täglicher Aufruf von `pruneCarts()`
(`src/lib/server/cart.ts`), `pruneSessions()` und `pruneLoginAttempts()`
(`src/lib/server/auth.ts` beziehungsweise `rate-limit.ts`) — etwa über einen
Cron-Job auf einen geschützten Endpunkt.

---

## Offene externe Anbindungen

Die Anwendung läuft ohne diese Dienste vollständig. Für den Produktivbetrieb
fehlen jeweils nur Vertrag und Zugangsdaten — die Abstraktionsschicht ist
vorhanden.

### Zahlung

Umgesetzt ist Vorkasse per Überweisung. Der Zahlungsstatus wird getrennt vom
Bearbeitungsstatus geführt und lässt sich über `changePaymentStatus()`
(`src/lib/server/orders.ts`) setzen — einschließlich Teil- und Vollerstattung
mit optionaler Rückbuchung ins Lager.

Für Kartenzahlung, PayPal oder Kauf auf Rechnung ist anzubinden: ein
Zahlungsdienstleister, ein Webhook-Endpunkt, der `changePaymentStatus` aufruft,
und die Absicherung dieses Endpunkts über die Signaturprüfung des Anbieters.
**Es sind derzeit keine Zahlungsdaten im Umlauf** — die Anwendung erhebt und
speichert keine Karten- oder Kontodaten.

### E-Mail

Es werden keine E-Mails versendet. Betroffen sind Bestellbestätigung,
Versandmitteilung und Benachrichtigung bei neuen Supportanfragen. Nötig sind
SMTP-Zugangsdaten und eine Versandschicht; die Auslösepunkte sind die
Statuswechsel in `src/lib/server/orders.ts` und die Anlage eines
`SupportRequest`.

### Versanddienstleister

Sendungsnummer und Dienstleister werden je Bestellung erfasst, und der
Verfolgungslink wird aus `CARRIER_TRACKING_URLS`
(`src/lib/domain/enums.ts`) erzeugt. Nicht angebunden ist die automatische
Labelerstellung — dafür wäre die API des jeweiligen Dienstleisters nötig.

### Sprachmodell für Smoky

Ohne `ANTHROPIC_API_KEY` arbeitet der Berater regelbasiert auf dem echten
Katalog und liefert vollständige Empfehlungen. Mit Schlüssel formuliert ein
Modell die Antwort — auf Grundlage genau der Artikel, die die Anwendung zuvor
gefunden hat.

### Produktfotografie

Bis echte Fotos vorliegen, zeigt der Shop generierte technische
Strichzeichnungen (`scripts/generate-product-images.ts`). Sie geben sich nicht
als Fotos aus. Echte Bilder werden über `ProductImage` gepflegt und ersetzen die
Zeichnungen ohne Codeänderung.

---

## Lizenz und Inhalte

Die Produkttexte, Rezepte und Wissensartikel in `prisma/seed-data/` sind
Demoinhalte. Sie enthalten bewusst **keine** Zertifizierungen, Normnummern,
Herkunftsgarantien oder gesundheitsbezogenen Aussagen — solche Angaben sind
rechtlich verbindlich und müssen vom Betreiber verantwortet werden.
