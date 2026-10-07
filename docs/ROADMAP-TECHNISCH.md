# Technische Roadmap – Learning-Plattform

> **Geltungsbereich:** ausschließlich Technik – Infrastruktur, Sicherheit, Datenmodell, Backend, Frontend, Qualität, Betrieb. Vertrieb, Gespräche, Recht, Preise, Finanzierung und Marketing stehen bewusst nicht hier.
>
> **Regel:** Ein Punkt wird erst abgehakt, wenn er gebaut *und* geprüft ist (Test, Lauf oder Review). Eine Phase gilt erst als abgeschlossen, wenn ihr **Gate** erfüllt ist.
>
> **Einzige gepflegte Roadmap.** Die frühere vollständige Fassung (mit Vertrieb, Recht, Finanzierung) wird nicht weitergeführt. Ist-Stand-Vermerke beziehen sich auf den Repo-Abgleich vom 04.10.2026 und sind Lesebefunde, keine Testergebnisse.

---

## Stand (06.10.2026)

**Gemergt auf `main`:** Phase 0 bis auf die unten genannten Punkte, Phase 1, Phase 2 (Gate 2 erfüllt), Zuweisen und Statusansicht, Einstieg in den Firmenbereich, Sicherheitsupdates, Server-Absicherung, Monitoring per Mail (Skript und Anleitung). **Auch gemergt (PR #77, #78):** Migrationen `0029` bis `0033`; **in Arbeit auf diesem Branch:** `0034` (interne Lernpfade): Firmendokumente mit Secret-Scanner und bestätigbaren Fehlalarmen, allgemeine/interne Lernpfade mit Kundenanfragen, Freigaben und fachlicher Prüfung, KI-Zugang je Firma (BYOK oder unser Zugang).

| Phase | Stand |
|---|---|
| 0 Fundament und Sicherheit | Gate 0 **offen**. Erledigt: CSP mit Nonce, Rate-Limits, Backup- und Restore-Skripte (im Direkt-Modus geprüft), CI, Repo aufgeräumt, Sicherheitsupdates, Server-Härtung ausgerollt und mit `scripts/check-server.sh` geprüft. Offen: Offsite-Backup und Restore auf dem echten Server, Branch Protection auf `main`, Hoster-Firewall und Test von außen (`nc -vz <ip> 5432`), Monitoring auf dem Server einrichten (Timer, Testmail, Alarmprobe), Dockerfile mit `standalone` (braucht einen Docker-Lauf), Service Worker, 502-Fehlertexte der Admin-Routen, Error-Tracking |
| 1 Mandanten, Rollen, Rechte | **erledigt** (Gate 1) |
| 2 Accounts | **erledigt** (Gate 2). Offen: Entscheidung zur Auth-Bibliothek (Empfehlung: bei `next-auth` 5.0.0-beta.32 bleiben), Mailanbieter für den Kundenbetrieb (Google Workspace mit AV-Vertrag oder EU-Anbieter) |
| 3 Firmenfunktionen | **in Arbeit**. Gebaut: Zuweisen mit Frist, Statusansicht mit automatischer Nachführung, Firmendokumente mit Scanner, Kundenanfragen und Freigaben, fachliche Prüfung, KI-Zugang je Firma (Verschlüsselung, Schlüsselprüfung). Offen: echter Probelauf des KI-Schritts „Dokument → interner Lernpfad“ (gebaut, nur mit Fake-KI getestet), Firmenmodule, Abrechnung/Limits bei „unser Zugang“, Gate 3 |
| 4 bis 7 | nicht begonnen |

**Festgelegte Entscheidungen des Betreibers (Phase 3):**
- **Allgemeine Lernpfade** (Security, Zertifikate) erstellen nur wir, auch mit KI; eine Person prüft sie fachlich (externer Dienstleister, Name und Datum werden gespeichert). Der Kunde generiert sie nicht selbst, er fragt an (Katalog oder freier Wunsch). Gibt es den Kurs, geben wir ihn frei, sonst steht die Anfrage auf „hold“ bzw. mit aktuellem Stand und Hinweis, bis der Kurs erstellt, geprüft und freigegeben ist.
- **Interne Lernpfade** legt die Firma selbst an (aus ihren Dokumenten) und prüft sie selbst. Betreiber und externer Prüfer sehen sie nicht.
- **Scanner:** Fehlalarme dürfen je nach Art bestätigt werden (Firmen-Admin), private Schlüssel und Token nie.
- **KI-Zugang bei internen Lernpfaden:** entweder BYOK (eigener Schlüssel der Firma) oder über unseren Zugang.
- „Abgeschlossen“ heißt: jedes Lernziel beherrscht (keine Abschlussprüfung); der Mentor darf zuweisen; die Freigabe eines allgemeinen Lernpfads für eine Firma erteilt immer der Betreiber von Hand.

**Entschieden (07.10.2026):** Der Betreiber darf eine erteilte Firmenfreigabe entziehen (neue Zuweisungen sind dann nicht mehr möglich, bestehende Zuweisungen und Lernfortschritt bleiben), und die Firma darf eine noch offene Anfrage selbst zurückziehen. Kosten, Limits und Abrechnung bei „unser Zugang“ stellt der Betreiber zurück („später“).

**Noch zu entscheiden:** Ist „unser Zugang“ ein Vertragsmerkmal, das der Betreiber freischaltet, und wie werden Kosten und Limits je Firma begrenzt? (zurückgestellt) Welche Konditionen (EU-Verarbeitung, kein Training mit Kundendaten) gelten für unseren KI-Zugang?

**Nächste Schritte (Reihenfolge):**
1. PR #77 mergen und ausrollen (neue Variable `APP_ENCRYPTION_KEY` in der `.env`, `openssl rand -base64 32`, nicht ins Datenbank-Backup; Firmen ohne bisherige Zuweisung brauchen zuerst eine Freigabe über `/admin/requests`).
2. Phase 0 abschließen (Betreiber auf dem Server): Offsite-Backup mit echtem Restore, Branch Protection, Test von außen, Monitoring-Timer.
3. Den KI-Schritt für interne Lernpfade mit einem echten Firmendokument und echtem Schlüssel ausprobieren (gebaut, bisher nur mit Fake-KI getestet).
4. Firmenmodule mit Verantwortlichem und „gültig bis“, dann Gate 3 (E-Mail-Benachrichtigungen bei Anfragen und Praxisaufgaben sind gebaut).

---

## Leitplanken (technisch zu erzwingen)

Jede neue Funktion wird gegen diese Punkte geprüft. Was sie verletzt, wird nicht gebaut.

- [ ] **Kein Talent-Score, keine Vergleiche** zwischen Lernenden – weder in Datenmodell noch API
- [ ] **Arbeitgeber-API liefert nur Status:** zugewiesen / in Arbeit / abgeschlossen, Datum, Frist – technisch erzwungen, nicht nur in der UI
- [ ] **Bestanden heißt beherrscht:** wechselnde Fragen, jedes Lernziel nachgewiesen
- [ ] **Bewertung regelbasiert**, KI nur für Entwürfe und Hinweise – nie Entscheidung über Menschen
- [ ] **Nachweise gehören dem Lernenden**, Wechselwünsche bleiben privat
- [ ] **Inhalte nur mit menschlicher Freigabe** (Name, Datum, Version gespeichert)

---

## Phase 0 – Fundament und Sicherheit

**Ziel:** Der laufende Server ist sicher, Änderungen sind getestet, Daten sind gesichert.

### Infrastruktur
- [x] Postgres-Port in `docker-compose.yml` nicht mehr veröffentlicht
  - _Geprüft:_ `docker compose config` zeigt keinen `ports`-Eintrag für `postgres`; lokale Entwicklung siehe `.env.example`
- [x] Keine Default-Passwörter: Pflichtvariablen mit `${VAR:?}` (`DB_PASSWORD`, `AUTH_SECRET`)
  - _Geprüft:_ `docker compose config` bricht ohne `DB_PASSWORD` mit Fehlermeldung ab
- [x] App-Port nur an `127.0.0.1` gebunden (Caddy-Upstream und Cloudflare Tunnel bleiben erreichbar)
  - _Geprüft:_ `docker compose config` zeigt `host_ip: 127.0.0.1`
- [ ] Firewall des Servers prüfen (nicht aus dem Repo prüfbar)
  - _Befund vom Betreiber (`docker ps`):_ auf dem Server laufen noch Container der **alten** Compose-Datei, `learning-postgres` auf `0.0.0.0:5432` und `learning-app` auf `0.0.0.0:3000`, also von außen erreichbar. Die Korrektur steht im Repo, ist aber **nicht ausgerollt**
- [x] Härtung auf dem Server ausgerollt und geprüft
  - _Vorbereitet:_ Anleitung `docs/DEPLOY-UPDATE.md` (Hoster-Firewall, Backup, Passwort in laufender DB ändern, `.env`, Update, Rückweg, Vorgehen bei Kompromittierung) und lesendes Prüfskript `scripts/check-server.sh` (Ports, Standardpasswort über das Docker-Netz, `.env`, Dubletten für Migration 0024; getestet mit simuliertem Docker in drei Szenarien)
  - _Geprüft (Betreiber, auf dem Server):_ Vor dem Update meldete `scripts/check-server.sh` 5432 und 3000 auf allen Interfaces, aber: Standardpasswort wird abgelehnt, `DB_PASSWORD` (48 Zeichen) und `AUTH_SECRET` (44 Zeichen) gesetzt, keine E-Mail-Dubletten. Nach `git pull` und `docker compose up -d --build` endet das Skript ohne Fehler, Migrationen und App-Log unauffällig. Im Datenbank-Log keine fehlgeschlagenen Anmeldungen, kein Hinweis auf Zugriffe von außen
  - _Grenze:_ Das Log belegt nur die Zeit seit dem letzten Neustart des Containers. Die Sperre von 5432/3000 in der Hoster-Firewall und der Test von einem fremden Rechner (`nc -vz <ip> 5432`) sind nicht bestätigt, siehe offenen Punkt „Firewall des Servers prüfen"
- [x] Sicherheitsupdates der Abhängigkeiten (`npm audit`)
  - _Geprüft:_ `next` 16.3.8 (u. a. kritische Lücke in `next/og`, von der App nicht genutzt), `nodemailer` 10.0.15, übrige Funde per `npm audit fix`; `npm audit --omit=dev` meldet 0 Funde. Tests (274 mit Datenbank), `tsc`, Lint, Produktions-Build grün; im Browser erneut geprüft: komplette Mail-Strecke über TLS (24 Prüfungen, nodemailer 10) und Offline-Betrieb mit Service Worker
  - _Offen (nur Entwicklungswerkzeuge, kein Laufzeitcode):_ Funde bei `vitest`/`@vitest/mocker`, `esbuild` (über `drizzle-kit`) und `braces`/`micromatch`/`fast-glob` (über `eslint-config-next`) brauchen größere Versionssprünge; bei Gelegenheit nachziehen
- [ ] Dockerfile nutzt `output: "standalone"` (kleineres Image, keine Dev-Tools)
  - _Ist-Stand:_ Option steht in `next.config.ts`, Dockerfile kopiert noch `.next` + volles `node_modules`
  - _Offen, nicht verifizierbar ohne Docker-Daemon:_ Das Image muss weiter `drizzle-kit`/`tsx` für Migration beim Start und die Admin-Skripte (`user:*`, `cert:*`, `content:*`) enthalten. Eine schlanke Variante bräuchte ein eigenes Migrationsskript auf Basis von `drizzle-orm` und einen Image-Build-Test
- [ ] Datenbank-Migrationen beim Deploy automatisch ausführen
  - _Stand:_ `command: npm run db:migrate && npm start` in `docker-compose.yml`. **Geprüft** gegen eine echte PostgreSQL-16-Instanz: komplette Kette (25 Migrationen) auf leerer DB, zweiter Lauf ändert nichts. Die Kette läuft zusätzlich in der CI auf leerer PostgreSQL-17-Datenbank durch. **Offen:** der Container-Start selbst (hier gibt es keinen Docker-Daemon). Bei einer Umstellung auf `standalone` muss `drizzle-kit` im Image bleiben

### Sicherheit
- [x] Rate-Limits für Login (10/15 min je Konto, 30/15 min je IP) und Registrierung (5/h je IP)
  - _Geprüft live_ (Produktions-Build gegen echte DB, Auth.js-Login per HTTP): frisches Konto loggt mit richtigem Passwort ein; nach 10 Fehlversuchen scheitert auch das richtige Passwort; ein anderes Konto bleibt frei; 6. Registrierung derselben IP → 429 mit `Retry-After`, andere IP → 201
- [x] Rate-Limits und Tageskontingent pro Nutzer für KI-Routen
  - _Geprüft:_ Admin-Generierung/Blueprint hatten Limits; neu: Kursgenerierung (5 Aufträge/h je Admin) und Remediation (20 Generierungen/Tag je Nutzer, Unit-Tests grün). Die Remediation ist die einzige Lernenden-Route mit KI-Aufruf (per Code-Suche geprüft)
- [x] Remediation-Neugenerierung nur per `POST` mit Abklingzeit (10 min je Nutzer und Ziel); `GET` ignoriert `?regenerate=true`
  - _Geprüft:_ Unit-Tests für Abklingzeit, `tsc` und Lint sauber; Route nicht live aufgerufen
- [x] KI-Budget auf Gemini-Variablen umgestellt (`GEMINI_*_PRICE_*`, `GEMINI_BUDGET_USD`; `ANTHROPIC_*`-Fallback entfernt, Compose reicht die Variablen durch)
  - _Geprüft:_ Tests laufen auf `GEMINI_*`, ein Test belegt, dass `ANTHROPIC_*` ignoriert wird. Konkrete Preiswerte trägst du selbst in `.env` ein
- [x] Security-Header: CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` u. a.), HSTS (1 Jahr, ohne `includeSubDomains`), nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy
  - _Geprüft:_ Produktions-Build gestartet, `curl -I` auf `/login` zeigt alle Header; CSP ohne Verletzungen auf Login und Dashboard (Playwright-Lauf aus PR #68)
- [x] CSP ohne `'unsafe-inline'` für Skripte (Nonce pro Anfrage über `proxy.ts`, `lib/server/csp.ts`; `strict-dynamic`)
  - _Geprüft im Browser_ (Chromium/Playwright gegen Produktions-Build und echte DB): alle 10 Skripte auf `/login` tragen die Nonce, 0 CSP-Verletzungen und 0 JS-Fehler über Login, Dashboard, Registrierung; Theme-Skript läuft; ein ins HTML eingeschleustes Inline-Skript ohne Nonce wird blockiert (Gegenprobe); Offline-Reload aus dem Service-Worker-Cache funktioniert ohne Verletzung. Styles behalten bewusst `'unsafe-inline'` (style-Attribute von React/Tailwind)
- [x] Service Worker: `ui-cache` beim Logout leeren
  - _Geprüft im Browser:_ nach Login und Reload enthält `ui-cache` einen Eintrag, nach „Sign out“ existiert er nicht mehr (Service Worker aktiv)
- [x] Service Worker: Seitenaufrufe erst Netzwerk, Cache nur als Rückfall (NetworkFirst, 3 s Timeout)
  - _Anlass und Prüfung im Browser:_ Beim Test der Einladungen fiel auf, dass Stale-While-Revalidate nach einer Änderung beim Neuladen die VERALTETE Seite zeigte (neue Einladung fehlte in der Liste; ohne Service Worker war sie da). Nach der Umstellung erscheint sie mit und ohne Service Worker. Offline-Reload liefert `/company` weiter aus dem Cache, 0 CSP-Verletzungen
- [ ] Service Worker: angemeldete Seiten gar nicht erst cachen
  - _Bewusst offen:_ Die zuletzt geladenen Seiten bleiben im `ui-cache` (Offline-Modus) und werden erst beim Logout gelöscht. Wer ein Gerät angemeldet liegen lässt, lässt sie dort. „Gar nicht cachen“ bräuchte eine andere Offline-Lösung (nur die Lerninhalte aus IndexedDB, keine Firmenseiten)
- [x] API-Fehler für Lernende nach außen generisch, Details nur ins Log
  - _Geprüft im Code:_ alle Nicht-Admin-Routen mit 500er-Pfad durchgesehen; `exams/[certId]` leakte `error.message` und ist behoben, `remediation` generisch (bekannte Fälle als 404/409/429 mit fester Meldung)
- [ ] API-Fehler der Admin-Routen `sources/[id]/blueprint` und `sources/[id]/parse` (502) generisch machen
  - _Offen, Entscheidung nötig:_ beide geben die Roh-Meldung an Admins zurück (Quell-Extraktion speichert sie zusätzlich als `parseError`). Generisch machen kostet Admins die Fehlerdiagnose in der Oberfläche, wenn Details nur im Log stehen
- [x] E-Mail-Adressen normalisieren (Kleinschreibung) plus Migration bestehender Konten
  - _Geprüft live:_ Registrierung `Tester@Example.com` wird als `tester@example.com` gespeichert, Dublette in anderer Schreibweise → 409, Login mit `R1@Example.com` klappt. Migration `0024` gegen echte DB: `Max.Muster@Example.COM` und `  Anna@x.de ` werden normalisiert. **Achtung beim Deploy:** zwei Konten, die sich nur in der Schreibweise unterscheiden, lassen die Migration (und damit den App-Start) abbrechen. Vorher prüfen: `select lower(btrim(email)), count(*) from users group by 1 having count(*) > 1;`

### Qualität und Betrieb
- [x] GitHub Actions: Lint, Tests, Build, Typecheck bei Push auf `main` und bei Pull Requests
  - _Geprüft:_ Check `check` an PR #69 grün (Lauf 37218663107); erster Lauf war rot wegen fehlendem `poppler-utils`, behoben
- [ ] Branch Protection auf `main`
- [ ] Nächtliches, verschlüsseltes Offsite-Backup (Postgres und Quell-PDFs)
  - _Stand:_ `scripts/backup.sh` (age-Verschlüsselung, nur öffentlicher Schlüssel auf dem Server, Aufbewahrung, atomares Schreiben) und systemd-Vorlagen in `deploy/`. **Geprüft** (Modus `direct`, echte PostgreSQL-16-DB): Dump und PDF-Archiv werden verschlüsselt geschrieben, Rechte 600. **Nicht geprüft:** Compose-Modus (kein Docker hier), Offsite-Kopie per `rclone` (nicht installiert, Ziel offen), systemd-Timer auf dem Server
- [ ] **Restore einmal vollständig getestet**
  - _Stand:_ `scripts/restore-test.sh` spielt ein Backup in eine Wegwerf-DB ein und prüft sie. **Geprüft:** Backup→Restore einer Testdatenbank (25 Migrationen, 10 Nutzer wie in der Quelle), falscher Schlüssel und abgeschnittenes Backup schlagen fehl, Wegwerf-DB wird immer gelöscht. **Offen:** ein Restore eines echten Produktions-Backups auf dem Server
- [ ] Error-Tracking und Uptime-Monitoring
  - _Entscheidung des Betreibers:_ Zabbix ist nicht Teil dieses Repos (kommt später auf einem eigenen Server). Fürs Erste: Alarm per E-Mail
  - _Gebaut:_ `scripts/monitor.sh` (läuft auf dem App-Server, alle 5 Minuten per `deploy/learning-monitor.timer`, Versand direkt per SMTP/curl, damit auch bei ausgefallener App eine Mail kommt). Prüft `/api/ready` (App und Datenbank), Container, Alter des letzten Backups (Marker `backups/.last-success`, den `backup.sh` nach Erfolg setzt) und Plattenbelegung. Mail bei der 2. Fehlschlag-Prüfung in Folge („PROBLEM“), bei Entwarnung („BEHOBEN“) und als Erinnerung nach 24 h. Anleitung `docs/MONITORING.md`
  - _Geprüft (manuelles Skript, 20 Prüfungen, nicht Teil der CI):_ echter SMTP-Server mit TLS und Anmeldung (Passwort mit `"` und `\`), HTTP-Ersatz für `/api/ready`: Testmail an zwei Empfänger, falsches Passwort → Exit 1 ohne Passwort in der Ausgabe, gesund → keine Mail, 1. Fehlschlag still / 2. alarmiert / 3. keine Doppelmail, Erholung → BEHOBEN, App nicht erreichbar (000), Backup 30 h alt und Marker fehlt, abschaltbar, Platte über Grenze, Erinnerung, scheiternder Versand wird nachgeholt, fehlender Empfänger → klare Meldung, Werte aus `.env`. Container-Prüfung mit simuliertem `docker` (gestoppt und fehlend erkannt)
  - _Nicht geprüft:_ Lauf auf dem echten Server als systemd-Timer, Versand über Gmail (hier gesperrt), Backup-Marker mit dem echten `backup.sh`. Erledigt, wenn der Betreiber Timer und Testmail eingerichtet hat und `docker stop learning-app` nach etwa 10 Minuten die Mail auslöst
  - _Grenzen:_ Ein Server überwacht sich selbst, bei Totalausfall kommt keine Mail (externer Uptime-Check oder späteres Zabbix auf dem zweiten Server); keine Serverwerte außer Platte
  - _Offen:_ Error-Tracking (Stacktraces) – bisher nur Docker-Log
- [x] Repo aufräumen: Patch-Datei und `QUICK_COMMANDS.sh` entfernt, README ausgebaut (Entwicklung, Prüfen, Betrieb), `DOCKER_DEPLOYMENT.md` von Anthropic auf Gemini umgestellt
  - _Geprüft:_ Patch war bereits angewendet (Poppler-Extraktion im Code), keine Verweise auf die Skripte im Repo. `roadmap.md`/`roadmap2.md` bleiben bewusst liegen (~160 Code-Kommentare verweisen darauf), „archivieren“ entfällt

### Gate 0
- [ ] Keine offenen kritischen Punkte aus dem Sicherheits-Review
- [ ] CI grün, Backup-Restore erfolgreich getestet

---

## Phase 1 – Mandanten, Rollen, Rechte

**Ziel:** Strikte Datentrennung als technische Basis für alle Firmenfunktionen, plus ein dünnes, sichtbares Firmengerüst, an dem sich die Rechte von Anfang an in der Oberfläche prüfen lassen.

**Entscheidung (Annahme, Rückfrage beim Betreiber offen):** Ein Nutzer gehört zu **genau einer** Organisation (Unique-Index auf `organization_memberships.user_id`). Mehrere Organisationen ließen sich später durch Entfernen dieses einen Index zulassen.

### Datenmodell und Rechte
- [x] Organisation (Mandant) mit strikter Datentrennung zwischen Firmen
  - _Geprüft gegen echte PostgreSQL-Instanz:_ Tabellen `organizations`, `organization_memberships`, `company_assignments` (Migration `0025`). Zusammengesetzter Fremdschlüssel: eine Zuweisung kann nicht an ein Mitglied einer anderen Firma gehen (Test belegt den Fehler). Ein Nutzer kann nur einer Organisation angehören (Test)
- [x] Rollen: Firmen-Admin, Mentor, Lernender (getrennt von der Plattform-Admin-Rolle `users.role`)
  - _Geprüft:_ ein Plattform-Admin ohne Organisation und einer, der in Firma A nur Lernender ist, bekommen 403 (Test und Browser)
- [x] Zentraler Guard für Firmenzugriffe (`lib/server/company/guard.ts`): Organisation und Rolle werden an einer Stelle geprüft, die Organisation stammt nur aus der Mitgliedschaft, nie aus Request-Parametern; Mitgliedschaft wird bei jeder Anfrage frisch geladen
  - _Geprüft:_ Anfrage mit fremder `organizationId` wird ignoriert; ein entzogenes Mitglied verliert den Zugriff sofort. Mutationstest: ohne Mandantenfilter fallen 4, ohne Rollenprüfung 2 Tests durch
- [x] Trennung privat / betrieblich im Datenmodell (Lerndetails nie im Firmenbereich abfragbar)
  - _Geprüft:_ `company_assignments` enthält nur Status, Zuweisungs-, Fälligkeits- und Abschlussdatum. Ein Architektur-Test erlaubt dem Firmenbereich nur eine feste Liste von Tabellen und keine Lern-Module. **Grenze:** das ist eine Code-Regel mit Test, kein Datenbank-Rechtekonzept (kein separater DB-Benutzer)
- [x] Separate Firmen-API (`GET /api/company/status`), die nur Status, Datum und Frist liefert
  - _Geprüft:_ jeder Eintrag hat genau die freigegebenen Felder (Test und Browser); die Feldliste ist im Test festgehalten, neue Felder sind eine bewusste Entscheidung
- [x] Betreiber-Skript für Organisationen (`company:create`, `company:set-member`, `company:remove-member`) mit Audit-Ereignissen, bis es in Phase 2 Einladungen gibt
  - _Geprüft:_ Anlegen, Rolle ändern, Fehlerfälle (anderer Organisation zugehörig, unbekannte E-Mail, ungültige Rolle)

### Firmengerüst (dünn, ohne Funktionen)
- [x] Eigener Bereich `/company` mit Navigation (Header-Link nur für Firmen-Admin und Mentor) und Rollenprüfung über den zentralen Guard
- [x] Leere Statusseite für die Firma (Platzhalter, bindet später die Statusansicht aus Phase 3 ein)
- [x] Nutzer ohne Organisation oder mit falscher Rolle sehen den Bereich nicht und bekommen keine Daten (403 bzw. Weiterleitung auf Login)
  - _Geprüft im Browser_ (Chromium, Produktions-Build, echte DB, 40 Prüfungen): nicht angemeldet → Login-Weiterleitung und API 401; Firmen-Admin A, Mentor A, Firmen-Admin B → 200, nur eigene Firma; Lernender, Nutzer ohne Organisation, Plattform-Admin → 403 und kein Header-Link; keine CSP-Verletzungen. **Der Browser-Lauf ist ein manuelles Skript, nicht Teil der CI**
- [ ] Die echten Funktionen (Zuweisen, Dokument-Upload, Praxisaufgaben, Statusansicht) bleiben in Phase 3

### Tests
- [x] Automatisierte Zugriffstests gegen echte Datenbank: Firma A sieht nie Daten von Firma B, Arbeitgeber sieht nie Lerndetails
  - _Geprüft:_ `lib/server/company/company-access.test.ts` (13 Tests) und `company-architecture.test.ts` (4 Tests), lokal gegen PostgreSQL 16 grün; ohne `TEST_DATABASE_URL` werden die DB-Tests übersprungen
- [x] Zugriffstests für das Firmengerüst: jede Rolle und „ohne Organisation“ gegen `/company` und die Firmen-API (Seiten-Guard im Test, Seite und API im Browser-Lauf)

### Gate 1
- [x] Rechte-Tests grün und in der CI
  - _Geprüft:_ Check an PR #70 grün (Lauf 37332868853): Postgres-17-Dienst, Migrationen auf leerer DB, 208 Tests inkl. der 13 DB-Rechte-Tests (im Log als ausgeführt, nicht übersprungen)
- [x] Firmengerüst per Browser-Test mit allen drei Rollen geprüft (manuell, siehe oben)

---

## Phase 2 – Accounts

- [x] E-Mail-Versand per SMTP, anbieterneutral (zunächst Gmail; Anleitung `docs/EMAIL.md`)
  - _Geprüft:_ Konfiguration (Port 465 implizites TLS, 587 STARTTLS erzwungen, in Produktion nur https-Links und nie unverschlüsselt; 8 Tests), Versand gegen einen lokalen SMTP-Server mit Anmeldung (4 Tests: Inhalt, falsche Zugangsdaten, nicht erreichbar, ohne Konfiguration; Fehler werden ohne Passwort protokolliert) und im Browser-Lauf über **echtes TLS** mit Anmeldung (9 Mails, 0 fehlgeschlagene SMTP-Anmeldungen, keine Zugangsdaten oder Tokens im App-Log). **Nicht gegen Gmail selbst geprüft** (ausgehendes SMTP ist hier gesperrt, echte Zugangsdaten fehlen)
  - Ohne Konfiguration bleibt der Versand aus: Registrierungen gelten sofort als bestätigt, „Passwort vergessen“ antwortet 503, Einladungen bleiben ein Link
- [ ] Für den Kundenbetrieb: EU-Anbieter oder Google Workspace mit Auftragsverarbeitungsvertrag
  - _Offen:_ Ein privates Gmail-Konto reicht für Entwicklung und Pilot-Test, bietet aber keinen AV-Vertrag, hat ein Tageslimit und setzt die Gmail-Adresse als Absender (Details in `docs/EMAIL.md`). Der Wechsel braucht nur andere Umgebungsvariablen
- [x] E-Mail-Verifizierung und Passwort-Reset
  - _Geprüft gegen echte DB (16 Tests) und im Browser (24 Prüfungen, Produktions-Build, TLS-SMTP):_ Einmal-Tokens (256 Bit, nur Hash gespeichert, Bestätigung 24 h, Reset 1 h, einmalig, zweckgebunden, ein neuer Link ersetzt den alten, parallele Einlösung: genau einer gewinnt). Bestätigung per Klick auf die Seite (POST), damit Link-Scanner im Postfach das Token nicht verbrauchen (im Browser mit GET-Aufrufen geprüft). Neue Konten können sich erst nach Bestätigung anmelden, sobald der Versand eingerichtet ist; Bestandskonten gelten als bestätigt (Migration `0028`, mit Altbestand getestet). „Passwort vergessen“ antwortet für bekannte und unbekannte Adressen gleich und versendet erst nach der Antwort; Limits 3/h je Adresse und 10/h je IP. Ein Reset beendet alle Sitzungen (zweites Gerät im Browser abgemeldet), bestätigt die Adresse und lässt alte Links verfallen. „Bestätigung erneut senden“ macht den alten Link ungültig
  - _Mutationstest:_ 7 bewusst eingebaute Fehler (unbestätigte Anmeldung, Mehrfachverwendung, falscher Zweck, kein Ablauf, Reset ohne Sitzungsende, ohne Normalisierung, Registrierung sofort bestätigt) werden alle erkannt
- [x] Passwort ändern (Self-Service, Seite `/account`)
  - _Geprüft gegen echte DB (Tests) und im Browser (Chromium, Produktions-Build, 23 Prüfungen):_ aktuelles Passwort wird verlangt, neues mindestens 8 Zeichen und höchstens 72 Byte (bcrypt schneidet sonst still ab; gilt jetzt auch bei der Registrierung), muss sich vom alten unterscheiden. Danach sind **alle Sitzungen beendet** (`users.session_version`, Migration `0027`, Prüfung im `jwt`-Callback): ein zweites Gerät ist nach dem Wechsel abgemeldet, API-Aufrufe mit der alten Sitzung geben 401. Rate-Limit 10 Versuche/15 min (zählt Fehlversuche). Audit-Ereignis ohne Passwort
- [x] Datenexport (Self-Service): `GET /api/account/export` als JSON-Download
  - _Geprüft:_ enthält Konto, Mitgliedschaft, Zuweisungen, Lern-, Prüfungs- und Sitzungsdaten samt Antworten, Aktivitäten (nie Passwort-Hash, nie Daten anderer Nutzer; Test mit zwei Nutzern). **Vollständigkeits-Test ohne Datenbank:** jede Spalte mit Fremdschlüssel auf `users` muss exportiert oder begründet ausgenommen sein, sonst schlägt der Test an (zwingt bei neuen Tabellen zur Entscheidung). Limit 5/Stunde
- [x] Konto löschen (Self-Service)
  - _Geprüft gegen echte DB mit Daten in allen 12 nutzergebundenen Tabellen und im Browser:_ verlangt das Passwort, löscht Konto und alle persönlichen Daten (Fremdschlüssel `CASCADE`; ein Test hält fest, dass alle 21 Fremdschlüssel auf `users` `CASCADE` oder `SET NULL` sind), entfernt zusätzlich Einladungen an die eigene Adresse und die E-Mail aus Audit-Metadaten; Betriebsdaten (Audit, Meldungen, Jobs) bleiben anonymisiert. Fremde Daten und Inhalte bleiben unberührt. Sitzungen anderer Geräte werden ungültig, lokale Offline-Daten und Seiten-Cache werden geleert, die Adresse lässt sich neu registrieren. Verweigert wird bei Plattform-Admins und beim letzten Firmen-Admin einer Organisation (sonst bliebe sie ohne Verwaltung)
  - _Grenzen:_ Meldungen (`content_reports`) behalten den Freitext ohne Bezug zum Konto; Backups enthalten das Konto bis zu ihrer Aufbewahrungsgrenze (siehe `docs/BACKUP.md`, lokal 14 Tage), eine Löschung dort ist nicht automatisiert
- [ ] Auth-Bibliothek auf stabile Version bringen oder Alternative prüfen
  - _Ist-Stand:_ `next-auth` `5.0.0-beta.32` (exakt gepinnt). Es gibt kein stabiles v5; v4 ist die „latest“-Version, hat aber eine ältere API. v5 wird laut Projekt nur noch sicherheitsgepflegt. `npm audit` meldet keine Lücke in `next-auth`/`@auth/core`, nur über das optionale `nodemailer` (aktualisiert, per `overrides` aufgelöst)
  - _Vorschlag:_ vorerst bei der gepinnten Beta bleiben und regelmäßig `npm audit` prüfen; ein Wechsel (z. B. Better Auth) ist eine eigene Entscheidung des Betreibers, weil Anmeldung, Sitzungsentwertung (`session_version`) und Tests betroffen wären
- [x] Mitarbeiter per Einladungslink einladen und einer Organisation zuordnen (ohne E-Mail-Versand)
  - _Geprüft gegen echte DB (16 Tests) und im Browser (23 Prüfungen, Chromium, Produktions-Build):_ Firmen-Admin erzeugt einen Link (Token 256 Bit, in der Datenbank nur als SHA-256-Hash, Anzeige einmalig, 7 Tage gültig). Annahme nur mit genau der eingeladenen E-Mail, einmalig (auch bei 6 parallelen Versuchen entsteht genau eine Mitgliedschaft), widerrufbar; neue Einladung für dieselbe Adresse macht den alten Link ungültig. Mandantengetrennt (Admin B sieht und widerruft Einladungen von A nicht), Liste ohne Token. Wer eine offene Einladung hat, darf sich auch außerhalb der Allowlist registrieren, nur mit dieser Adresse. Nach Login/Registrierung geht es zurück zur Einladung (Weiterleitung nur auf eigene Pfade). Rate-Limits: 20 Einladungen/h je Admin, 10 Annahmen/15 min je Nutzer
  - _Mutationstest:_ ohne E-Mail-Bindung fallen 2, ohne Einmalverwendung 1, ohne Mandantenfilter beim Widerrufen 1 Test durch
  - _Der Link wird vom Firmen-Admin selbst weitergegeben._ Gemeinsam mit dem E-Mail-Versand (nächster Punkt) wird daraus die Einladung per E-Mail
- [x] Einladung zusätzlich per E-Mail verschicken
  - _Geprüft gegen echte DB und im Browser:_ Die Mail nennt Firma und Rolle, der Link entspricht dem im Panel angezeigten; scheitert der Versand, bleibt die Einladung bestehen (`emailSent=false`, Link wird angezeigt). Kompletter Weg im Browser: Einladung → Mail → Registrieren → Bestätigungsmail → Anmelden → Annehmen → Firmenbereich als Mentor

### Gate 2
- [x] Neues Konto kann sich registrieren, verifizieren, Passwort zurücksetzen und löschen
  - _Geprüft im Browser, die Schritte mit verschiedenen Testkonten (nicht als ein durchgehender Lauf):_ Registrieren und Bestätigen, Passwort vergessen und Zurücksetzen (Mail-Lauf), Passwort ändern und Konto löschen (Self-Service-Lauf)

---

## Phase 3 – Firmenfunktionen

**Modell (Entscheidung des Betreibers):** Es gibt zwei Arten von Lernpfaden. **Allgemeine** (z. B. Security, Zertifikate) erstellen nur wir; sie dürfen mit KI generiert werden, werden aber vor jeder Weitergabe **von einer Person fachlich geprüft** (externer Dienstleister, Name und Datum werden gespeichert). Der Kunde generiert keine allgemeinen Kurse selbst, er **fragt an**: aus dem Katalog oder als freier Wunsch. Gibt es den Kurs schon, geben wir ihn für die Firma frei. Sonst steht die Anfrage auf „hold“ bzw. mit aktuellem Stand und Hinweis da, bis wir den Kurs erstellt, prüfen lassen und freigegeben haben. **Interne** Lernpfade legt die Firma selbst an (aus ihren Dokumenten, mit KI-Entwurf) und **prüft sie auch selbst** (ihr Mentor). Sie gehören nur der Firma: weder wir noch der externe Dienstleister sehen sie.

- [x] Allgemeine und interne Lernpfade unterscheiden; Anfragen mit Stand („hold“) und Freigabe pro Firma
  - _Gebaut (Migration `0030`):_ `certifications.kind` (`general` / `internal`, intern gehört genau einer Organisation), `certifications.catalog_status` (`draft` → `in_review` → `approved`, mit `approved_by_name` und `approved_at`; bei allgemeinen Lernpfaden prüft der Betreiber/externe Dienstleister, bei internen die Firma selbst), `course_requests` (Stand `submitted`, `on_hold`, `in_creation`, `in_review`, `released`, `rejected` plus Hinweis), `course_request_events` (Verlauf, der Firma sichtbar) und `company_course_entitlements` (Freigabe eines allgemeinen Lernpfads für eine Firma). Bestehende Lernpfade gelten als freigegeben, bestehende Zuweisungen behalten ihre Firmenfreigabe (Daten-Migration). **Neue** Lernpfade (Admin-Anlage, KI-Kurspaket-Import) starten als `draft`
  - _Kundenseite (`/company`, `/api/company/course-requests`):_ Firmen-Admin und Mentor fragen aus dem Katalog (nur freigegebene allgemeine Lernpfade, die die Firma noch nicht hat) oder per freiem Wunsch an und sehen Stand, Hinweis und Verlauf. Zuweisbar sind nur freigegebene Lernpfade mit Firmenfreigabe und die eigenen internen, auch serverseitig (sonst 404, ohne zu verraten, dass es den Lernpfad gibt); die Auswahl kennzeichnet „Allgemein“ und „Intern“
  - _Betreiberseite (`/admin/requests`, `/api/admin/course-requests`, nur Plattform-Admins):_ Anfragen aller Firmen sehen, Stand und Hinweis setzen (Ablehnung nur mit Begründung), freigeben (nur ein allgemeiner und fachlich freigegebener Lernpfad; bei freiem Wunsch wird der erstellte Lernpfad zugeordnet), Prüfstatus der **allgemeinen** Lernpfade pflegen („freigegeben“ verlangt den Namen der prüfenden Person; interne Lernpfade einer Firma sind für den Betreiber nicht auffindbar, 404). „Freigegeben“ ist endgültig. Lernende sehen nur freigegebene Lernpfade (interne nur die eigene Firma), Plattform-Admins alle allgemeinen, auch Entwürfe, aber **keine internen Lernpfade einer Firma** (Firmendaten gehören der Firma)
  - _Geprüft gegen echte DB (15 + 4 Tests) und im Browser (Chromium, Produktions-Build, 23 Prüfungen mit Betreiber, Firmen-Admin, Lernenden und zweiter Firma); Lint und `tsc` sauber:_ Mandantentrennung (jede Firma sieht nur ihre Anfragen, eine mitgeschickte `organizationId` zählt nicht), Rollen (Firmen-Admin hat auf der Betreiberseite keine Rechte), Dubletten, ungültige Eingaben, Rate-Limit 10/h, Audit-Ereignisse, Sichtbarkeit je Betrachter (ohne Konto, ohne Firma, Mitglied, andere Firma, Betreiber, Betreiber als Mitglied der Firma)
  - _Mutationstests (13):_ Zuweisen ohne Firmenfreigabe, ohne fachliche Freigabe, mit fremden internen Lernpfaden, Freigeben ohne fachliche Prüfung, Freigeben interner Lernpfade, Ändern freigegebener Anfragen, Prüfstatus ohne Namen, Anfragen ohne Mandantenfilter, Anfragen für Entwürfe/interne, doppelte offene Anfragen, Sichtbarkeit ohne Freigabefilter und mit jedem Mitglied bei internen Lernpfaden fallen jeweils auf
  - _Entscheidungen (bitte prüfen):_ Freigabe immer von Hand durch den Betreiber (keine Automatik, auch wenn der Kurs im Katalog liegt); (inzwischen entschieden und gebaut: die Firma darf offene Anfragen zurückziehen, der Betreiber darf Freigaben entziehen, siehe unten); wird ein Lernpfad zurück auf „Entwurf“ gesetzt, bleiben bestehende Zuweisungen und Freigaben, er ist aber nicht mehr neu zuweisbar
- [x] Anfrage zurückziehen (Firma) und Freigabe entziehen (Betreiber)
  - _Gebaut (Migration `0035`: Stati „zurückgezogen“ und „Freigabe entzogen“):_ Firmen-Admin und Mentor ziehen eine **offene** Anfrage der eigenen Firma zurück (Knopf in der Anfrageliste, `POST /api/company/course-requests/[id]/withdraw`); freigegebene, abgelehnte oder schon zurückgezogene Anfragen nicht (409), fremde Firmen 404. Der Betreiber sieht auf `/admin/requests` die erteilten Freigaben mit der Zahl offener Zuweisungen und kann sie entziehen (`DELETE /api/admin/entitlements`, mit optionalem Hinweis an die Firma). Danach ist der Lernpfad für die Firma nicht mehr neu zuweisbar und im Katalog wieder anfragbar; **bestehende Zuweisungen und Lernfortschritt bleiben** (niemand wird mitten im Lernen ausgesperrt). Die ursprüngliche Anfrage steht auf „Freigabe entzogen“, der Verlauf zeigt es. Zurückgezogene und entzogene Anfragen sind endgültig: der Betreiber kann sie weder umstellen noch freigeben (neue Anfrage nötig)
  - _Geprüft gegen echte DB (7 Tests, alle 427 Tests grün):_ Rollen, Mandantentrennung, Verlauf und Audit (`course_request.withdrawn`, `course_entitlement.revoked`), keine neue Zuweisung nach dem Entziehen, bestehende bleibt, erneut anfragbar und freigebbar, Freigabe einer anderen Firma unberührt. 5 Mutationstests (ohne Mandantenfilter, ohne Statusprüfung, Entziehen für alle Firmen, Freigabe zurückgezogener Anfragen, Anfrage-Status beim Entziehen) fallen auf. Nicht im Browser geprüft
  - _Entscheidung (bitte prüfen):_ Entziehen sperrt nur neue Zuweisungen; wer den Zugriff auf bestehende Zuweisungen ebenfalls beenden will, braucht einen zweiten Schritt (bisher nicht gebaut)
- [x] KI-Zugang je Firma für interne Lernpfade: eigener Schlüssel (BYOK) oder unser Zugang
  - _Gebaut (Migration `0032`, Panel auf `/company` nur für Firmen-Admins):_ Modus `platform` oder `byok`. Eigener Schlüssel wird vor dem Speichern bei Google geprüft (Header, nie in der Adresse; falscher Schlüssel 400, Google nicht erreichbar 502, nichts wird gespeichert), mit AES-256-GCM verschlüsselt abgelegt (`lib/server/crypto/secret-box.ts`, Schlüssel `APP_ENCRYPTION_KEY` aus der Umgebung, nicht in der Datenbank), nie an den Browser zurückgegeben (nur die letzten 4 Zeichen) und nie im Audit-Log. Entfernen möglich; danach ist bei `byok` kein Zugang mehr eingerichtet. Die Firma sieht im Panel, dass ihre Dokumente an den jeweiligen Anbieter gehen. `resolveAiAccess(orgId)` liefert dem KI-Schritt den Zugang (unser, eigener Schlüssel oder keiner mit Grund)
  - _Geprüft gegen echte DB (11 Tests, Google ersetzt), 4 Verschlüsselungs- und 3 Schlüsselprüfungs-Tests, im Browser (14 Prüfungen):_ nur Firmen-Admins (Mentor, Lernende, Fremde nicht), Mandantentrennung, Schlüssel nur verschlüsselt in der Datenbank, nie in Antworten oder Audit, Moduswechsel behält den Schlüssel, nicht lesbarer Schlüssel (anderer `APP_ENCRYPTION_KEY`, veränderter Wert) ergibt „kein Zugang“ statt Absturz, ohne `APP_ENCRYPTION_KEY` 503 für eigene Schlüssel (unser Zugang geht weiter), Rate-Limit 10/h. Mutationstests: 8 Fehler (u. a. Klartext gespeichert, Schlüssel nicht geprüft, Schlüssel in der Adresse, im Audit, Ansicht gibt Schlüssel heraus, Mentoren erlaubt) fallen auf
  - _Nicht geprüft:_ ein echter Aufruf bei Google mit einem gültigen Schlüssel (hier gesperrt); die Prüfung ist über den Ersatz getestet. Der eigentliche KI-Aufruf mit dem Schlüssel der Firma ist noch nicht gebaut: `lib/claude.ts` hat einen globalen Client mit `GEMINI_API_KEY`, für BYOK braucht es einen Client je Schlüssel (kommt mit dem KI-Schritt)
  - _Betrieb:_ `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`) in die `.env` auf dem Server, **nicht ins Datenbank-Backup legen**. Geht er verloren, müssen die Firmen ihre Schlüssel neu eingeben
  - _Noch offen:_ Abrechnung und Limits bei „unser Zugang“ (Kosten tragen wir, Budget je Firma fehlt); ob „unser Zugang“ ein Vertragsmerkmal sein soll (Freischaltung durch den Betreiber)
- [x] Benachrichtigung per E-Mail: Betreiber bei neuer Anfrage, Firma bei Statusänderung und Freigabe
  - _Gebaut (`lib/server/company/request-notifications.ts`):_ Bei einer neuen Anfrage bekommen alle Plattform-Admins mit bestätigter Adresse eine Mail (Firma, Anfragender, Titel, Link zu `/admin/requests`). Bei jeder Statusänderung (Stand gesetzt, Freigabe, Ablehnung) bekommen der Anfragende und alle Firmen-Admins **der Firma** eine Mail mit Stand und Hinweis (ohne Dubletten, nur wer noch zur Firma gehört); bei entzogener Freigabe die Firmen-Admins mit dem Hinweis. Die Mails sind ein Hinweis, nie die einzige Quelle: ohne eingerichteten Versand oder bei Fehlern läuft die Aktion unverändert weiter (nach dem Speichern, ohne Warten)
  - _Geprüft gegen echte DB und lokalen SMTP-Server (5 Tests, alle 432 Tests grün):_ Empfängerkreis (kein unbestätigter Betreiber, keine Lernenden, keine anderen Firmen, keine Dubletten), Inhalt und Links, Verhalten ohne Versand. 5 Mutationstests (unbestätigte Betreiber, alle Mitglieder, Admins aller Firmen, Freigabe und neue Anfrage ohne Mail) fallen auf. Nicht im Browser und nicht mit einem echten Mailanbieter geprüft
  - _Nicht enthalten:_ Mail bei zurückgezogener Anfrage an den Betreiber, Mail beim Abschluss der Prüfung interner Lernpfade, Einstellungen zum Abbestellen. Texte sind nur Deutsch
- [x] Lern-APIs prüfen die Sichtbarkeit (Entwürfe und interne Lernpfade anderer Firmen sind „nicht vorhanden“)
  - _Gebaut (`lib/server/catalog/access.ts`, dieselbe Regel wie die Seiten):_ Guards an `/api/progress`, `exams` (auch die Prüfung selbst, nicht nur die `certId` im Pfad), `study-profile`, `cert/.../offline-package`, `sections/[id]/attempt`, `remediation/[objectiveId]` (GET und Versuch), `study-sessions` (start, Versuch, skip, feedback) und beim Sync offline aufgezeichneter Ereignisse (wer den Lernpfad nicht mehr sehen darf, bekommt nichts mehr verbucht). Gesperrte Ziele antworten wie nicht vorhanden (404), fehlende Ziele und ungültige IDs behalten die bisherige Fehlerbehandlung
  - _Inhaltsmeldungen:_ Meldungen zu Fragen oder Lektionen **interner** Lernpfade werden abgelehnt (422): sie landen sonst in der Prüfliste des Betreibers und widersprächen der Festlegung, dass der Betreiber interne Inhalte nicht sieht
  - _Geprüft gegen echte DB (6 Tests, alle 405 Tests grün) und per Mutationstest (Guard in `progress` entfernt, Sperre bei Inhaltsmeldungen entfernt: je Test fällt durch):_ Betreiber sieht Entwürfe, aber nie interne Lernpfade; Mitglied einer anderen Firma und Nutzer ohne Firma bekommen 404; eigene Firma und allgemeine Lernpfade gehen weiter. Nicht im Browser geprüft
  - _Noch offen (bewusst nicht angefasst):_ `GET /api/remediation/needed` und die Seiten „Meine Prüfungen“ listen eigene Altdaten; die Zuordnung der Lernzeit-Auswertung zu gesperrten Lernpfaden ist nicht gefiltert
- [x] Lernpfade (Zertifizierungen) an Mitglieder der eigenen Firma zuweisen, mit optionaler Frist
  - _Geprüft gegen echte DB (15 Tests) und im Browser (Chromium, Produktions-Build, 19 Prüfungen):_ Firmen-Admin **und Mentor** weisen zu (`POST /api/company/assignments`), Lernende und Nutzer ohne Organisation bekommen 403. Mandantengetrennt: Personen anderer Firmen und unbekannte IDs werden gleich abgelehnt (alles oder nichts, auch die gültige Person in derselben Anfrage wird nicht zugewiesen), eine mitgeschickte `organizationId` wird ignoriert, fremde Zuweisungen sind weder änderbar noch entfernbar (404). Doppelte Zuweisung ändert nichts (Frist bleibt) und wird gemeldet. Frist nur als Datum, nicht in der Vergangenheit. Frist ändern und Entfernen nur bei offenen Zuweisungen. Rate-Limit 60/h je Nutzer, Audit-Ereignisse `assignment.created|due_changed|removed`
  - _Mutationstests:_ ohne Mandantenfilter beim Entfernen fallen 2, ohne Mitgliedsprüfung 1, mit Lernenden als Zuweisenden 4, ohne Nachführen im Lernweg 2, „abgeschlossen schon bei geübt statt beherrscht“ 1 und „abgeschlossen wird wieder geöffnet“ 1 Test durch
  - _Entscheidungen (bitte prüfen):_ Mentor darf zuweisen wie der Firmen-Admin; zugewiesen werden kann jedes Mitglied, auch Admin und Mentor
- [x] Einstieg in den Firmenbereich ohne die Adresse zu kennen
  - _Geprüft im Browser (Chromium, Produktions-Build, 14 Prüfungen):_ Firmen-Admin und Mentor sehen auf der Startseite die Karte „Firmenbereich: <Firma>“ (der Admin mit „Mitarbeiter einladen“, der Mentor ohne) und im Header den Link „Firma“ (auf dem Handy nur das Symbol, kein seitliches Scrollen); beide führen nach `/company`. Lernende und Nutzer ohne Organisation sehen weder Karte noch Link. Nach dem Annehmen einer Einladung landen Admin und Mentor direkt in `/company` (gab es schon)
- [ ] Firmenmodule an einen Lernpfad hängen (allgemeiner Lernpfad plus interne Module) – kommt mit dem KI-Schritt für interne Lernpfade
- [x] Firmendokumente hochladen, ablegen, herunterladen und löschen (Upload-Gerüst, noch ohne KI)
  - _Geprüft gegen echte DB (9 Tests), 49 Tests ohne DB und im Browser (Chromium, Produktions-Build, 17 Prüfungen):_ Firmen-Admin und Mentor laden PDF, .txt und .md hoch (bis 10 MB; Endung, MIME-Typ und Inhalt müssen zusammenpassen: PDF-Signatur, gültiges UTF-8 ohne Binärdaten). Nur Dokumente, die den Secret-Scanner bestehen, werden gespeichert. Mandantengetrennt: Liste, Download und Löschen filtern immer nach der eigenen Organisation (fremde Dokumente: 404), Lernende und Nutzer ohne Organisation bekommen 403. Dedup nur innerhalb einer Firma (Prüfsumme), nie firmenübergreifend. Download nur als Anhang mit `nosniff` und `sandbox`-CSP. Die Liste zeigt nur Metadaten, nie Inhalt. Audit: `document.uploaded|rejected|deleted`
  - _Ablage in der Datenbank (Tabelle `company_document_files`, Migration `0029`):_ wird mit `pg_dump` mitgesichert (kein weiteres Docker-Volume, kein Pfad aus Nutzereingaben) und mit der Organisation gelöscht; das Dokument überlebt das Löschen des Uploaders (Uploader-Verweis `SET NULL`, im Export-Test mit Begründung ausgenommen)
  - _Mutationstests:_ ohne Scanner im Upload fallen 4, ohne Mandantenfilter bei Liste, Download oder Löschen je 1, mit Lernenden als Berechtigten 3, ohne PDF-Signaturprüfung 1, mit Annahme textloser PDFs 3, mit kaputter Schlüssel-Regel 9 Tests durch
- [x] Firmendokument → KI-Entwurf eines internen Lernpfads → Prüfung durch Mentor oder Firmen-Admin der Firma → Freigabe
  - _Gebaut (Migration `0034`, Panel „Interne Lernpfade“ auf `/company` für Firmen-Admin und Mentor, Routen unter `/api/internal-courses`):_ Dokument und Titel wählen, die KI erstellt über die vorhandene Kurs-Pipeline (Blueprint → Probe-Lernziel → Batches → Validierung → Import) einen Entwurf; Stand wird live angezeigt, Abbrechen möglich. Der Lernpfad gehört der Firma (`kind = internal`, Besitzer-Organisation) und startet als Entwurf. Den Entwurf sehen nur Mentor und Firmen-Admin der Firma (zum Prüfen, auch die Lernseiten); „Geprüft – freigeben“ speichert Name und Datum, danach sehen ihn Lernende und er ist zuweisbar. Entwürfe lassen sich verwerfen, freigegebene nicht (wegen Zuweisungen)
  - _KI-Zugang je Firma wirkt:_ alle Aufrufe laufen über den Zugang der Firma (eigener Schlüssel als eigener Client, sonst Plattform); ohne nutzbaren Zugang bricht der Auftrag ab, bevor etwas an die KI geht
  - _Schutz der Firmendaten:_ Dokumente „von der KI ausgeschlossen“ werden nie verwendet; vom Firmen-Admin bestätigte Scanner-Fehlalarme werden zeilengenau **geschwärzt** (Marker statt Zeile), danach wird der Text erneut gescannt, bleibt ein Fund übrig, geht nichts an die KI. Die Quellen stehen im Prompt als reine Daten (Anweisungen darin werden ignoriert). Aufträge tragen `organization_id`: der Betreiber sieht sie weder in der Liste noch per ID (404), Dubletten-Prüfung nur je Firma. Kostenbremse je Auftrag (Ziel 1 USD, hartes Limit 3 USD, auch beim eigenen Schlüssel), höchstens 2 laufende Aufträge je Firma, 5 Aufträge/h je Firma
  - _Geprüft gegen echte DB (13 Tests, alle 420 Tests grün) und im Browser (Chromium, Dev-Server, 13 Prüfungen mit Mentor und Lernendem):_ Mandantentrennung, Rollen (Lernende 403, Betreiber 403), Schwärzen und Nachscan, ausgeschlossene Dokumente, KI-Zugang (nicht eingerichtet, Schlüssel fehlt, eigener Schlüssel, Plattform ohne Schlüssel), Freigabe mit Name und Datum, Sichtbarkeit je Rolle vor und nach der Freigabe. 7 Mutationstests (ohne Schwärzen, ohne Nachscan, Betreiberliste und -route ohne Filter, Entwurf für alle Mitglieder, Freigabe ohne Mandantenfilter, Ausschluss ignoriert) fallen alle auf
  - _Nicht geprüft:_ ein **echter KI-Aufruf** (Gemini ist hier gesperrt, die KI ist in den Tests durch Fake-Provider ersetzt; der eigene Client wird mit einem Stub geprüft). Die Qualität der Entwürfe bei echten Firmendokumenten ist offen, deshalb der Prüfschritt durch Menschen
  - _Noch offen:_ Kosten und Limits je Firma bei „unser Zugang“ (bisher nur je Auftrag), Firmenmodule an einen bestehenden Lernpfad hängen, Wiederholen eines gescheiterten Auftrags (derzeit neu starten), Aktualisieren eines Lernpfads bei neuer Dokumentversion. Ein Neustart des Servers beendet laufende Aufträge (wie bei den allgemeinen Lernpfaden)
  - _Festgelegt:_ Die Firma prüft ihre selbst angelegten internen Lernpfade selbst (Rolle Mentor oder Firmen-Admin, Name und Datum werden gespeichert). Der Betreiber und der externe Dienstleister haben darauf keinen Zugriff, deshalb entfällt dort die Frage nach Geheimhaltung für Firmeninhalte. Der „Externe Prüfer“ (Phase 4) arbeitet nur an allgemeinen Lernpfaden
- [x] Passwort- und Schlüssel-Scanner beim Upload
  - _Geprüft (42 Scanner-Tests, 49 mit Upload-Prüfung, DB- und Browser-Tests, siehe oben):_ erkennt private Schlüssel (PEM), AWS-, GitHub-, Google-, Slack-, Stripe-Schlüssel, JWT, Zugangsdaten in Adressen, Authorization-Header und Passwort-Zuweisungen („Passwort: …“, `DB_PASSWORD = …`, „Das Passwort ist …“). Platzhalter (`<…>`, `${…}`, `****`, `changeme`) und Sätze wie „Passwort: mindestens zwölf Zeichen“ bleiben unbeanstandet, ebenso öffentliche Zertifikate. Ein Fund heißt: **nichts wird gespeichert**, die Antwort nennt Art, Seite und Zeile, **nie den Wert** (Test belegt es auch für das Audit-Log). Fund-Seite stimmt auch bei PDFs
  - _Fehlalarme bestätigen (Entscheidung des Betreibers: „je nach Fehler“):_ Ein **Firmen-Admin** darf Funde bestimmter Arten als unkritisch bestätigen (Migration `0031`): Passwort-Zeilen, Adressen mit Zugangsdaten, Authorization-Header, JWT und AWS-Schlüssel, die in Anleitungen oft als Beispiel vorkommen. **Nie bestätigbar** sind private Schlüssel sowie GitHub-, Slack-, Stripe- und Google-Schlüssel (dort muss die Stelle raus). Mentoren dürfen nicht bestätigen (403). Das Dokument speichert die bestätigten Fundstellen (Art, Seite, Zeile, **nie den Wert**), wer bestätigt hat und wann; die Liste zeigt „n Scanner-Funde bestätigt“, das Audit-Log `document.scanner_suppressed` (Art und Anzahl). Mischfälle: ist neben den bestätigten Funden noch ein nicht bestätigbarer da, wird weiter abgelehnt. **Der KI-Schritt muss genau diese Zeilen vor der Verarbeitung schwärzen** (die Fundstellen sind dafür gespeichert)
  - _Geprüft:_ Scanner- und Upload-Tests (nur die genannten Arten bestätigbar; private Schlüssel nie, auch nicht auf Wunsch; Mischfall), DB-Test (Mentor 403, nicht bestätigbare oder unbekannte Art 400, Mischfall 422, gespeicherte Fundstellen ohne Wert, Audit ohne Wert) und im Browser (14 Prüfungen mit Firmen-Admin und Mentor). Mutationstests: 6 von 7 Fehlern fallen auf (der siebte, fehlendes Filtern im Service, ist durch die Prüfung in Upload und Route doppelt abgesichert)
  - _Festgelegt:_ PDFs ohne auswählbaren Text (eingescannte Seiten) werden abgelehnt, weil der Scanner sie nicht prüfen kann und die spätere KI-Verarbeitung Text braucht
  - _Grenzen:_ Es wird nur Text geprüft. Bilder, gescannte Seiten und Passwörter in Prosa erkennt der Scanner nicht. Reine Buchstaben-Passwörter ohne Ziffer oder Sonderzeichen („Passwort: sommerhaus“) gelten als nicht eindeutig und werden nicht gemeldet. Er ist ein Sicherheitsnetz, keine Garantie
- [x] Praxisaufgaben mit Bestätigung durch den Mentor
  - _Gebaut (Migration `0036`: `practice_tasks`, `practice_task_submissions`; Panel „Praxisaufgaben“ auf `/company`, „Praxisaufgaben“ auf der Startseite der Lernenden, Routen unter `/api/company/practice-tasks`):_ Mentor und Firmen-Admin legen zu einem zuweisbaren Lernpfad der Firma eine Aufgabe an (Titel, Beschreibung). Wer den Lernpfad zugewiesen hat, sieht sie, gibt sie mit freiwilliger Notiz ab („Erledigt – zur Bestätigung“) und kann die Notiz ändern, solange sie wartet. **Eine andere Person** aus Mentor/Firmen-Admin bestätigt oder schickt sie mit Pflicht-Hinweis zur Nacharbeit zurück; die eigene Abgabe bestätigt niemand selbst (auch ein Mentor, der den Lernpfad selbst lernt). Nach Nacharbeit gibt die Person erneut ab (alter Hinweis wird gelöscht). **Bestätigt ist endgültig.** Archivierte Aufgaben zählen nicht mehr, Abgaben bleiben erhalten. Fällt jemand aus der Firma, gehen seine Abgaben mit der Mitgliedschaft
  - _Statusansicht:_ je Zuweisung nur „x von y bestätigt“ (zwei neue Zahlenfelder `practiceConfirmed`/`practiceTotal`, im Architektur-Test bewusst festgehalten), keine Notizen, keine Inhalte. Die Praxis **ändert nichts am Status „abgeschlossen“** (bleibt: jedes Lernziel beherrscht)
  - _Nachweise gehören der Person:_ Datenexport enthält die eigenen Abgaben samt Bestätigung; die Lernenden sehen nur ihren eigenen Stand, nie fremde Abgaben. Audit: `practice_task.created|archived|submitted|confirmed|rework_requested`
  - _Geprüft gegen echte DB (10 Tests, alle 442 Tests grün) und im Browser (Chromium, Dev-Server, 11 Prüfungen mit Mentor, Firmen-Admin und Lernendem, 3 Läufe):_ Rollen, Mandantentrennung, Sichtbarkeit nur mit zugewiesenem Lernpfad, Selbstbestätigung, Endgültigkeit, Nacharbeit mit Hinweis, Status ohne Inhalte, Export, Archivieren, Wegfall mit der Mitgliedschaft. 9 Mutationstests fallen auf (einer deckte zunächst eine Lücke auf: „abgegeben“ zählte in der Statusansicht nicht als „bestätigt“, war aber nicht getestet; Test ergänzt)
  - _Entscheidungen (bitte prüfen):_ Aufgaben hängen am Lernpfad der Firma (nicht an einzelnen Personen); Anlegen nur für zuweisbare Lernpfade; Praxis blockiert den Abschluss nicht; keine Mails zu Abgaben und Bestätigungen; keine Datei-Uploads (nur Text)
  - _Nicht enthalten:_ Frist je Aufgabe, Erinnerungen, Mails bei Abgabe/Bestätigung, Anhänge, englische Texte der Fehlermeldungen
- [x] Statusansicht für die Firma (nur Status, Datum, Frist)
  - _Geprüft:_ `/company` zeigt je Zuweisung Person, Lernpfad, Status (zugewiesen / in Arbeit / abgeschlossen), Zuweisungs-, Frist- und Abschlussdatum und „überfällig“; keine Lerndetails (Browser-Prüfung auf der Tabelle, Feldliste der API ist im Test festgehalten, der Architektur-Test hält den Firmenbereich weiter von Lern-Modulen fern). Jede Firma sieht nur ihre Zuweisungen
  - _Status wird automatisch nachgezogen_ (`lib/server/assignments/sync.ts`, aufgerufen beim Schreiben des Lernfortschritts): **in Arbeit**, sobald es für den Lernpfad Fortschritt gibt; **abgeschlossen**, wenn jedes Lernziel beherrscht ist (`STRONG`: mindestens 3 Antworten, gewichtete Quote ab 80 %, „bestanden heißt beherrscht“). Nur vorwärts: abgeschlossen bleibt abgeschlossen, auch wenn die Quote später sinkt. Geprüft über den echten Lernweg (Quiz-Antworten → Fortschritt → Zuweisung), auch „alle Ziele geübt, aber nicht alle beherrscht → weiter in Arbeit“ und „Üben ohne Zuweisung ändert nichts“
  - _Lernende sehen ihre Zuweisungen_ auf der Startseite („Von deiner Firma zugewiesen“, mit dem Hinweis, was die Firma sieht)
  - _Grenzen:_ Der Status wird nur bei Lernereignissen nachgezogen, nicht beim Zuweisen: wer schon alles beherrscht, gilt erst beim nächsten Üben als abgeschlossen (schützt Vorwissen). Die Definition von „abgeschlossen“ ist eine Annahme (nur Lernziele, keine Abschlussprüfung) und braucht die Entscheidung des Betreibers. Die Browser-Läufe sind manuelle Skripte, nicht Teil der CI
- [ ] Firmenmodule mit Verantwortlichem und „gültig bis“
- [x] Option: Firmendokumente von KI-Verarbeitung ausschließen (beim Upload wählbar, im KI-Schritt durchgesetzt und getestet)
  - _Stand:_ Die Option steht beim Upload zur Wahl und ist am Dokument gespeichert (`exclude_from_ai`). Sie wirkt erst, wenn es den KI-Schritt gibt, deshalb bleibt der Punkt offen
- [ ] KI-Zugang so konfiguriert, dass keine Kundendaten zum Training verwendet werden, möglichst EU-Verarbeitung
  - _Betreiber-Entscheidung zum Zugang bei internen Lernpfaden:_ entweder **BYOK** (die Firma bringt ihren eigenen Schlüssel mit und zahlt dort) oder **über unseren Zugang**, siehe den Punkt „KI-Zugang je Firma“. Bei BYOK gilt der Vertrag der Firma mit dem Anbieter, bei unserem Zugang gelten unsere Konditionen (Training, Region): dieser Punkt betrifft deshalb vor allem unseren Zugang

### Gate 3
- [ ] Testfirma durchläuft: einladen → zuweisen → Dokument zu Lernpfad → Praxisaufgabe → Status

---

## Phase 4 – Inhalte und Didaktik

### Inhalte
- [ ] Lernpfad Observability (Metriken, Logs, Traces, Alerting; Prometheus, Grafana, Loki, Alloy)
- [ ] 2–3 Troubleshooting-Szenarien mit Hilfe-Leiter (Denkanstoß → Eingrenzung → Lektion → Lösung)
- [ ] Freigabe-Metadaten pro Inhalt: Name, Datum, Version
- [ ] Review-Oberfläche mit Quellenbeleg pro Frage und Checkliste
- [ ] Automatische Vorprüfung (Dubletten, Mehrdeutigkeit, Abdeckung)
- [ ] Versionierung von Kursen, „gültig bis“, Wiedervorlage auffälliger Fragen
- [ ] Rolle „Externer Prüfer“ mit Zugriff nur auf zugewiesene **allgemeine** Kurse (nie auf interne Lernpfade einer Firma)

### Didaktik
- [ ] Kompetenzmodell mit Konzept- und Tool-Ebene
- [ ] Brückenpfade (z. B. AWS → Azure, Prometheus → Azure Monitor)
- [ ] Modul „KI-Ergebnisse prüfen“ (generierten Code lesen, Fehler finden)
- [ ] Wissenssicherung: KI-gestützte Interviews mit Seniors → Lernpfad, vom Senior freigegeben

---

## Phase 5 – Pflichtschulungen und interne Wechsel

### Pflichtschulungen
- [ ] Pflicht-Zuweisungen mit Frist und Wiederholung, nach Rolle oder Abteilung
- [ ] Erinnerungen und Eskalation
- [ ] Teilnahmebescheinigung und Audit-Export (Kursversion, Datum)
- [ ] Nutzer-Import per CSV

### Interne Wechsel
- [ ] Rollenprofile als Kompetenzbündel
- [ ] Lückenanalyse zwischen Nachweisen und Zielrolle (nur für die Person sichtbar)
- [ ] Teilen von Nachweisen nur auf Wunsch der Person

---

## Phase 6 – Launch-Technik

- [ ] Checkout und Kundenportal anbinden, Zugriff an Abo bzw. Lizenz koppeln
- [ ] Demo ohne Konto
- [ ] Datensparsame Analytics
- [ ] Onboarding-Flow für neue Firmen
- [ ] E2E-Tests der Kernflows (Registrierung → Firma → Zuweisung → Lernpfad → Abschluss)
- [ ] Lighthouse- und Accessibility-Check
- [ ] Anleitung „Zum Home-Bildschirm hinzufügen“ für iOS

### Gate 6
- [ ] Ein neuer Kunde kann ohne Hilfe starten

---

## Phase 7 – Skalierung

- [ ] Anmeldung über Firmenkonto (SSO, z. B. Microsoft Entra ID) und automatische Nutzerverwaltung
- [ ] Externer Sicherheitstest (Penetrationstest) und Behebung der Befunde

---

## Später (bewusst zurückgestellt)

- [ ] Nachweise auf offenen Standards (Open Badges 3.0, European Digital Credentials)
- [ ] Echte Übungsumgebungen (Container) für Troubleshooting
- [ ] Einträge in Google Play und Microsoft Store
- [ ] Phishing-Simulationen (technisch erst nach Klärung der Rahmenbedingungen)
