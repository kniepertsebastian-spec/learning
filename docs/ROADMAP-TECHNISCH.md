# Technische Roadmap – Learning-Plattform

> **Geltungsbereich:** ausschließlich Technik – Infrastruktur, Sicherheit, Datenmodell, Backend, Frontend, Qualität, Betrieb. Vertrieb, Gespräche, Recht, Preise, Finanzierung und Marketing stehen bewusst nicht hier.
>
> **Regel:** Ein Punkt wird erst abgehakt, wenn er gebaut *und* geprüft ist (Test, Lauf oder Review). Eine Phase gilt erst als abgeschlossen, wenn ihr **Gate** erfüllt ist.
>
> **Quelle:** abgeleitet aus `docs/ROADMAP-LERNPLATTFORM.md` (nur technische Punkte). Ist-Stand-Vermerke beziehen sich auf den Repo-Abgleich vom 04.10.2026 und sind Lesebefunde, keine Testergebnisse.

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
- [ ] Datenbank-Migrationen beim Deploy automatisch ausführen
  - _Stand:_ `command: npm run db:migrate && npm start` in `docker-compose.yml` gesetzt, Compose-Syntax geprüft; **Lauf gegen eine echte DB steht aus** (erst dann abhaken)

### Sicherheit
- [ ] Rate-Limits für Login und Registrierung
  - _Ist-Stand:_ `lib/server/admin/rate-limit.ts` deckt nur Admin-Routen ab
- [ ] Rate-Limits und Tageskontingent pro Nutzer für alle KI-Routen
  - _Ist-Stand:_ nur Admin-Generierung; `/api/remediation/[objectiveId]` nicht abgedeckt
- [ ] Remediation-Neugenerierung (`?regenerate=true`) auf `POST` mit Abklingzeit umstellen
  - _Ist-Stand:_ `app/api/remediation/[objectiveId]/route.ts` liest den Parameter per GET
- [ ] KI-Budget auf Gemini-Preise umstellen (`ANTHROPIC_*_PRICE_*` ersetzen) inkl. Tests
  - _Ist-Stand:_ `lib/server/admin/content-generation.ts` und Test nutzen noch `ANTHROPIC_*`
- [ ] Security-Header (CSP, HSTS, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy)
  - _Ist-Stand:_ `deploy/Caddyfile` setzt nur `encode`, `next.config.ts` ohne `headers()`
- [ ] Service Worker: angemeldete Seiten nicht cachen, `ui-cache` beim Logout leeren
  - _Ist-Stand:_ API ist `NetworkOnly`; Seiten in `ui-cache` (Stale-While-Revalidate), kein Leeren beim Logout
- [ ] API-Fehler nach außen generisch, Details nur ins Log
- [ ] E-Mail-Adressen normalisieren (Kleinschreibung) plus Migration bestehender Konten
  - _Stand:_ `lib/server/email.ts` (`normalizeEmail`, Unit-Test grün) in Registrierung und Login eingebaut; Migration `drizzle/0024_normalize_user_emails.sql` geschrieben. **Migration noch nicht gegen eine DB gelaufen** (erst dann abhaken; Schreibweisen-Duplikate würden sie abbrechen lassen)

### Qualität und Betrieb
- [ ] GitHub Actions: Lint, Typecheck, Tests, Build bei jedem Push
  - _Ist-Stand:_ kein `.github/workflows`
- [ ] Branch Protection auf `main`
- [ ] Nächtliches, verschlüsseltes Offsite-Backup (Postgres und Quell-PDFs)
  - _Ist-Stand:_ Verfahren in `docs/BACKUP.md` beschrieben, keine Automatisierung
- [ ] **Restore einmal vollständig getestet**
- [ ] Error-Tracking und Uptime-Monitoring
  - _Ist-Stand:_ `/api/health` und `/api/ready` vorhanden, kein externes Monitoring
- [ ] Repo aufräumen: Patch-Datei und `QUICK_COMMANDS.sh` entfernen, README ausbauen, alte Roadmaps archivieren

### Gate 0
- [ ] Keine offenen kritischen Punkte aus dem Sicherheits-Review
- [ ] CI grün, Backup-Restore erfolgreich getestet

---

## Phase 1 – Mandanten, Rollen, Rechte

**Ziel:** Strikte Datentrennung als technische Basis für alle Firmenfunktionen.

- [ ] Organisation (Mandant) mit strikter Datentrennung zwischen Firmen
- [ ] Rollen: Firmen-Admin, Mentor, Lernender
- [ ] Trennung privat / betrieblich im Datenmodell (Lerndetails nie im Firmenbereich abfragbar)
- [ ] Separate Firmen-API, die nur Status, Datum und Frist liefert
- [ ] Automatisierte Zugriffstests: Firma A sieht nie Daten von Firma B, Arbeitgeber sieht nie Lerndetails

### Gate 1
- [ ] Rechte-Tests grün und in der CI

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
