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
- [ ] Dockerfile nutzt `output: "standalone"` (kleineres Image, keine Dev-Tools)
  - _Ist-Stand:_ Option steht in `next.config.ts`, Dockerfile kopiert noch `.next` + volles `node_modules`
  - _Offen, nicht verifizierbar ohne Docker-Daemon:_ Das Image muss weiter `drizzle-kit`/`tsx` für Migration beim Start und die Admin-Skripte (`user:*`, `cert:*`, `content:*`) enthalten. Eine schlanke Variante bräuchte ein eigenes Migrationsskript auf Basis von `drizzle-orm` und einen Image-Build-Test
- [ ] Datenbank-Migrationen beim Deploy automatisch ausführen
  - _Stand:_ `command: npm run db:migrate && npm start` in `docker-compose.yml`. **Geprüft** gegen eine echte PostgreSQL-16-Instanz: komplette Kette (25 Migrationen) auf leerer DB, zweiter Lauf ändert nichts. **Offen:** der Container-Start selbst (hier gibt es keinen Docker-Daemon). Bei einer Umstellung auf `standalone` muss `drizzle-kit` im Image bleiben

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
- [ ] Service Worker: angemeldete Seiten gar nicht erst cachen
  - _Offen:_ Navigationen laufen über Stale-While-Revalidate. Eine Änderung (z. B. NetworkFirst) berührt den Offline-Modus (IndexedDB-Paket, R4) und muss im Browser mit Offline-Test geprüft werden
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
  - _Ist-Stand:_ `/api/health` und `/api/ready` vorhanden, kein externes Monitoring
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
- [ ] Rechte-Tests grün und in der CI (CI-Workflow mit Postgres-Dienst und Migrationslauf angepasst; erst nach grünem Lauf am PR abhaken)
- [x] Firmengerüst per Browser-Test mit allen drei Rollen geprüft (manuell, siehe oben)

---

## Phase 2 – Accounts

- [ ] E-Mail-Versand (EU-Anbieter)
- [ ] E-Mail-Verifizierung und Passwort-Reset
- [ ] Passwort ändern, Konto löschen, Datenexport (Self-Service)
- [ ] Auth-Bibliothek auf stabile Version bringen oder Alternative prüfen
  - _Ist-Stand:_ `next-auth` `5.0.0-beta.32`
- [ ] Mitarbeiter per E-Mail einladen und einer Organisation zuordnen

### Gate 2
- [ ] Neues Konto kann sich registrieren, verifizieren, Passwort zurücksetzen und löschen

---

## Phase 3 – Firmenfunktionen

- [ ] Lernpfade zuweisen (Basiskurs plus Firmenmodule)
- [ ] Firmendokument hochladen → KI-Entwurf → Mentor prüft und gibt frei
- [ ] Passwort- und Schlüssel-Scanner beim Upload
- [ ] Praxisaufgaben mit Bestätigung durch den Mentor
- [ ] Statusansicht für die Firma (nur Status, Datum, Frist)
- [ ] Firmenmodule mit Verantwortlichem und „gültig bis“
- [ ] Option: Firmendokumente von KI-Verarbeitung ausschließen
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
