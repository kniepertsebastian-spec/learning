# Roadmap: Befunde aus dem Review vom 12.11.2026 und messbare menschliche Faktoren

> **Stand 12.11.2026.** Grundlage ist `docs/PWA-REVIEW-2026-11-12.md` (`main` bei Commit `be684769`). Der Plan hat zwei Teile: erst die Befunde beheben (Phasen 0 bis 3), dann die Messung menschlicher Faktoren ausbauen (Phasen 4 bis 6). Phase 2 verbindet beide, weil die Antwortzeit heute fehlt und zugleich die Grundlage für mehrere neue Messwerte ist.

Der Plan ist für die Umsetzung durch einen Coding-Agenten geschrieben. Vor Änderungen an Next.js-Routen die passende Anleitung in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`).

---

## Was heute schon gemessen wird

| Faktor | Wo |
|---|---|
| Tagesform (1 bis 5), Zeitbudget, Arbeitstag ja/nein | `session_checkin`, daraus Φ in `session_derived` |
| Tageszeit und Wochentag jeder Antwort | `review_log.local_hour`, `weekday` |
| Selbsteinschätzung je Antwort („geraten“, „unsicher“, „sicher“) | `study_session_items.confidence`, `quiz_answers.confidence` |
| Kalibrierung (Abweichung von Selbsteinschätzung und Ergebnis) | `user_calibration` (Bias, Brier-Wert) |
| Vergessen und Abrufwahrscheinlichkeit | `item_state`, `review_log.predicted_r` |
| Vorwissen | `pre_assessments`, Einstufungstest |
| Verständnisprobleme je Konzept | `concept_struggle` |
| Behalten nach einer Lektion | `recall_checks` (Stunden seit der Lektion, Φ beim Lernen und beim Abruf) |
| Überlastung und drohender Abbruch | `engagement_state` (kurze Sessions, Fehlerquote, übersprungene Check-ins), `learning_exit` |
| Lernzeit, Lerntage, Wochenziel | `learning_time`, `study_sessions`, `learning_preferences` |
| Wahl bei niedriger Energie | `energy_mode_event` |
| Altersspanne (freiwillig) | `users.age_range` |

Vorgesehen, aber ohne Daten: die **Antwortzeit** (`review_log.response_time_ms`, Befund 2).

## Regeln für alle neuen Messwerte (verbindlich)

1. **Nur messen, was eine Entscheidung ändert.** Jeder Messwert nennt vorab, was die App damit tut (Planung, Session-Länge, Hilfe, Bericht). Ohne Verwendung keine Erhebung.
2. **Erst Verhalten, dann Fragen.** Was sich aus dem Verhalten ablesen lässt, wird nicht abgefragt. Selbstauskünfte sind freiwillig, mit einem Tipp zu beantworten und einzeln abschaltbar.
3. **Die Person sieht ihre Werte** (unter „Wie ich lerne“) und bekommt sie im Datenexport.
4. **Firmen sehen keine Einzelwerte.** Es gelten die bestehenden Regeln: nur aggregiert, erst ab Mindestgröße, nie als Vergleich zwischen Personen.
5. **Rohwerte bleiben roh.** Ausreißer werden in der Auswertung behandelt, nicht beim Speichern (wie in `roadmap_psrp_hr.md`).
6. **Keine Gesundheitsdaten.** Schlaf, Stress und Stimmung werden nicht als eigene Angaben erhoben. Die Tagesform bleibt die einzige, grobe Angabe dazu.
7. **Jede Mechanik hinter einem Feature-Flag** und mit Ausgangswert vor dem Einschalten (`docs/MESSEN.md`).

---

## Phase 0: Sofort (Repository und Image)

- [ ] `node_modules` und `tsconfig.tsbuildinfo` aus dem Index nehmen (`git rm -r --cached`), `.gitignore` bleibt wie sie ist. _Befund 3._
- [ ] CI-Schritt, der fehlschlägt, wenn `git ls-files node_modules` etwas ausgibt.
- [ ] Image mit der neuen `.dockerignore` (`be684769`) neu bauen, alte Images und Build-Cache entfernen. Wurden Images je weitergegeben: Secrets wechseln. _Abschluss von Befund 2 aus dem Review vom 06.11._

**Akzeptanzkriterium:** `git ls-files node_modules` ist leer. Im gebauten Image gibt es keine Datei `.env` (`docker run --rm <image> find / -name .env -not -path "*/node_modules/*"` findet nichts).

---

## Phase 1: Datenintegrität im Sync und beim Session-Abschluss

- [ ] Verwaiste Claim-Zeilen: Eine Zeile in `sync_events` mit „wird verarbeitet“, die älter als 5 Minuten ist, löschen und das Ereignis neu verarbeiten (`lib/server/sync/service.ts`). _Befund 1._
- [ ] Test: Claim-Zeile anlegen, Uhr vorstellen, erneut senden. Das Ereignis wird verbucht.
- [ ] Einmaliges Skript mit Trockenlauf, das schon vorhandene verwaiste Zeilen freigibt (nach dem Muster von `sync:reprocess-conflicts`).
- [ ] `completeStudySession`: Antworten speichern, Wiederholungen verbuchen und Status setzen in einer Transaktion. Dasselbe für Lektionstest und Simulation prüfen. _Befund 5._
- [ ] Test: Fehler nach dem Verbuchen erzwingen, erneut senden. In `review_log` steht jede Antwort genau einmal.
- [ ] Gemeinsames Zod-Schema für Antworten in den Abgabe-Routen (Session, Lektionstest, Remediation, Prüfung), Body über `readJsonCapped`, Check-Constraint für `confidence`. _Befund 7._

**Akzeptanzkriterium:** Ein Neustart des Servers mitten in einer Übertragung kostet kein Ergebnis und verbucht keines doppelt.

---

## Phase 2: Antwortzeit erfassen (Grundlage für die Messung)

- [ ] Client: je Frage die Zeit von der Anzeige bis zur Antwort messen (`StudySession.tsx`, `SectionQuiz.tsx`, Prüfung). Zeit im Hintergrund abziehen (`visibilitychange`), damit ein Tab-Wechsel nicht als Nachdenken zählt.
- [ ] Feld `responseTimeMs` in den Antwort-Typen, online und im Sync-Ereignis. Ältere Clients ohne Feld bleiben gültig.
- [ ] Server: auf 300 ms bis 10 Minuten begrenzen, sonst `null`. An `recordReviewOutcomes` durchreichen.
- [ ] Prüfen, dass die drei vorhandenen Verbraucher jetzt Daten bekommen: Tageslimit aus persönlichem Durchschnitt, Signal `slow_answers`, Basiszeit je Frage.
- [ ] Offline-Pakete: das Feld im Offline-Leser genauso füllen.
- [ ] Tests: Antwort mit Zeit landet in `review_log.response_time_ms`, online und über den Sync. Zeit im Hintergrund zählt nicht.
- [ ] `roadmap_psrp_hr.md` (Zeilen 54 und 80) mit einem Vermerk versehen, dass die Messung erst hier dazukam.

**Akzeptanzkriterium:** Nach zehn beantworteten Fragen liefert `averageSecondsPerReview` einen Wert, und das Tageslimit einer Person mit kurzen Antwortzeiten liegt über dem einer Person mit langen.

---

## Phase 3: Datenschutz und Recht (vor dem Pilot)

- [ ] Seiten `/datenschutz` und `/impressum`, Links im Fuß, auf Login und Registrierung. Texte vom Betreiber, rechtlich geprüft. _Befund 4._
- [ ] In der Datenschutzerklärung die Daten zur Person einzeln nennen: Tagesform, Zeitbudget, Arbeitstag, Altersspanne, Tageszeit-Profil, Selbsteinschätzung, Antwortzeit, Berufsprofil. Dazu Zweck, Speicherdauer und Empfänger (KI-Dienst bei Karrierepfaden).
- [ ] AGB-Seite vervollständigen (Parteien, Laufzeit, Haftung).
- [ ] Kontolöschung für SSO-Konten ohne Passwort: Bestätigung durch Eintippen der eigenen E-Mail-Adresse. _Befund 6._
- [ ] KI-Zugang ohne Training auf Kundendaten, möglichst mit Verarbeitung in der EU (steht schon in `ROADMAP-TECHNISCH.md`, Phase 3).
- [ ] Fehlertexte der Routen `sources/[id]/parse` und `sources/[id]/blueprint` generisch machen. _Befund 8._

**Akzeptanzkriterium:** Jede Angabe zur Person, die die App erhebt, steht mit Zweck in der Datenschutzerklärung und im Datenexport.

---

## Phase 4: Menschliche Faktoren, Stufe 1 (aus dem Verhalten, ohne Fragen)

Alle Werte entstehen aus Daten, die nach Phase 2 vorliegen oder mit wenig Aufwand mitgeschrieben werden.

| Nr. | Faktor | Messung | Was die App damit tut |
|---|---|---|---|
| 4.1 | **Ermüdung in der Session** | Fehlerquote und Antwortzeit nach Position in der Session (erstes, zweites, drittes Drittel) | Persönliche Session-Länge vorschlagen, schwere Fragen nach vorn |
| 4.2 | **Raten und Durchklicken** | Antwort schneller als ein Bruchteil der Basiszeit der Frage, gehäuft | Zählt als Signal der Frühwarnung, die Antwort geht mit geringerem Gewicht in die Auswertung (nicht in FSRS) |
| 4.3 | **Unterbrechungen** | Zahl und Dauer der Wechsel in den Hintergrund während einer Session | Kürzere Sessions anbieten, Tageszeit mit wenigen Unterbrechungen empfehlen |
| 4.4 | **Aufschieben** | Tage zwischen Fälligkeit und tatsächlicher Wiederholung, Häufung kurz vor dem Prüfungstermin | Erinnerungszeit anpassen, Rückstau früher verteilen |
| 4.5 | **Regelmäßigkeit** | Streuung der Lernzeiten über Tageszeit und Wochentag, geplante gegen tatsächliche Lerntage | Realistisches Wochenziel vorschlagen |
| 4.6 | **Unsicherheit ohne Selbstauskunft** | Geänderte Antwort vor dem Absenden, Zeit zwischen erster Auswahl und Absenden | Ergänzt die Kalibrierung für Personen, die die Sicherheitsangabe ausgeschaltet haben |
| 4.7 | **Hilfe-Verhalten** | Tipps, „Antwort zeigen“, „Ich hänge fest“ je Frage und je Konzept, früh oder spät genutzt | Unterscheidet „sucht Hilfe“ von „überspringt“, steuert den Verstehens-Modus |
| 4.8 | **Fehlerart** | Dieselbe falsche Option wiederholt (Fehlvorstellung) gegen wechselnde falsche Optionen (Lücke) gegen Fehler bei sonst sicherem Stoff mit kurzer Antwortzeit (Flüchtigkeit) | Fehlvorstellung: Begründung der Option zeigen. Lücke: Lektion. Flüchtigkeit: kein Eingriff |
| 4.9 | **Lesetiefe** | Lesezeit je Lektion im Verhältnis zur Wortzahl, erneutes Öffnen | Hinweis vor dem Lektionstest, wenn kaum gelesen wurde. Auswertung: Lesezeit gegen Testergebnis |
| 4.10 | **Durchhalten nach Fehlern** | Verhalten nach drei Fehlern in Folge: weiter, Pause, Ausstieg | Leichtere Frage einschieben, bevor der Ausstieg kommt |
| 4.11 | **Schlaf zwischen Lernen und Abruf** | Aus den Zeitstempeln: Liegt zwischen Lektion und Rückblick eine Nacht? | Auswertung im Rückblick, Empfehlung „abends lernen, morgens abrufen“ nur bei belegtem Effekt |
| 4.12 | **Gerät und Lage** | Gerätetyp (schmal, breit), online oder offline, installiert oder Browser | Auswertung je Lage, kurze Formate für das Smartphone bevorzugen |

Umsetzung in dieser Reihenfolge:

- [ ] 4.1, 4.2, 4.4, 4.5, 4.11: nur Auswertung vorhandener Daten. In `psrp:metrics` als beschreibende Werte aufnehmen.
- [ ] 4.3, 4.6: zwei Felder je Antwort (`interruptions`, `changedAnswer`), Erfassung im Client, Speicherung an `study_session_items` bzw. `quiz_answers`.
- [ ] 4.7, 4.8: aus vorhandenen Tabellen ableiten (`simulation_results.bestHelps`, `selected_option_id`, Aufrufe von `reveal`).
- [ ] 4.9: Lesezeit je Lektion aus `LearningTimeTracker` mit der Lektion als Bezug speichern.
- [ ] 4.10, 4.12: Auswertung, Gerätetyp als grobe Klasse an der Session.
- [ ] Anzeige für die Person unter „Wie ich lerne“: zwei bis drei Aussagen in ganzen Sätzen statt Kennzahlen („Nach etwa 12 Fragen machst du mehr Fehler“).
- [ ] Datenexport und Datenschutzerklärung um die neuen Felder ergänzen.

**Akzeptanzkriterium:** Für eine Person mit 200 Reviews zeigt „Wie ich lerne“ mindestens eine Aussage aus 4.1 bis 4.5, und `psrp:metrics` enthält die Werte mit Nenner.

---

## Phase 5: Menschliche Faktoren, Stufe 2 (kurze, freiwillige Selbstauskunft)

Höchstens eine Frage je Session, jede mit einem Tipp zu beantworten, jede unter „Wie ich lerne“ abschaltbar.

| Nr. | Faktor | Frage | Was die App damit tut |
|---|---|---|---|
| 5.1 | **Empfundene Anstrengung** | Nach einer Lektion: „Wie anstrengend war das?“ (5 Stufen) | Zusammen mit dem Ergebnis: hoher Aufwand bei schwachem Ergebnis löst Hilfe aus, niedriger Aufwand bei gutem Ergebnis verkürzt |
| 5.2 | **Vorhersage des eigenen Behaltens** | Nach einer Lektion: „Wie viel davon weißt du in einer Woche noch?“ | Vergleich mit dem Rückblick (`recall_checks`), zeigt Selbstüberschätzung auf Lektionsebene |
| 5.3 | **Zuversicht für die Prüfung** | Wöchentlich bei gesetztem Termin: „Wie sicher bestehst du?“ | Vergleich mit dem Bereitschaftswert, bei großer Abweichung Probeprüfung vorschlagen |
| 5.4 | **Grund fürs Lernen** | Einmal je Kurs: Pflicht, Stelle, Wechsel, Interesse | Ton der Erinnerungen, Auswertung von Abbruch je Grund |
| 5.5 | **Nutzen für die Arbeit** | Nach einer Lektion, selten: „Brauchst du das in deiner Arbeit?“ | Reihenfolge der Lektionen, Rückmeldung an Autoren |
| 5.6 | **Lernumgebung** | Im Check-in, ein Tipp: ruhig, unterwegs, bei der Arbeit | Format wählen (unterwegs: nur Wiederholungen) |

- [ ] Tabelle `self_reports` (Person, Art, Wert, Bezug, Zeitpunkt), Schnittstelle, Schalter je Art.
- [ ] 5.1 und 5.2 zuerst, hinter dem Flag `self_reports`, mit Kontrollgruppe (`FEATURE_SELF_REPORTS_ROLLOUT=50`).
- [ ] 5.3 an den Prüfungsplan anbinden, 5.4 an den Kursstart, 5.6 an den Check-in.
- [ ] Regel gegen Fragemüdigkeit: Wird eine Frage dreimal in Folge übersprungen, pausiert sie 30 Tage (Muster wie `user_checkin_flags`).

**Akzeptanzkriterium:** Mit eingeschaltetem Flag bleibt die Abbruchquote der Sessions gegenüber der Kontrollgruppe gleich (beschreibend, `docs/MESSEN.md`).

**Bewusst nicht aufgenommen:** Lerntypen (visuell, auditiv), weil die Wirkung nicht belegt ist. Kamera, Mikrofon, Blickverfolgung und Tippverhalten zur Erkennung von Personen. Schlafdauer, Stress und Stimmung als eigene Angaben.

---

## Phase 6: Auswertung und Rückführung in die Planung

- [ ] `psrp:metrics` um die Abschnitte `attention` (4.1 bis 4.3), `habits` (4.4, 4.5) und `selfReports` erweitern, jeweils gesamt, je Evaluationsgruppe und mit Nenner.
- [ ] Bereitschaftswert gegen echte Prüfungsergebnisse prüfen (`exam_plans.status`), offen aus `roadmap_didaktik.md`, Phase 7.
- [ ] `psrp:fit-weights` um die neuen Signale erweitern (Ermüdung, Unterbrechungen). Vorschlag bleibt ein Vorschlag, wird nicht automatisch übernommen.
- [ ] Erst bei mindestens 20 Personen im Nenner Ziele festlegen und in `docs/MESSEN.md` eintragen.
- [ ] Jede Mechanik, die auf einem neuen Messwert aufbaut (zum Beispiel persönliche Session-Länge), bekommt eine Hypothese in `docs/MESSEN.md` nach dem Muster H1 bis H3.

**Akzeptanzkriterium:** Für jeden Messwert aus Phase 4 und 5 steht in `docs/MESSEN.md`, welche Entscheidung er ändert und wie der Effekt geprüft wird.

---

## Phase 7: Aufräumen

- [ ] `roadmap_sammel.md` aktualisieren: Web Push ist umgesetzt, offen ist nur der Versuch auf einem echten Gerät. _Befund 9._
- [ ] Entscheidung zum Logout: `sessionVersion` beim Abmelden erhöhen oder „Überall abmelden“ anbieten. _Befund 10._
- [ ] Die 22 Lint-Warnungen (ungenutzte Importe) entfernen.
- [ ] Prüfung auf echten Geräten (iOS Safari, Android Chromium) und externer Penetrationstest bleiben wie in `roadmap_sammel.md`.

---

## Reihenfolge

1. Phase 0 sofort: zwei kleine Änderungen, keine Abhängigkeiten.
2. Phase 1 und 2 vor dem Pilot. Ohne Phase 2 fehlen der Planung und der Frühwarnung ihre Eingangsdaten.
3. Phase 3 vor den ersten Personen außerhalb des eigenen Tests.
4. Phase 4 ab den ersten Echtdaten, zuerst die reinen Auswertungen.
5. Phase 5 erst, wenn Phase 4 zeigt, welche Fragen das Verhalten nicht beantwortet.
6. Phase 6 begleitend, Phase 7 nach Bedarf.
