# Roadmap: was noch offen ist

> **Stand 19.11.2026.** Die eine aktuelle Roadmap. Neu: die Befunde aus dem [Review vom 19.11.2026](review-2026-11-19.md) (Abschnitt 1a und 2a, Nummern R1 bis R13). Sie ersetzt die Sammelroadmap vom 05.11.2026 und die Einzel-Roadmaps, die jetzt unter [`archiv/`](archiv/README.md) liegen. Dort stehen Begründungen, Prüfnachweise und Einzelheiten zu jedem Punkt; die Quelle steht in Klammern.
>
> Neue Punkte kommen hierher, erledigte werden hier abgehakt und beim nächsten Aufräumen entfernt. Die Archivdateien werden nicht mehr gepflegt.
>
> **Wie gezählt wurde:** alle offenen Haken (`- [ ]`) aus den archivierten Dateien und den Aufgaben aus `archiv/review-2026-11-12/`. Stichproben am Code: Wo ein Punkt im Archiv noch offen steht, `main` ihn aber schon erfüllt, steht er unter „Im Archiv offen, im Code erledigt“. Alles andere ist nicht einzeln am Code nachgeprüft.

---

## 1. In Arbeit

- [x] **Logout macht das Token nicht ungültig** (`archiv/review-2026-11-12/20-logout-sitzungen.md`, Befund 10). Entschieden am 19.11.2026: Abmelden gilt auf allen Geräten (`sessionVersion` steigt, Hinweis im Benutzermenü). Test: Token von vor dem Abmelden wird abgelehnt (PR #212).
- [x] **Dependabot-PR #210** (14 Minor- und Patch-Updates). Am 19.11.2026 gemergt, CI grün.

## 1a. Aus dem Review vom 19.11.2026: vor dem ersten echten Kurslauf

Begründung und Nachweise je Punkt in [`review-2026-11-19.md`](review-2026-11-19.md).

- [x] **R1** Gemini-Antworten: `finishReason` auswerten. `MAX_TOKENS` als eigener Fehler statt Reparaturversuch, `SAFETY`/`RECITATION` ohne bezahlte Wiederholungen (`lib/ai/generate.ts`). Erledigt: kein neuer Versuch, keine Reparatur, kein zweiter Durchgang; gilt auch für Batch-Antworten; `finishReason` steht in der `USAGE`-Zeile.
- [x] **R2** Kein stiller, prozessweiter Wegfall von `maxOutputTokens` und Denkbudget nach einem allgemeinen „invalid argument“ (`modelsWithoutLimits`); den Wechsel im Auftrag anzeigen. Erledigt: erst nur ohne Denk-Einstellung, dann ohne Limit, gemerkt 1 Stunde; Hinweis in der Meldung des Auftrags und `configFallback=` in der `USAGE`-Zeile.
- [ ] **Erster echter Lauf der neuen Kursgenerierung (PR #213)** mit kleinem Kurs und niedrigem Kostenlimit: `USAGE`-Zeilen und `finishReason` mitschreiben, Kosten mit der Google-Abrechnung abgleichen, dabei R3 beobachten (`PROCESS`-Zeilen im Log, Anleitung in [`docs/MONITORING.md`](../MONITORING.md), Abschnitt „Erster echter Kurslauf“).

## 2a. Aus dem Review vom 19.11.2026: Betrieb

- [x] **R3a** Messen und Pool: Event-Loop-Verzögerung, Speicher und laufende Aufträge in `/api/monitor` und als `PROCESS`-Zeile während einer Kursgenerierung; `monitor.sh` meldet ab 500 ms. Pool mit `max`, `idle_timeout`, `statement_timeout` und `idle_in_transaction_session_timeout` (`lib/server/db/client.ts`).
- [ ] **R3b** Nur wenn der erste Lauf es zeigt: zuerst `COURSE_GEN_CONCURRENCY` senken, dann eigener Worker-Container aus demselben Image.
- [x] **R4a** Fehlende Cron-Jobs auf der VM nachgetragen: `reactivation:run`, `reviewers:remind`, `mandatory:run`, `exams:remind` (am 19.11.2026; vorher liefen nur `fsrs:optimize` und `push:remind`).
- [ ] **R4b** Alle wiederkehrenden Jobs als systemd-Timer nach `deploy/` mit Übersicht in `docs/`; jeder Lauf schreibt einen Zeitstempel, `scripts/monitor.sh` meldet, wenn einer zu alt ist.
- [x] **R5** Fehler sichtbar machen: `onRequestError` in `instrumentation.ts`, Fehler als JSON-Zeile; Monitor zusätzlich für fehlgeschlagene Kursgenerierungen, KI-Budget über 80 % und 5xx. Erledigt über `/api/monitor` (nur mit `MONITOR_TOKEN`).
- [ ] **R5 auf der VM einschalten:** `MONITOR_TOKEN` in der `.env` setzen, App neu starten (Schritt 5 in [`docs/MONITORING.md`](../MONITORING.md)).
- [ ] **R13** Branch-Schutz: CI muss vor dem Merge grün sein (`main` war nach #208 rot). Lint und Unit-Tests als eigener schneller Job.

## 2. Vor dem Pilot

**Betrieb (Aufgabe des Betreibers, kein Code)**
- [ ] Docker-Image mit der aktuellen `.dockerignore` neu bauen, alte Images und Build-Cache entfernen. Falls alte Images mit `.env` weitergegeben wurden: Secrets wechseln. (`archiv/review-2026-11-12/01-node-modules-aus-dem-index.md`)
- [ ] Restore-Test einmal im Quartal durchführen und im Protokoll in [`docs/BACKUP.md`](../BACKUP.md) eintragen. (`archiv/roadmap_datenintegritaet.md`, Phase 6)
- [ ] Gate 0 abhaken: keine offenen kritischen Punkte aus dem Sicherheits-Review, CI grün, Backup-Restore getestet. (`archiv/ROADMAP-TECHNISCH.md`)

**Entscheidungen des Betreibers**
- [ ] Bestandene Prüfungsversuche aus der Zeit vor der serverseitigen Prüfung: korrigieren, markieren oder belassen. Das Skript `scripts/exam-attempts-audit.ts` zeigt sie an. (`archiv/review-2026-11-12/05b-pruefung-bestehende-versuche.md`)
- [ ] Auth-Bibliothek: bei `next-auth` 5.0.0-beta.32 bleiben (Empfehlung) oder wechseln. Bis zum Stable-Release von Auth.js v5 beobachten: Dependabot schlägt neue Versionen als eigene Gruppe `auth` vor (`.github/dependabot.yml`); vor dem PWA-Release kein Umbau. (`archiv/ROADMAP-TECHNISCH.md`, Phase 2; PWA-Roadmap AP-04, m-5)
- [ ] Mailanbieter für den Kundenbetrieb: EU-Anbieter oder Google Workspace mit Auftragsverarbeitungsvertrag. (ebenda)

**Sicherheit und PWA**
- [ ] Service Worker: angemeldete Seiten gar nicht erst cachen. Heute sind Admin- und Firmenbereich ausgenommen (`lib/pwa/cache-policy.ts`), übrige angemeldete Seiten nicht. (`archiv/ROADMAP-TECHNISCH.md`, Phase 0)
- [ ] Web Push auf einem echten Gerät ausprobieren (FCM, Mozilla, Apple). Die Tests laufen nur mit einem Fake-Sender. (`archiv/roadmap_pwa.md`, Phase 6)
- [ ] Lighthouse-Performance verbindlich machen: Liegen `/login`, `/offline` und `/catalog` in 2–3 CI-Läufen stabil über 0.8, in `.github/workflows/ci.yml` `LIGHTHOUSE_WARN_PERFORMANCE` durch `LIGHTHOUSE_MIN_PERFORMANCE: "0.8"` ersetzen (harte Grenze, `scripts/lighthouse-check.mjs`). Eine Seite mit Codeblöcken (`RichText` → `CodeMarkdown`) misst die CI noch nicht: Lektionen gibt es nur angemeldet. (PWA-Roadmap AP-04, m-4)
- [ ] Prüfung auf echten Geräten: iOS Safari (Safe-Area, Prüfungsmodus) und Android Chromium (`beforeinstallprompt`, Background Sync). (`archiv/pwa-hardening-review.md`, Phase 4)

## 3. Vor den ersten Personen außerhalb des Tests (Recht)

- [ ] Datenschutzerklärung und Impressum: Texte vom Betreiber und rechtlich prüfen lassen. Die Seiten gibt es, ohne Angaben stehen sie auf `noindex`. (`archiv/review-2026-11-12/07a-…`, `07b-…`)
- [ ] KI-Anbieter: Vertragsbedingungen prüfen (kein Training auf Kundendaten) und EU-Verarbeitung klären. (`archiv/review-2026-11-12/10-ki-zugang-eu-ohne-training.md`)
- [ ] Datenschutzerklärung um öffentliche Prüferprofile ergänzen. (`archiv/roadmap_pruefer.md`, Phase 7)
- [ ] Expertenvertrag: Nutzungsrechte, Verschwiegenheit, Haftung, Einwilligung zum Profil je Feld, Widerruf. (ebenda)
- [ ] Unterlage für den Betriebsrat: eine Seite, was die Firma sieht und was nicht. (`archiv/vision.md`)

## 4. Weg zum ersten Firmenkunden

**Ausscheiden aus der Firma** (`archiv/vision.md`)
- [ ] Entscheidung: Konto umwandeln (Vorschlag) oder signierter Export mit Import.
- [ ] Private E-Mail-Adresse im Konto hinterlegen, mit Bestätigung; Hinweis, solange nur eine Firmenadresse da ist.
- [ ] Beim Entfernen aus der Firma: Mitgliedschaft, Zuweisungen, Katalog-Freigaben und interne Kurse weg; das Konto wechselt auf die private Adresse.
- [ ] Ohne private Adresse: Konto 30 Tage halten, einmaliger Link an die letzte Adresse, danach Löschung.
- [ ] Was bleibt (Erfolge allgemeiner Kurse, Lernstand, Profil) und was nicht (Inhalte interner Kurse, nur Titel mit Datum).
- [ ] SSO-Konten setzen beim Umwandeln ein Passwort.
- [ ] Falls doch Export: vom Server signiert, Import prüft die Signatur.

**Stellen und Wechsel** (`archiv/vision.md`, `archiv/ROADMAP-TECHNISCH.md` Phase 5)
- [ ] Rollenprofile als Kompetenzbündel (Grundlage für „Stelle legt Kurse fest“).
- [ ] Lückenanalyse zwischen Nachweisen und Zielrolle, nur für die Person sichtbar.
- [ ] Teilen von Nachweisen nur auf Wunsch der Person.
- [ ] Brückenpfade zwischen ähnlichen Werkzeugen (zum Beispiel GCP nach AWS). (auch `archiv/roadmap_didaktik.md`, Phase 11)
- [ ] Onboarding in der Probezeit: Ablauf je Stelle, Stand für den Arbeitgeber nach der Abgrenzung in `archiv/vision.md`. Grundlage gibt es schon (`onboarding_plans`, `/api/company/onboardings`).
- [ ] Automatisches Onboarding: Person kommt in Team X und bekommt Kursgruppe X. (`archiv/ROADMAP-UI.md`, Später)
- [ ] Nutzer-Import per CSV. (`archiv/ROADMAP-TECHNISCH.md`, Phase 5)

**Launch** (`archiv/ROADMAP-TECHNISCH.md`, Phase 6)
- [ ] Preis für den privaten Bereich: je Kurs, Abo oder kostenlos. (`archiv/vision.md`, Entscheidung des Betreibers)
- [ ] Checkout und Kundenportal anbinden, Zugriff an Abo oder Lizenz koppeln.
- [ ] Demo ohne Konto. Dazu optional die Pausen-Grafik als Demo-Seite mit Schiebereglern. (`archiv/roadmap_motivation.md`, Phase 1)
- [ ] Onboarding-Flow für neue Firmen (Gate 6: ein neuer Kunde kann ohne Hilfe starten).
- [ ] Datensparsame Analytics.
- [ ] E2E-Test des Kernflows Registrierung → Firma → Zuweisung → Lernpfad → Abschluss.
- [x] Accessibility-Check: Lighthouse prüft in der CI Performance, Barrierefreiheit und Best Practices auf `/login` und `/offline`; Barrierefreiheit unter 90 macht die CI rot (`scripts/lighthouse-check.mjs`).
- [ ] Anleitung „Zum Home-Bildschirm hinzufügen“ für iOS (es gibt einen Hinweis im Push-Bereich, keine eigene Anleitung).

**Prüfer** (`archiv/vision.md`)
- [ ] Wer bezahlt die Prüfer der allgemeinen Kurse, und wie viele Kurse je Prüfer sind realistisch.
- [ ] Auswahlverfahren für den externen Prüf-Dienstleister schriftlich festlegen.

## 4a. Aus dem Review vom 19.11.2026: Qualität, Performance, UX

Keine Pilot-Blocker, aber vor dem ersten Firmenkunden sinnvoll. Einzelheiten in [`review-2026-11-19.md`](review-2026-11-19.md).

- [x] **R6** Nutzer je Anfrage nur einmal laden: `getCurrentUser` und `auth` mit React `cache()` merken (heute rund sieben gleiche Abfragen auf `/cert/[id]`).
- [x] **R9a** `app/not-found.tsx` und `app/global-error.tsx` im App-Design.
- [ ] **R9b** `loading.tsx` für Dashboard, Kurs, Lernsession und Firmenbereich. Erster Versuch (PR #215) zurückgenommen: Mit Ladegrenze standen Teile der Seite doppelt im DOM, einmal deutsch und einmal englisch (E2E `pause-session`, `unlock`). Ursache vermutlich ein Sprach-Unterschied zwischen Server und Client beim Hydrieren; erst den beheben, dann die Ladezustände wieder einbauen.
- [ ] **R7** Bundle messen; KaTeX und Highlighting in `components/RichText.tsx` nur bei Bedarf laden, Markdown wo möglich auf dem Server rendern.
- [ ] **R8** ~~`output: "standalone"` im Image wirklich nutzen oder entfernen~~ (entfernt: das Image braucht `npm start`, Admin-Skripte und Migrationen); offen: `cloudflared` auf eine Version festlegen.
- [ ] **R10** Ein Weg für Übersetzungen, dazu ein Test, der jeden Text auf Deutsch und Englisch verlangt.
- [ ] **R11** `npm run test:db` mit Wegwerf-Postgres für die 101 Datenbank-Testdateien; Logik aus `StudySession.tsx` und `CourseGenerationPanel.tsx` in testbare Funktionen ziehen; einmal Abdeckung messen; `vitest.config.ts` auf `oxc` umstellen.
- [ ] **R12** `lib/server/db/schema.ts` nach Bereichen aufteilen; `session-service.ts` und `worker.ts` beim nächsten größeren Umbau zerlegen.

## 5. Messen und auswerten (ab Echtdaten)

Regeln für alle Messwerte stehen in [`docs/MESSEN.md`](../MESSEN.md).

- [ ] `psrp:metrics` um `attention` (4.1 bis 4.3), `habits` (4.4, 4.5) und `selfReports` erweitern, gesamt, je Evaluationsgruppe und mit Nenner. (`archiv/review-2026-11-12/19-auswertung-und-planung.md`)
- [ ] `psrp:fit-weights` um Ermüdung und Unterbrechungen erweitern; der Vorschlag wird nie automatisch übernommen. (ebenda)
- [ ] Bereitschaftswert gegen echte Prüfungsergebnisse prüfen (`exam_plans.status`). (ebenda, `archiv/roadmap_didaktik.md` Phase 7)
- [ ] Ab 20 Personen im Nenner Ziele festlegen und in `docs/MESSEN.md` eintragen; jede neue Mechanik bekommt vorher eine Hypothese nach dem Muster H1 bis H3. (ebenda)
- [ ] Wirkungsbericht: Abbruchquote mit und ohne Verstehens-Modus, Bestehensquote je Feature-Flag. (`archiv/roadmap_didaktik.md`, Phase 7)
- [ ] Motivation: Ziele für Abbruch, Rückkehr und Abschluss nach den ersten Daten; Reaktivierung zusätzlich per Push. (`archiv/umsetzungsplan.md`, Stufe 5)

## 6. Inhalte und Didaktik

- [ ] Lernpfad Observability (Metriken, Logs, Traces, Alerting). (`archiv/ROADMAP-TECHNISCH.md`, Phase 4)
- [ ] 2–3 Troubleshooting-Szenarien mit Hilfe-Leiter; die Hilfe-Leiter auch für normale Szenario-Fragen. (ebenda, `archiv/roadmap_didaktik.md` Phase 11)
- [ ] Modul „KI-Ergebnisse prüfen“ (generierten Code lesen, Fehler finden). (`archiv/ROADMAP-TECHNISCH.md`, Phase 4)
- [ ] Wissenssicherung: KI-gestützte Interviews mit Seniors, vom Senior freigegeben. (ebenda)
- [ ] Kompetenzmodell mit Konzept- und Tool-Ebene. (ebenda)
- [ ] Gemischte Sessions über mehrere Domains erzwingen, wenn jemand lange nur eine Domain übt. (`archiv/roadmap_didaktik.md`, Phase 11)
- [ ] Planung auf Konzept-Ebene: ein schwaches Konzept zieht verwandte Items vor. (ebenda)
- [ ] Offizielle Prüfungsziele und Domänengewichte für Security+ SY0-701. (`archiv/roadmap2.md`)
- [ ] Quellenbindung und Dateisuche: die frühere Umsetzung wurde gelöscht, neu entscheiden, ob es das braucht. (`archiv/roadmap2.md`, Schritt 15)

## 7. Später (bewusst zurückgestellt)

- [ ] Externer Penetrationstest und Behebung der Befunde. (`archiv/ROADMAP-TECHNISCH.md`, Phase 7)
- [ ] Nachweise auf offenen Standards (Open Badges 3.0, European Digital Credentials).
- [ ] Echte Übungsumgebungen und Praxis-Labs (Container), erst Kosten und Betrieb klären.
- [ ] Einträge in Google Play und Microsoft Store.
- [ ] Phishing-Simulationen, erst nach Klärung der Rahmenbedingungen.

---

## Im Archiv offen, im Code erledigt

Diese Punkte stehen in den archivierten Dateien noch als offen, `main` erfüllt sie aber. Sie zählen hier nicht mehr.

- `output: "standalone"` (`ROADMAP-TECHNISCH.md`, Sammelroadmap): bewusst verworfen und aus `next.config.ts` entfernt, siehe R8 in Abschnitt 4a.
- Generische Fehlertexte der Admin-Routen `sources/[id]/blueprint` und `parse` (Aufgabe 11, Test `app/api/admin/sources/error-texts.test.ts`).
- Fast alle Aufgaben aus dem Review vom 12.11.2026 (02 bis 18, 21a, 21b): in den Einzeldateien abgehakt, in `roadmap_review_messung.md` nicht nachgetragen.
- Oberfläche aus der Sammelroadmap: Command-Palette, „Meine Schwachstellen“, Katalog-Gruppen, Skill-Abdeckung je Team (Commits vom 05.11.2026).
- Prüfer Phase 6 (Kennzahlen je Prüfer, Zweitprüfung, Wiedervorlage): umgesetzt in `lib/reviewers/` und `app/reviewer/second-review/`.
- `roadmap2.md`: Anmelde- und Registrierungsoberfläche sowie `proxy.ts` gibt es; die Offline-PWA ist durch die Offline-Pakete aus `roadmap_pwa.md` abgelöst.

**Unklar, bitte prüfen:** Aus `ROADMAP-TECHNISCH.md` Phase 4 die Punkte Freigabe-Metadaten, Review-Oberfläche, automatische Vorprüfung, Versionierung und die Rolle „Externer Prüfer“ sind sehr wahrscheinlich mit `roadmap_pruefer.md` (36 von 38 erledigt) und `lib/server/admin/quality-checks.ts` umgesetzt. Ebenso Teilnahmebescheinigung und Audit-Export (`/api/company/certificates/export`). Sie stehen deshalb oben nicht mehr.

## Dauerhaft geltende Regeln (keine Aufgaben)

- Die Leitplanken aus `archiv/ROADMAP-TECHNISCH.md`: kein Talent-Score und keine Vergleiche, bestanden heißt beherrscht, Bewertung regelbasiert, Nachweise gehören den Lernenden, Inhalte nur mit menschlicher Freigabe.
- Die Definition of Done für Oberflächen am Ende von `archiv/ROADMAP-UI.md`.
