# Technische Roadmap – Learning-Plattform

> **Geltungsbereich:** ausschließlich Technik – Infrastruktur, Sicherheit, Datenmodell, Backend, Frontend, Qualität, Betrieb. Vertrieb, Gespräche, Recht, Preise, Finanzierung und Marketing stehen bewusst nicht hier.
>
> **Regel:** Ein Punkt wird erst abgehakt, wenn er gebaut *und* geprüft ist (Test, Lauf oder Review). Eine Phase gilt erst als abgeschlossen, wenn ihr **Gate** erfüllt ist.
>
> **Einzige gepflegte Roadmap.** Die frühere vollständige Fassung (mit Vertrieb, Recht, Finanzierung) wird nicht weitergeführt. Ist-Stand-Vermerke beziehen sich auf den Repo-Abgleich vom 04.10.2026 und sind Lesebefunde, keine Testergebnisse.

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

- [x] Lernpfade (Zertifizierungen) an Mitglieder der eigenen Firma zuweisen, mit optionaler Frist
  - _Geprüft gegen echte DB (15 Tests) und im Browser (Chromium, Produktions-Build, 19 Prüfungen):_ Firmen-Admin **und Mentor** weisen zu (`POST /api/company/assignments`), Lernende und Nutzer ohne Organisation bekommen 403. Mandantengetrennt: Personen anderer Firmen und unbekannte IDs werden gleich abgelehnt (alles oder nichts, auch die gültige Person in derselben Anfrage wird nicht zugewiesen), eine mitgeschickte `organizationId` wird ignoriert, fremde Zuweisungen sind weder änderbar noch entfernbar (404). Doppelte Zuweisung ändert nichts (Frist bleibt) und wird gemeldet. Frist nur als Datum, nicht in der Vergangenheit. Frist ändern und Entfernen nur bei offenen Zuweisungen. Rate-Limit 60/h je Nutzer, Audit-Ereignisse `assignment.created|due_changed|removed`
  - _Mutationstests:_ ohne Mandantenfilter beim Entfernen fallen 2, ohne Mitgliedsprüfung 1, mit Lernenden als Zuweisenden 4, ohne Nachführen im Lernweg 2, „abgeschlossen schon bei geübt statt beherrscht“ 1 und „abgeschlossen wird wieder geöffnet“ 1 Test durch
  - _Entscheidungen (bitte prüfen):_ Mentor darf zuweisen wie der Firmen-Admin; zugewiesen werden kann jedes Mitglied, auch Admin und Mentor
- [x] Einstieg in den Firmenbereich ohne die Adresse zu kennen
  - _Geprüft im Browser (Chromium, Produktions-Build, 14 Prüfungen):_ Firmen-Admin und Mentor sehen auf der Startseite die Karte „Firmenbereich: <Firma>“ (der Admin mit „Mitarbeiter einladen“, der Mentor ohne) und im Header den Link „Firma“ (auf dem Handy nur das Symbol, kein seitliches Scrollen); beide führen nach `/company`. Lernende und Nutzer ohne Organisation sehen weder Karte noch Link. Nach dem Annehmen einer Einladung landen Admin und Mentor direkt in `/company` (gab es schon)
- [ ] Firmenmodule an einen Lernpfad hängen (Basiskurs plus Firmenmodule) – kommt mit dem Dokument-Upload
- [x] Firmendokumente hochladen, ablegen, herunterladen und löschen (Upload-Gerüst, noch ohne KI)
  - _Geprüft gegen echte DB (9 Tests), 49 Tests ohne DB und im Browser (Chromium, Produktions-Build, 17 Prüfungen):_ Firmen-Admin und Mentor laden PDF, .txt und .md hoch (bis 10 MB; Endung, MIME-Typ und Inhalt müssen zusammenpassen: PDF-Signatur, gültiges UTF-8 ohne Binärdaten). Nur Dokumente, die den Secret-Scanner bestehen, werden gespeichert. Mandantengetrennt: Liste, Download und Löschen filtern immer nach der eigenen Organisation (fremde Dokumente: 404), Lernende und Nutzer ohne Organisation bekommen 403. Dedup nur innerhalb einer Firma (Prüfsumme), nie firmenübergreifend. Download nur als Anhang mit `nosniff` und `sandbox`-CSP. Die Liste zeigt nur Metadaten, nie Inhalt. Audit: `document.uploaded|rejected|deleted`
  - _Ablage in der Datenbank (Tabelle `company_document_files`, Migration `0029`):_ wird mit `pg_dump` mitgesichert (kein weiteres Docker-Volume, kein Pfad aus Nutzereingaben) und mit der Organisation gelöscht; das Dokument überlebt das Löschen des Uploaders (Uploader-Verweis `SET NULL`, im Export-Test mit Begründung ausgenommen)
  - _Mutationstests:_ ohne Scanner im Upload fallen 4, ohne Mandantenfilter bei Liste, Download oder Löschen je 1, mit Lernenden als Berechtigten 3, ohne PDF-Signaturprüfung 1, mit Annahme textloser PDFs 3, mit kaputter Schlüssel-Regel 9 Tests durch
- [ ] Firmendokument → KI-Entwurf → Mentor prüft und gibt frei (der KI-Schritt und die Freigabe fehlen noch)
- [x] Passwort- und Schlüssel-Scanner beim Upload
  - _Geprüft (42 Scanner-Tests, 49 mit Upload-Prüfung, DB- und Browser-Tests, siehe oben):_ erkennt private Schlüssel (PEM), AWS-, GitHub-, Google-, Slack-, Stripe-Schlüssel, JWT, Zugangsdaten in Adressen, Authorization-Header und Passwort-Zuweisungen („Passwort: …“, `DB_PASSWORD = …`, „Das Passwort ist …“). Platzhalter (`<…>`, `${…}`, `****`, `changeme`) und Sätze wie „Passwort: mindestens zwölf Zeichen“ bleiben unbeanstandet, ebenso öffentliche Zertifikate. Ein Fund heißt: **nichts wird gespeichert**, die Antwort nennt Art, Seite und Zeile, **nie den Wert** (Test belegt es auch für das Audit-Log). Fund-Seite stimmt auch bei PDFs
  - _Entscheidungen (bitte prüfen):_ Kein Überschreiben („trotzdem hochladen“): bei einem Fund muss die Stelle geschwärzt werden. PDFs ohne auswählbaren Text (eingescannte Seiten) werden abgelehnt, weil der Scanner sie nicht prüfen kann und die spätere KI-Verarbeitung Text braucht
  - _Grenzen:_ Es wird nur Text geprüft. Bilder, gescannte Seiten und Passwörter in Prosa erkennt der Scanner nicht. Reine Buchstaben-Passwörter ohne Ziffer oder Sonderzeichen („Passwort: sommerhaus“) gelten als nicht eindeutig und werden nicht gemeldet. Er ist ein Sicherheitsnetz, keine Garantie
- [ ] Praxisaufgaben mit Bestätigung durch den Mentor
- [x] Statusansicht für die Firma (nur Status, Datum, Frist)
  - _Geprüft:_ `/company` zeigt je Zuweisung Person, Lernpfad, Status (zugewiesen / in Arbeit / abgeschlossen), Zuweisungs-, Frist- und Abschlussdatum und „überfällig“; keine Lerndetails (Browser-Prüfung auf der Tabelle, Feldliste der API ist im Test festgehalten, der Architektur-Test hält den Firmenbereich weiter von Lern-Modulen fern). Jede Firma sieht nur ihre Zuweisungen
  - _Status wird automatisch nachgezogen_ (`lib/server/assignments/sync.ts`, aufgerufen beim Schreiben des Lernfortschritts): **in Arbeit**, sobald es für den Lernpfad Fortschritt gibt; **abgeschlossen**, wenn jedes Lernziel beherrscht ist (`STRONG`: mindestens 3 Antworten, gewichtete Quote ab 80 %, „bestanden heißt beherrscht“). Nur vorwärts: abgeschlossen bleibt abgeschlossen, auch wenn die Quote später sinkt. Geprüft über den echten Lernweg (Quiz-Antworten → Fortschritt → Zuweisung), auch „alle Ziele geübt, aber nicht alle beherrscht → weiter in Arbeit“ und „Üben ohne Zuweisung ändert nichts“
  - _Lernende sehen ihre Zuweisungen_ auf der Startseite („Von deiner Firma zugewiesen“, mit dem Hinweis, was die Firma sieht)
  - _Grenzen:_ Der Status wird nur bei Lernereignissen nachgezogen, nicht beim Zuweisen: wer schon alles beherrscht, gilt erst beim nächsten Üben als abgeschlossen (schützt Vorwissen). Die Definition von „abgeschlossen“ ist eine Annahme (nur Lernziele, keine Abschlussprüfung) und braucht die Entscheidung des Betreibers. Die Browser-Läufe sind manuelle Skripte, nicht Teil der CI
- [ ] Firmenmodule mit Verantwortlichem und „gültig bis“
- [ ] Option: Firmendokumente von KI-Verarbeitung ausschließen
  - _Stand:_ Die Option steht beim Upload zur Wahl und ist am Dokument gespeichert (`exclude_from_ai`). Sie wirkt erst, wenn es den KI-Schritt gibt, deshalb bleibt der Punkt offen
- [ ] KI-Zugang so konfiguriert, dass keine Kundendaten zum Training verwendet werden, möglichst EU-Verarbeitung

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
- [ ] Rolle „Externer Prüfer“ mit Zugriff nur auf zugewiesene Kurse

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
