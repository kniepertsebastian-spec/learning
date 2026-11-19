# Knowvia

**Capture Knowledge. Empower People. Strengthen Business.**

Adaptive Lernplattform für Zertifikate und Weiterbildung (PWA). Next.js, Postgres (Drizzle ORM),
Auth.js, Inhaltsgenerierung mit Google Gemini.

## Dokumentation

**Planung**
- Was noch offen ist: [docs/roadmaps/ROADMAP.md](docs/roadmaps/ROADMAP.md) (die eine aktuelle Roadmap)
- Frühere Roadmaps und Reviews: [docs/roadmaps/archiv/](docs/roadmaps/archiv/README.md). Code-Kommentare zitieren
  sie mit Namen (`roadmap.md`, `roadmap3.md`, `roadmap_pruefer.md` …), deshalb bleiben sie dort stehen.

**Betrieb**
- Deployment mit Docker Compose: [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)
- Server von alter Compose-Datei absichern und aktualisieren: [docs/DEPLOY-UPDATE.md](docs/DEPLOY-UPDATE.md)
  (Prüfskript: `scripts/check-server.sh`)
- Backup und Wiederanlauf: [docs/BACKUP.md](docs/BACKUP.md)
- Überwachung per E-Mail: [docs/MONITORING.md](docs/MONITORING.md)
- E-Mail-Versand: [docs/EMAIL.md](docs/EMAIL.md)
- Anmeldung über das Firmenkonto (SSO): [docs/SSO.md](docs/SSO.md)
- PWA, Caching, Offline, Update und Web Push: [docs/PWA.md](docs/PWA.md)
- Wiederholungsplanung (PSRP-HR) im Betrieb: [docs/WIEDERHOLUNGSPLANUNG.md](docs/WIEDERHOLUNGSPLANUNG.md)
- Pflichtschulungen im Betrieb: [docs/PFLICHTSCHULUNGEN.md](docs/PFLICHTSCHULUNGEN.md)

**Inhalte, Prüfer und Didaktik**
- Freigabe je Inhaltsstand: [docs/FREIGABE.md](docs/FREIGABE.md)
- Expertenprofil: [docs/EXPERTENPROFIL.md](docs/EXPERTENPROFIL.md)
- Probe-Review für neue Prüfer: [docs/PROBE-REVIEW.md](docs/PROBE-REVIEW.md)
- Neue Antwortformate: [docs/ANTWORTFORMATE.md](docs/ANTWORTFORMATE.md)
- Lernhilfen („Antwort zuerst überlegen“, Selbsterklärung): [docs/LERNHILFEN.md](docs/LERNHILFEN.md)
- Rückmeldungen ohne Schuldzuweisung (Leitfaden für Texte): [docs/RUECKMELDUNGEN.md](docs/RUECKMELDUNGEN.md)
- Messen, Ausgangswerte und Hypothesen: [docs/MESSEN.md](docs/MESSEN.md)
- UI-Kontrast (erzeugt mit `npm run check:contrast -- --write`): [docs/UI-KONTRAST.md](docs/UI-KONTRAST.md)

## Lokal entwickeln

Voraussetzungen: Node.js 26 (LTS; CI und `Dockerfile` nutzen dieselbe Version), eine PostgreSQL-Instanz,
`poppler-utils` (liefert `pdftotext` für die PDF-Extraktion).

```bash
npm ci
cp .env.minimal.example .env.local   # DATABASE_URL, AUTH_SECRET, GEMINI_API_KEY eintragen (alle Optionen: .env.example)
npm run db:migrate              # Schema anlegen
npm run db:seed                 # Grunddaten (Zertifizierung und Domänen)
npm run dev
```

`docker-compose.yml` veröffentlicht den Postgres-Port bewusst nicht. Wer lokal gegen den
Compose-Container entwickeln will, legt eine `docker-compose.override.yml` (nicht einchecken) mit
`postgres: ports: ["127.0.0.1:5432:5432"]` an.

## Prüfen

```bash
npm run lint
npm test                        # Vitest; Rechte-Tests des Firmenbereichs brauchen eine Datenbank:
                                # TEST_DATABASE_URL=postgres://... npm test (migrierte Test-DB), sonst übersprungen
npm run build
npx tsc --noEmit                # nach dem Build, der die globalen Next-Typen erzeugt
npm run lint:ui                 # keine neuen Rohfarben und Inline-Texte (Bestand: scripts/ui-token-baseline.json)
npm run check:contrast          # Kontrast der Farbpaare aus app/globals.css
```

Dieselben Schritte führt die CI (`.github/workflows/ci.yml`) bei jedem Push und Pull Request aus.

## Betrieb

Die App läuft per `docker compose up -d` (Next.js, Postgres, Cloudflare Tunnel). `DB_PASSWORD` und
`AUTH_SECRET` sind Pflicht, sonst startet Compose nicht. Migrationen laufen bei jedem Start der App
automatisch. Admin-Skripte (Nutzerrollen, Organisationen, Zertifizierungen) stehen in
`package.json` unter `user:*`, `company:*` und `cert:*` und laufen im Container mit
`docker compose exec app npm run …`.

Die App läuft als **genau eine** Instanz: Rate-Limits und laufende Generierungsaufträge liegen im Speicher des Prozesses
(Begründung und Umgang damit: [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md), Abschnitt „Exactly one app instance“).

### Organisationen (Firmenbereich)

Solange es keine Oberfläche dafür gibt, legt der Betreiber Organisationen per Skript an. Ein Nutzer
gehört zu genau einer Organisation. Der Firmenbereich (`/company`, `/api/company/status`) steht
Firmen-Admin und Mentor offen und zeigt nur Status, Datum und Frist.

```bash
docker compose exec app npm run company:create -- "Beispiel GmbH"
docker compose exec app npm run company:set-member -- <organization-id> max@example.com company_admin
docker compose exec app npm run company:remove-member -- max@example.com
```

Mitarbeiter lädt der Firmen-Admin unter `/company` per Link ein. Ist E-Mail-Versand eingerichtet, geht der
Link zusätzlich per Mail an die eingeladene Adresse, sonst gibt der Admin ihn selbst weiter. Der Link gilt 7 Tage, einmal und nur für die eingetragene E-Mail-Adresse; wer
eine offene Einladung hat, darf sich auch außerhalb von `REGISTRATION_ALLOWED_EMAILS` registrieren.

Lernpfade (Zertifizierungen) weisen Firmen-Admin und Mentor unter `/company` zu, optional mit Frist. Dort steht
auch der Status je Person: zugewiesen, in Arbeit (sobald geübt wird) oder abgeschlossen (jedes Lernziel
beherrscht). Die Firma sieht nur Status, Zuweisungs-, Frist- und Abschlussdatum, nie Ergebnisse. Die
Lernenden sehen ihre Zuweisungen auf der Startseite.

Allgemeine Lernpfade (Security, Zertifikate) erstellen wir selbst; die Firma **fragt sie unter `/company` an**
(aus dem Katalog oder als freien Wunsch) und sieht den Stand. Als Betreiber bearbeitest du die Anfragen unter
`/admin/requests`: Stand und Hinweis setzen, den Lernpfad fachlich freigeben (Name der prüfenden Person und Datum
werden gespeichert) und für die Firma freigeben. Zuweisen kann die Firma nur freigegebene allgemeine Lernpfade
und ihre eigenen internen. Neue Lernpfade starten als Entwurf und sind für Lernende erst nach der Prüfung sichtbar. Interne Lernpfade legt
die Firma selbst an und prüft sie selbst; Betreiber und externer Prüfer sehen sie nicht.

Firmendokumente (PDF, .txt, .md, bis 10 MB) laden Firmen-Admin und Mentor unter `/company` hoch. Jedes
Dokument wird vor dem Speichern auf Passwörter, Schlüssel und Token geprüft; bei einem Fund wird nichts
gespeichert; ein Firmen-Admin kann Fehlalarme bestimmter Arten (z. B. Beispiel-Passwörter in Anleitungen) als unkritisch
bestätigen, private Schlüssel und Token nie. Die Dateien liegen in der Datenbank und sind damit im `pg_dump`-Backup
enthalten.

Für interne Lernpfade wählt der Firmen-Admin den KI-Zugang: über unseren Zugang oder mit dem eigenen Gemini-Schlüssel
(BYOK). Eigene Schlüssel werden verschlüsselt gespeichert; dafür braucht der Server `APP_ENCRYPTION_KEY`
(`openssl rand -base64 32`, in der `.env`, nicht ins Datenbank-Backup).

### Konto (Self-Service)

Unter `/account` ändern Nutzer ihr Passwort (danach sind alle Sitzungen beendet), laden ihre Daten als
JSON herunter und löschen ihr Konto samt persönlicher Daten. Plattform-Admins und der letzte
Firmen-Admin einer Organisation können sich nicht selbst löschen, die Rolle muss vorher übertragen
werden. Neue Tabellen mit Verweis auf `users` müssen in `lib/server/account/export.ts` als exportiert
oder begründet ausgenommen eingetragen werden, sonst schlägt ein Test an.

### E-Mail-Versand

Bestätigung der E-Mail-Adresse, „Passwort vergessen“ und Einladungen laufen über SMTP (zunächst Gmail).
Ohne `MAIL_*` und `APP_BASE_URL` in der `.env` bleibt der Versand aus und die App funktioniert wie
bisher (Registrierungen gelten sofort als bestätigt). Einrichtung, Gmail-App-Passwort und Grenzen:
[docs/EMAIL.md](docs/EMAIL.md).

## Skripte

Alle Skripte stehen in `package.json` und laufen im Container mit `docker compose exec app npm run <name> -- …`.
Ohne Argumente zeigen die meisten ihre Verwendung. Die Betriebsskripte für Wiederholungsplanung, Push, Backup und
Monitoring sind in den jeweiligen Anleitungen unter `docs/` beschrieben.

| Skript | Zweck |
|---|---|
| `db:generate` | Neue Migration aus `lib/server/db/schema.ts` erzeugen (Drizzle). |
| `user:reset-password`, `user:*` | Passwort zurücksetzen, Rollen setzen (Betreiber mit DB-Zugriff). |
| `company:ensure` | Firma anlegen, falls nicht vorhanden, und ein Konto eintragen. Mehrfach ausführbar. |
| `cert:add` | Neue Zertifizierung aus einer Vorlage anlegen (nur Gerüst: Namen und Gewichte der Domänen). |
| `gate3` | Testfirma einmal durch den ganzen Firmenablauf schicken (Einladen bis Statusansicht). |
| `rationales:backfill`, `variants:backfill`, `explanations:backfill`, `prerequisites:backfill` | Begründungen, Varianten, Alternativerklärungen und Voraussetzungen für einen allgemeinen Lernpfad per KI nachtragen. Ohne `--yes` nur Kostenschätzung, wo angegeben. |
| `lessons:blocks`, `lessons:simulations`, `lessons:possible` | Lernblöcke, Simulationen und „Was damit möglich ist“ in bestehende Lektionen eines allgemeinen Lernpfads ergänzen. |
| `courses:check-sources` | Quellen der Kurse erneut abrufen und melden, wo sich der Prüfungsleitfaden geändert hat (Exit-Code 2). Für einen wöchentlichen Cron. |
| `stats:backfill-completions` | Anonyme Abschluss-Statistik einmalig aus alten Prüfungsversuchen nachtragen. |
| `exams:audit-attempts` | Bestandene Prüfungsversuche aus der Zeit vor der serverseitigen Prüfung nachrechnen. Liest nur. |
| `course:import-fixture`, `course:e2e` | Entwicklung: Kurs aus einer Fixture importieren bzw. die ganze Kursgenerierung mit Fake-KI gegen Postgres laufen lassen. |
| `lighthouse` | Lighthouse-Check (Best Practices) gegen einen laufenden Server; läuft auch in der CI. |
