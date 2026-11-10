# Sammelroadmap – was noch offen ist

> **Stand 05.11.2026.** Eine Übersicht über alle offenen Punkte aus den anderen Roadmaps in diesem Ordner. Begründungen, Prüfnachweise und Einzelheiten stehen in der verlinkten Datei. Die Punkte werden dort gepflegt: Wird ein Punkt dort abgehakt, setzt man den Haken hier mit.
>
> Betrieb und Sicherheit (Phase 0 der technischen Roadmap und Phase 6 der Datenintegrität) hat der Betreiber am 05.11.2026 als erledigt gemeldet und ist deshalb nicht mehr aufgeführt. Ausnahmen sind die CI und die vier Punkte unter „Gemeldet, aber auf `main` noch offen“.

---

## 1. Als Nächstes

Offen, und laut Betreiber arbeitet gerade niemand daran.

- [ ] **CI: Vitest und Playwright gegen einen Produktions-Build ausführen** (`pwa-hardening-review.md`, Phase 4). Hinweis: `.github/workflows/ci.yml` führt `npm test` und `npm run test:e2e` bereits aus. Zu klären ist, was an dem Punkt noch fehlt, bevor er abgehakt wird.
- [ ] **Externer Penetrationstest** und Behebung der Befunde (`ROADMAP-TECHNISCH.md`, Phase 7).
- [ ] **Web Push** (`roadmap_pwa.md`, Phase 6). Derselbe Punkt steht auch in `ROADMAP-UI.md` („Später“), `pwa-hardening-review.md` (Phase 4) und `umsetzungsplan.md` (Stufe 5).
  - [ ] VAPID-Push für Prüfungs- und Wiederholungserinnerungen, Abo-Tabelle pro Gerät, Opt-in in den Einstellungen, Abmeldung beim Logout.
  - [ ] Erinnerungszeitpunkte aus der PSRP-HR-Planungsschicht ableiten (Tageszeit, Arbeitstag).
  - [ ] Hinweis in der Oberfläche: Auf iOS nur für installierte PWAs ab iOS 16.4.
  - [ ] CSP prüfen.
- [ ] **Prüfer** (`roadmap_pruefer.md`)
  - [ ] Phase 6: Kennzahlen je Prüfer und Freigabe (nur Admin).
  - [ ] Phase 6: Zweitprüfung als Stichprobe, Abweichungen landen beim Admin.
  - [ ] Phase 6: Hinweis an Admin, wenn ein Prüfer deutlich über dem Durchschnitt liegt.
  - [ ] Phase 6: Wiedervorlage („Prüfung empfohlen“) bei neuer Prüfungsversion oder neuer Quellenausgabe.
  - [ ] Phase 7: Expertenvertrag (Nutzungsrechte, Verschwiegenheit, Haftung, Einwilligung zum Profil, Widerruf).
  - [ ] Phase 7: Datenschutzerklärung um öffentliche Prüferprofile ergänzen.
  - [ ] Phase 7: Hinweistext am Siegel („Geprüft“ heißt fachlich richtig zum angegebenen Stand, keine Bestehensgarantie).
  - [ ] Phase 7: Herstellerlogos nur nach deren Richtlinien, im Zweifel nur Text.
- [ ] **Gemeldet, aber auf `main` noch offen** (`ROADMAP-TECHNISCH.md`, Phase 0, und `roadmap_datenintegritaet.md`, Phase 6)
  - [ ] Dockerfile nutzt `output: "standalone"`.
  - [ ] Service Worker: angemeldete Seiten gar nicht erst cachen.
  - [ ] API-Fehler der Admin-Routen `sources/[id]/blueprint` und `sources/[id]/parse` (502) generisch machen.
  - [ ] Restore-Test mit Datum im Protokoll von `docs/BACKUP.md` festhalten.

---

## 2. Produkt

Laut Betreiber wird hier gerade viel erledigt. Die Punkte bleiben stehen, bis sie in der Quelldatei abgehakt sind. Den Stand je Punkt hat niemand einzeln geprüft.

Quelle für alle Punkte dieses Abschnitts ist `ROADMAP-TECHNISCH.md`, sofern nichts anderes steht.

**Phase 3, Firmenfunktionen**
- [ ] KI-Zugang so konfigurieren, dass keine Kundendaten zum Training verwendet werden, möglichst mit EU-Verarbeitung.

**Phase 4, Inhalte**
- [ ] Lernpfad Observability (Metriken, Logs, Traces, Alerting).
- [ ] 2–3 Troubleshooting-Szenarien mit Hilfe-Leiter.
- [ ] Freigabe-Metadaten pro Inhalt: Name, Datum, Version.
- [ ] Review-Oberfläche mit Quellenbeleg pro Frage und Checkliste.
- [ ] Automatische Vorprüfung (Dubletten, Mehrdeutigkeit, Abdeckung).
- [ ] Versionierung von Kursen, „gültig bis“, Wiedervorlage auffälliger Fragen.
- [ ] Rolle „Externer Prüfer“ mit Zugriff nur auf zugewiesene allgemeine Kurse.

**Phase 4, Didaktik**
- [ ] Kompetenzmodell mit Konzept- und Tool-Ebene.
- [ ] Brückenpfade (zum Beispiel AWS nach Azure).
- [ ] Modul „KI-Ergebnisse prüfen“.
- [ ] Wissenssicherung: KI-gestützte Interviews mit Seniors, vom Senior freigegeben.

**Phase 5, Pflichtschulungen und interne Wechsel**
- [ ] Teilnahmebescheinigung und Audit-Export (Kursversion, Datum).
- [ ] Nutzer-Import per CSV.
- [ ] Rollenprofile als Kompetenzbündel.
- [ ] Lückenanalyse zwischen Nachweisen und Zielrolle (nur für die Person sichtbar).
- [ ] Teilen von Nachweisen nur auf Wunsch der Person.

**Phase 6, Launch-Technik**
- [ ] Checkout und Kundenportal anbinden, Zugriff an Abo oder Lizenz koppeln.
- [ ] Demo ohne Konto.
- [ ] Datensparsame Analytics.
- [ ] Onboarding-Flow für neue Firmen.
- [ ] E2E-Tests der Kernflows (Registrierung bis Abschluss).
- [ ] Lighthouse- und Accessibility-Check.
- [ ] Anleitung „Zum Home-Bildschirm hinzufügen“ für iOS.

**Zurückgestellt (`ROADMAP-TECHNISCH.md`, „Später“)**
- [ ] Nachweise auf offenen Standards (Open Badges 3.0, European Digital Credentials).
- [ ] Echte Übungsumgebungen (Container) für Troubleshooting.
- [ ] Einträge in Google Play und Microsoft Store.
- [ ] Phishing-Simulationen, erst nach Klärung der Rahmenbedingungen.

**Oberfläche (`ROADMAP-UI.md`)**
- [ ] Ergebnisseite nach Abschlussprüfung oder Simulation: Fortschrittsring mit Bestehensgrenze, Balken je Domain, Buttons „Falsche Antworten durchgehen“ und „Gezielt üben“.
- [ ] Command-Palette (`⌘K`).
- [ ] „Meine Schwachstellen“ mit Sitzung auf Knopfdruck.
- [ ] Katalog-Gruppen als Vorlage für Firmen.
- [ ] Automatisches Onboarding in Kursgruppen eines Teams.
- [ ] Skill-Abdeckung je Team, nur aggregiert und nie als Vergleich.
- [ ] Praxis-Labs, erst Kosten und Betrieb klären.

---

## 3. Übrige Punkte

**Entscheidungen des Betreibers (`ROADMAP-TECHNISCH.md`, Phase 2)**
- [ ] Mailanbieter für den Kundenbetrieb: EU-Anbieter oder Google Workspace mit Auftragsverarbeitungsvertrag.
- [ ] Auth-Bibliothek: bei `next-auth` 5.0.0-beta.32 bleiben (Empfehlung im Dokument) oder wechseln.

**Geräte**
- [ ] Prüfung auf echten Geräten: iOS Safari (Safe-Area, Prüfungsmodus) und Android Chromium (`beforeinstallprompt`, Background Sync). Quelle: `pwa-hardening-review.md`, Phase 4.

**Didaktik (`roadmap_didaktik.md`)**
- [ ] Phase 7: Wie gut sagt der Bereitschaftswert das echte Ergebnis vorher? Als Grundlage, um die Readiness-Engine zu kalibrieren.
- [ ] Phase 7: Kennzahlen je Feature-Flag (Behaltensquote nach 30 Tagen, richtig und „sicher“ bei Varianten, Abbruch, Bestehen).
- [ ] Phase 7: Auswertung Rückblick: vorhergesagte gegen tatsächliche Abrufwahrscheinlichkeit, Einfluss von Tagesform und Tageszeit.
- [ ] Phase 7: Auswertung Verstehens-Modus (Anteil `resolved`, Dauer, Abbruchquote).
- [ ] Phase 7: Auswertung als beschreibender Bericht, solange die Nutzerzahlen klein sind.
- [ ] Phase 11: Planung auch auf Konzept-Ebene.
- [ ] Phase 11: Gemischte Sessions über mehrere Domains erzwingen (Interleaving).
- [ ] Phase 11: Hilfe-Leiter auch für normale Szenario-Fragen.
- [ ] Phase 11: Brückenpfade zwischen ähnlichen Tools.

**Motivation (`roadmap_motivation.md`, `umsetzungsplan.md`)**
- [ ] Optional: Pausen-Grafik als Admin- oder Demo-Seite mit Schiebereglern.
- [ ] Phase 10: Ziele für die Kennzahlen festlegen (erst nach den ersten Daten) und Reaktivierung zusätzlich per Push. Die Kennzahlen selbst gibt es im Export (Abschnitt `engagement`).

**Aus der v2-Neuarchitektur (`roadmap2.md`)**

Diese vier Punkte stammen aus dem alten Tracker. Zwei davon sind wahrscheinlich überholt und sollten vor dem Abhaken oder Streichen geprüft werden.
- [ ] Offizielle Prüfungsziele und Domänengewichte für Security+ SY0-701: Bisher stehen nur die fünf Domänennamen in der Datenbank.
- [ ] „Noch nicht gebaut“: Anmelde- und Registrierungsoberfläche sowie `proxy.ts`-Absicherung. Wahrscheinlich überholt, beides gibt es inzwischen.
- [ ] Schritt 15, Quellenbindung und Dateisuche: Die frühere Umsetzung war nicht funktionsfähig und wurde gelöscht.
- [ ] Schritt 17, Offline-PWA für Inhalte aus dem Backend. Möglicherweise durch die Offline-Pakete aus `roadmap_pwa.md` überholt.

---

## 4. Nicht als Aufgabe gezählt

Diese Haken stehen in den Quelldateien, sind aber keine Aufgaben:

- Die fünf Leitplanken in `ROADMAP-TECHNISCH.md`, die noch offen sind. Sie gelten dauerhaft und werden bei jeder neuen Funktion geprüft.
- Gate 0 und Gate 6 in `ROADMAP-TECHNISCH.md`. Die Punkte von Phase 0 sind abgehakt, das Gate selbst abzuhaken ist eine Entscheidung des Betreibers.
- Die Definition-of-Done-Checkliste am Ende von `ROADMAP-UI.md` (zehn Punkte), die für jedes neue Feature gilt.
- Ein Hinweis-Haken im Firmengerüst von Phase 1 („Die echten Funktionen bleiben in Phase 3“).
