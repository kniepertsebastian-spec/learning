# Entwicklungs-Roadmap: Didaktik für Endnutzer

Technischer Umsetzungsplan, um die Lernwirkung der Plattform zu erhöhen. Das Dokument ist für die Umsetzung durch einen Coding-Agenten geschrieben und setzt kein Vorwissen aus anderen Dokumenten voraus. Grundlage ist ein Review des Stands vom 22.10.2026 (`main`, nach PR #116).

---

## Kontext

Die Plattform bereitet auf IT-Zertifikate vor. Bereits vorhanden:

- **Wiederholungsplanung PSRP-HR** (`lib/server/psrp/`, siehe `docs/roadmap_psrp_hr.md`): FSRS über `ts-fsrs`, Planungsschicht mit Tageslimit, Rückstau-Abbau, Prüfungsmodus, Tagesform (Φ), Evaluationsgruppen `vanilla` / `planning` / `planning_state`.
- **Item = Frage:** Der FSRS-Zustand (`item_state`, `review_items`) hängt an `questions.id`. Fragen haben ein Lernziel (`objectiveId`), eine Schwierigkeit und einen Typ (`knowledge`, `comprehension`, `application`, `scenario`, `troubleshooting`). Beantwortet werden alle über Antwortoptionen (Single/Multiple Choice).
- **Rating:** `ratingFromOutcome(isCorrect, confidence)` in `lib/server/psrp/service.ts`: falsch → 1, richtig + geraten → 2, richtig ohne Angabe/unsicher → 3, richtig + sicher → 4.
- **Konzepte und Abfragevarianten** (`concepts`, `item_concept`, `probe_variant`, `questions.probe_only`): heute nur für die Kalibrierung (`selectProbes`, `user_calibration`).
- **Übungssession** (`components/StudySession.tsx`, `lib/server/study/session-service.ts`): Mix 60 % fällig / 25 % schwach / 15 % neu; Feedback erst gesammelt am Ende (`ResultSummary`). Lektionstests (`SectionQuiz`) geben Feedback pro Frage.
- **Lektionsablauf** (`components/lesson/LessonPhases.tsx`): Verstehen (Text) → Anwenden (Simulationen `terminal` / `decision`, `lib/markdown/simulation.ts`) → Auswerten.
- **Kapitel überspringen:** `applyChapterSkip` in `lib/server/psrp/implicit.ts` existiert, wird aber von keinem Einstiegstest aufgerufen.
- **Lernserie:** `computeStreak` in `lib/server/study/session-builder.ts`; ein Tag ohne abgeschlossene Session setzt die Serie auf 0.
- **Prüfungsplan** (`exam_plans.status`: `planned` / `passed` / `failed` / `cancelled`): Nutzer kann im `ExamPlanner` von Hand „bestanden“ setzen; nicht in `psrp:metrics` enthalten.

**Umsetzungsstand (23.10.2026):** Phase 1 (Varianten: `item_variant`, `lib/server/variants/`), Phase 2 (Sofort-Feedback) und die Prüfungsnachfrage aus Phase 7 sind umgesetzt; die Beschreibung oben zeigt den Stand vor dieser Umsetzung. Phasen 8–10 wurden nachträglich ergänzt.

**Hinweis:** Vor Änderungen an Next.js-Routen die passende Anleitung in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`).

## Architektur-Regeln (verbindlich)

1. **Es gelten weiter alle Regeln aus `docs/roadmap_psrp_hr.md`:** FSRS bekommt das rohe Rating, Burnout-Schutz nur in der Planungsschicht, `review_log` ist unveränderlich, Gewichte und Schwellen sind Konfiguration.
2. **Wissen wird geprüft, nicht der Wortlaut einer Frage.** Eine Wiederholung soll dasselbe Wissen in anderer Form abfragen, wo immer Varianten vorhanden sind.
3. **Bewertung bleibt regelbasiert.** KI erzeugt Inhalte und Varianten, entscheidet aber nie über Richtigkeit einer Antwort zur Laufzeit. Ausnahme ist nur, was ausdrücklich als „nicht gewertet“ markiert ist (siehe Phase 3, Selbsterklärung).
4. **Pausen werden nicht bestraft.** Keine Mechanik darf einen Nutzer für einen freien Tag sichtbar zurückwerfen.
5. **Wenig Eingaben für Neue.** Jede neue Abfrage an den Nutzer ist optional oder erscheint erst, wenn sie etwas bewirkt.
6. **Messbar.** Jede Änderung, die die Planung oder den Ablauf verändert, läuft hinter einem Feature-Flag und ist im Metrik-Export auswertbar.
7. **Zweisprachig (de/en)** wie der Rest der Plattform.

## Platzhalter-Entscheidungen

| Punkt | Standardwert |
|---|---|
| Ebene der Wiederholungsplanung | Frage bleibt FSRS-Item; gezeigt wird eine Variante desselben Item-Konzepts |
| Mindestabstand bis dieselbe Variante erneut | 30 Tage |
| Mindestzahl Varianten je Item, damit Rotation greift | 2 |
| Feedback in Übungssessions | sofort nach jeder Frage (umschaltbar in den Einstellungen) |
| Vorabfragen pro Lektion | 2 (max. 3) |
| Einstiegstest: Fragen pro Kapitel | 1 je Lernziel, max. 12 |
| Einstiegstest: Schwelle für „überspringen“ | ≥ 90 % richtig **und** Angabe „sicher“ bei ≥ 80 % |
| Anteil Fragen mit freier Eingabe im Session-Mix | bis 20 %, sobald vorhanden |
| Serienmodell | Wochenziel (Lerntage pro Woche, Standard 4) |
| Nachfrage zum Prüfungsergebnis | 1 Tag nach Prüfungstermin, Erinnerung nach 7 Tagen |
| Einführung der Zusatz-Eingaben (Check-in, Sicherheit) | ab der 3. abgeschlossenen Session |
| Rückblick: Abstand zur Lektion | frühestens 1 Tag, höchstens 14 Tage |
| Rückblick: Fragen | 2–3, immer als Variante |
| Verstehens-Modus: Auslösung | mind. 2 verschiedene Signale je Konzept innerhalb von 14 Tagen, oder 2× „falsch + sicher“ |
| Verstehens-Modus: Item ohne Fortschritt | ≥ 3 Fehlschläge (Rating 1) und Stabilität < 2 Tage |
| Häufung für die Werkstatt | ≥ 30 % der Lernenden eines Konzepts im Verstehens-Modus, bei mind. 20 Lernenden |
| Eingewebte Fragen je Lektionstest | max. 2 bzw. 20 % |

---

## Phase 1 – Varianten statt Wiederholung derselben Frage (Priorität: hoch)

Ziel: Wiederholungen prüfen Wissen, nicht das Wiedererkennen einer bekannten Frage.

- [x] Datenmodell: Varianten für die **Wiederholung** nutzbar machen, nicht nur für Kalibrierung. Neue Tabelle `item_variant` (item_id → question_id, `source`: `original` | `probe` | `generated`, `active`), Original-Frage als Variante mit `source = original` eintragen (Migration + Backfill).
- [x] Generierung: Pro Frage mindestens 2 Varianten erzeugen (anderer Kontext, andere Distraktoren, gleiches Wissen). Vorhandene `probe_variant`-Fragen mit `is_bottleneck = true` übernehmen. Backfill-Skript `npm run variants:backfill`, mit Kostenschätzung vor dem Lauf. Validierung wie bei Abfragevarianten: Variante darf Lösung oder Formulierung des Originals nicht wörtlich enthalten.
- [x] Auswahl in der Session: Für ein fälliges Item die Variante wählen, die am längsten nicht gezeigt wurde (mind. 30 Tage Abstand, sonst die älteste). Das Review wird dem Item zugeschrieben (`review_log.item_id` = Original), die gezeigte Variante wird mitgeloggt (neue Spalte `review_log.variant_question_id`).
- [x] Neue Fragen (Kategorie „neu“) zeigen immer zuerst das Original.
- [x] Variante mit auffällig anderer Erfolgsquote als die übrigen (> 25 Prozentpunkte Abweichung bei ≥ 30 Antworten) automatisch in die Werkstatt-Prüfliste (`ContentReportQueue`) legen.
- [x] Feature-Flag `variant_rotation`, im Metrik-Export getrennt auswertbar.

**Akzeptanzkriterium:** Ein Nutzer, der ein Item viermal wiederholt, sieht bei ≥ 2 vorhandenen Varianten nie zweimal hintereinander dieselbe Frage. Ein Test belegt, dass FSRS-Zustand und `review_log` am Original-Item hängen.

---

## Phase 2 – Sofortiges Feedback in Übungssessions (Priorität: hoch)

Ziel: Denkfehler werden korrigiert, solange der Kontext noch präsent ist.

- [x] `StudySession`: Nach Antwort und (optionaler) Sicherheitsangabe sofort Richtig/Falsch, Erklärung (`explanation`) und Begründung der gewählten falschen Option (`rationale`) anzeigen, wie in `SectionQuiz` (`FeedbackPanel` wiederverwenden). Antwort danach gesperrt.
- [x] Reihenfolge erzwingen: Sicherheitsangabe vor dem Aufdecken (sonst ist sie wertlos). Ohne Angabe gilt wie bisher Rating 3.
- [x] Bei falscher Antwort: Link „Nochmal nachlesen“ zur passenden Lektionsstelle (gleiches Muster wie Simulations-Auswertung, `review`-Überschriften bzw. Quellenverweis).
- [x] `ResultSummary` am Ende bleibt als Zusammenfassung erhalten.
- [x] Prüfungssimulation (`ExamSession`) bleibt unverändert: Feedback erst am Ende.
- [x] Einstellung „Feedback erst am Ende“ für Nutzer, die Prüfungsbedingungen üben wollen.
- [x] Offline-Leser: gleiches Verhalten, Antworten weiter über die Sync-Warteschlange.

**Akzeptanzkriterium:** In einer Übungssession erscheint die Erklärung direkt nach jeder Antwort; das gespeicherte Rating ist identisch zum bisherigen Verhalten bei gleicher Antwort und Sicherheit.

---

## Phase 3 – Selbst erzeugen statt wiedererkennen (Priorität: hoch)

Ziel: Mehr Abfragen, bei denen die Antwort aktiv erzeugt werden muss. Das festigt Wissen stärker und senkt den Rateanteil.

### 3.1 Neue Antwortformate (regelbasiert auswertbar)
- [x] `ordering`: Schritte in die richtige Reihenfolge bringen (z. B. Troubleshooting-Ablauf). Auswertung: exakte Reihenfolge = richtig; optional Teilpunkte nur für die Anzeige, Rating bleibt binär.
- [x] `short_answer`: kurze freie Eingabe (Befehl, Port, Ressourcentyp) mit Liste akzeptierter Antworten und Normalisierung (Groß/Klein, Leerzeichen, Anführungszeichen; Synonyme als weitere akzeptierte Antworten). _Offen:_ die Terminal-Logik aus `lib/markdown/simulation.ts` wird nicht mitgenutzt, die Normalisierung ist eigenständig (`lib/questions/answer-formats.ts`).
- [x] `matching`: Begriffe zuordnen (z. B. Dienst ↔ Zweck).
- [x] Datenmodell: neues Feld `questions.answer_format` (`choice` Standard, `ordering`, `short_answer`, `matching`) plus formatabhängige Lösungsdaten; bestehender `type` (kognitive Stufe) bleibt.
- [x] Generierung und Werkstatt: In der Kurs-Werkstatt erzeugt die KI auf Wunsch „Formatfragen ergänzen“ je Lernziel (Vorschlag, Auswahl, Anlegen); Validierung, Vorschau und Bearbeitung ebenfalls dort; Übersetzung und Freigabe-Fingerabdruck berücksichtigen die Formate. _Offen:_ die vollautomatische Kursgenerierung (Worker) erzeugt weiterhin nur Auswahlfragen.
- [x] Session-Mix: bis 20 % solche Fragen, bevorzugt bei Items mit Rating 4 („sicher“), um Überschätzung früh zu erkennen.

### 3.2 Erst denken, dann Optionen sehen
- [x] Modus „Antwort zuerst überlegen“ für Single-Choice: Optionen sind zunächst verdeckt, Nutzer tippt auf „Optionen zeigen“, wenn er eine Antwort im Kopf hat. Kein zusätzliches Rating, reine Lernhilfe. Standard aus, in den Einstellungen aktivierbar; im Metrik-Export auswertbar.

### 3.3 Selbsterklärung (nicht gewertet)
- [x] Nach einer Simulation oder einer falsch beantworteten Szenario-Frage optional: „Erkläre in einem Satz, warum …“. Freitext wird nicht bewertet und nicht für das Rating genutzt; danach Musterantwort zum Vergleich zeigen. Speicherung nur lokal oder ausdrücklich im Datenexport, nicht im Firmenbereich sichtbar.

**Akzeptanzkriterium:** Mindestens ein Pilotkurs enthält alle drei neuen Formate; sie funktionieren in Session, Lektionstest und Offline-Leser und erzeugen korrekte Ratings.

---

## Phase 4 – Handeln vor Lesen und kürzerer Weg für Könner (Priorität: hoch)

Ziel: Grundsätze „Lernen beginnt mit Handeln“ und „Gute Lernende bekommen einen kürzeren Weg“ tatsächlich umsetzen.

### 4.1 Vorabfragen vor der Lektion
- [x] Vor dem Lektionstext 2 Fragen zu den Kernpunkten der Lektion (aus dem vorhandenen Fragenpool des Lernziels, keine Wertung, kein FSRS-Review). Hinweis: „Rate ruhig – danach weißt du, worauf du achten musst.“
- [x] Nach dem Lesen dieselben Fragen im Lektionstest wieder vorlegen (dann gewertet).
- [x] Überspringbar; als eigener Schritt in `LessonPhases` vor „Verstehen“.
- [x] Feature-Flag `pretest_questions`.

### 4.2 Einstiegstest je Kapitel
- [x] Neuer Einstieg auf der Kursseite: „Kenne ich schon? Kapitel testen“ je Domain/Kapitel.
- [x] Test mit 1 Frage je Lernziel (max. 12), mit Sicherheitsangabe, Feedback am Ende.
- [x] Bestanden nach Schwelle (siehe Platzhalter) → `applyChapterSkip` aufrufen, Lektionen als „übersprungen“ markieren (nicht „abgeschlossen“), Lernziele mit niedriger Leistung bleiben offen.
- [x] Nicht bestanden → Ergebnis zeigt die schwachen Lernziele und startet dort.
- [x] Bei Firmen-Pflichtkursen: Überspringen nur, wenn der Firmenadmin es erlaubt (Statusanzeige im Firmenbereich bleibt „abgeschlossen ja/nein“, siehe Grundsatz „Arbeitgeber sieht nur den Status“).

**Akzeptanzkriterium:** Ein Nutzer mit Vorwissen kann ein Kapitel per Einstiegstest überspringen; die Items des Kapitels starten mit Rating 4 im FSRS-Zustand und erscheinen später als normale Wiederholungen.

---

## Phase 5 – Motivation ohne Strafe (Priorität: mittel)

- [x] Tagesserie durch **Wochenziel** ersetzen: „x von 4 Lerntagen diese Woche“. Leichte Tage aus `study_profiles.light_weekdays` zählen nicht gegen das Ziel.
- [x] Bisherige Serie optional weiter anzeigen, aber mit automatischem Serienschutz: ein Tag Pause pro Woche bricht sie nicht.
- [x] Nach längerer Pause (≥ 7 Tage): Begrüßung mit „Willkommen zurück – heute nur 5 Minuten“ statt Rückstand-Zahl; Rückstand wird nicht als Zahl angezeigt, nur „wird über die nächsten Tage verteilt“.
- [x] Fortschritt als Kompetenz statt Aktivität: „3 Lernziele sicher seit letzter Woche“ in `TodayDashboard`.
- [x] Keine Vergleiche mit anderen Nutzern (Grundsatz bleibt).

**Akzeptanzkriterium:** Ein Nutzer, der an einem leichten Tag oder einem einzelnen Tag pro Woche nicht lernt, sieht keinen zurückgesetzten Zähler.

---

## Phase 6 – Einstieg vereinfachen (Priorität: mittel)

- [x] Erste Session ohne Check-in und ohne Sicherheitsangabe: nur „Starten“ (Zeitbudget mit Standard 10 Minuten).
- [x] Ab der 3. abgeschlossenen Session die Sicherheitsangabe einführen, mit einem Satz Begründung („Damit wir Geratenes öfter wiederholen“).
- [x] Check-in zur Tagesform erst ab der 5. Session anbieten, jederzeit abschaltbar.
- [x] „Selbsteinschätzung“ (`SelfAssessmentCard`) erst zeigen, wenn belastbare Daten vorliegen (bestehende Regel beibehalten).
- [x] Alle Zusatz-Eingaben auf einer Einstellungsseite „Wie ich lerne“ gebündelt.

**Akzeptanzkriterium:** Ein neuer Nutzer kommt von der Registrierung zur ersten beantworteten Frage mit höchstens zwei Klicks nach Kurswahl.

---

## Phase 7 – Wirkung messen (Priorität: mittel, begleitend)

- [x] Nachfrage zum Prüfungsergebnis: 1 Tag nach `exam_plans.scheduledAt` Hinweis im Dashboard (und optional E-Mail über die vorhandene Erinnerungslogik): „Wie lief deine Prüfung?“ → `passed` / `failed` / „noch nicht“. Erinnerung nach 7 Tagen. Optional Punktzahl erfassen.
- [x] `psrp:metrics` um Prüfungsergebnis, Bereitschaftswert (`readiness`) vor der Prüfung und Feature-Flags dieser Roadmap erweitern (anonymisiert, wie bisher mit `PSRP_EXPORT_SALT`).
- [ ] Auswertung: Wie gut sagt der Bereitschaftswert das echte Ergebnis vorher? Ergebnis als Grundlage, um die Readiness-Engine zu kalibrieren.
- [ ] Kennzahlen je Feature-Flag: Behaltensquote nach 30 Tagen, Anteil richtig + „sicher“ bei Varianten vs. Originalen, Abbruchquote, Bestehensquote.
- [ ] Auswertung Rückblick (Phase 8): vorhergesagte vs. tatsächliche Abrufwahrscheinlichkeit beim ersten Abstand; Einfluss der Tagesform (Φ) und Tageszeit **beim Lernen** auf das Behalten. Ergebnis als Grundlage für die Frage, ob die Planungsschicht neuen Stoff an schlechten Tagen zurückhalten soll (Entscheidung als eigene Aufgabe, nicht automatisch).
- [ ] Auswertung Verstehens-Modus (Phase 9): Anteil `resolved`, Dauer bis `resolved`, Abbruchquote von Nutzern mit vs. ohne Verstehens-Modus.
- [ ] Da Nutzerzahlen anfangs klein sind: Auswertung als beschreibender Bericht, keine automatische Übernahme von Änderungen.

**Akzeptanzkriterium:** Für jeden Nutzer mit vergangenem Prüfungstermin ist das Ergebnis erfragt; der Export enthält es und lässt sich nach Feature-Flags aufschlüsseln.

---

## Phase 8 – Rückblick „Was weißt du noch?“ (Priorität: hoch)

Ziel: Frisch Gelerntes am Anfang der nächsten Session kurz abrufen. Das festigt das Wissen (Abrufen ist selbst Lernen) und liefert Messwerte für den ersten Abstand nach dem Lernen, bei dem das Gedächtnismodell am wenigsten über den Nutzer weiß.

- [x] Auswahl: Lektionen, die der Nutzer seit der letzten Session abgeschlossen hat, frühestens 1 Tag, höchstens 14 Tage zurück; je Rückblick 2–3 Fragen aus den Kernpunkten dieser Lektionen.
- [x] Immer eine **Variante**, nie die Frage aus dem Lektionstest (Rotation aus Phase 1, `lib/server/variants/rotation.ts`). Bevorzugt Formate zum Selbst-Erinnern, sobald Phase 3 sie liefert.
- [x] Erscheint am Anfang der Session als „Kurzer Rückblick auf <Lektion>“, Ergebnis freundlich formuliert („2 von 3 sitzen schon“), mit Link zur Textstelle bei Fehlern.
- [x] Wird **unabhängig von der Tagesform** angeboten (sonst sind die Messdaten verzerrt), dafür kurz: höchstens 3 Fragen, Teil des Zeitbudgets der Session.
- [x] Logging als normales FSRS-Review mit neuem `review_type = recall_check`; rohes Rating wie gewohnt über `ratingFromOutcome`. Zusätzlich speichern: Abstand zur Lektion in Stunden, Φ und Tageszeit **beim Lernen** der Lektion sowie beim Rückblick.
- [x] Überspringbar; ein übersprungener Rückblick wird geloggt (Abbruchquote ist selbst eine Kennzahl).
- [x] Feature-Flag `recall_check`.

**Akzeptanzkriterium:** Nach Abschluss einer Lektion erhält der Nutzer in der nächsten Session (≥ 1 Tag später) einen Rückblick mit Varianten; der Eintrag im `review_log` trägt `recall_check`, Abstand und Tagesform beim Lernen.

---

## Phase 9 – Verstehens-Modus (Priorität: hoch)

Ziel: Unterscheiden zwischen **Vergessen** (hilft: Wiederholen) und **Nicht-Verstehen** (hilft: anders erklären, Grundlagen schließen). Wer etwas nicht verstanden hat, bekommt es nicht einfach öfter vorgelegt.

### 9.1 Erkennen
- [x] Signale je Nutzer und Konzept (über `item_concept`) sammeln:
  - falsche Antwort mit Angabe „sicher“ (stärkstes Signal: Fehlvorstellung)
  - wiederholt dieselbe falsche Option bei einem Item oder dessen Varianten
  - Fehler bei mindestens 2 **verschiedenen** Varianten desselben Konzepts
  - Item mit wiederholten Fehlschlägen, dessen Stabilität nicht wächst (Schwelle siehe Platzhalter)
  - Simulation zum Lernziel nur mit ≥ 2 Hilfen gelöst (vorhandenes Signal aus `simulation_results`)
- [x] Auslösung nur bei einem Muster (Schwelle konfigurierbar), nicht bei Einzelfehlern. Zustand je Nutzer und Konzept speichern (`concept_struggle`: Signale, Status `detected` / `in_progress` / `resolved`), getrennt von Rohdaten.

### 9.2 Reagieren: Verstehens-Leiter
- [x] **Wiederholen pausieren:** Items des Konzepts kommen nicht mehr als normale Wiederholung in die Session, solange der Verstehens-Modus läuft (nur Planungsschicht, FSRS-Zustand bleibt unverändert).
- [x] **Verwechslung ansprechen:** Wurde wiederholt dieselbe falsche Option gewählt, deren Begründung (`rationale`) als „Häufige Verwechslung“ zeigen.
- [x] **Anders erklären:** je Lernziel 1–2 Alternativerklärungen (anderes Beispiel, Vergleich aus dem Alltag, vollständig gelöstes Beispiel). **Vorab** per KI erzeugt und durch den normalen Prüfprozess der Werkstatt freigegeben, nie live generiert. Backfill-Skript mit Kostenschätzung.
- [x] **Vormachen, dann selbst machen:** gelöstes Beispiel → Beispiel mit Lücken → eigene Aufgabe (neue Variante).
- [x] **Abschluss:** Konzept gilt als `resolved`, wenn eine neue Variante richtig beantwortet wird; danach normale Wiederholung.
- [x] Einstieg sichtbar und freundlich: „Das scheint noch nicht ganz zu sitzen. Sollen wir es anders angehen?“, jederzeit ablehnbar.

### 9.3 Grundlagen prüfen
- [x] Konzeptmodell um Voraussetzungen erweitern: Tabelle `concept_prerequisite` (concept_id, requires_concept_id). Erzeugung per KI im Tagging-Schritt nach der Kursgenerierung, Prüfung in der Werkstatt; nachträglich per Skript.
- [x] Im Verstehens-Modus 2–3 kurze Fragen zu den Voraussetzungen. Ist eine schwach, zuerst eine kurze Brückenlektion bzw. die passende Lektion, dann zurück zum Ausgangskonzept.

### 9.4 Menschen einbeziehen
- [x] Firmenbereich: Knopf „Mentor fragen“, **nur durch den Lernenden ausgelöst**. Übergibt Lernziel und die Frage des Lernenden, keine Fehlerhistorie. Niemals automatische Meldung an Arbeitgeber oder Mentor (Grundsatz „Arbeitgeber sieht nur den Status“).
- [x] **Häufung erkennen:** Scheitern viele Lernende am selben Konzept (Schwelle siehe Platzhalter), landet es automatisch in der Werkstatt-Prüfliste (`ContentReportQueue`, neuer Grund `concept_struggle`), inkl. der am häufigsten gewählten falschen Option. Anonymisiert, ohne Personenbezug.

**Akzeptanzkriterium:** Ein synthetischer Nutzer, der dieselbe falsche Option mit „sicher“ wählt und bei zwei Varianten scheitert, landet im Verstehens-Modus; die Items des Konzepts erscheinen bis zum Abschluss nicht als normale Wiederholung; nach richtiger Antwort auf eine neue Variante ist der Status `resolved`. Ein Nutzer mit einem einzelnen Fehler löst nichts aus.

---

## Phase 10 – Schwächen in spätere Lektionen einweben (Priorität: mittel)

Ziel: Schwache oder fällige Inhalte tauchen in neuem Zusammenhang wieder auf, z. B. als Teil des Lektionstests oder einer Simulation einer späteren Lektion. Gemischtes Üben in neuem Kontext festigt stärker als dieselbe Karte erneut und wirkt nicht wie Pflicht-Wiederholung.

- [x] Kandidaten: fällige oder schwache Items (niedrige Abrufwahrscheinlichkeit, Kategorie „schwach“), deren Konzept mit der aktuellen Lektion verbunden ist (gemeinsames Konzept, Voraussetzung aus 9.3 oder gleiches Themengebiet).
- [x] Einbau in Lektionstests (`SectionQuiz`): höchstens 2 Fragen bzw. 20 % des Tests, als Variante, optisch wie normale Fragen.
- [ ] Einbau in Simulationen: vorhandene Verknüpfung `task_item` nutzen; Generierung neuer Simulationen kann Items früherer Lektionen als Schritt einbauen (`embedded_step`).
- [x] **Eingewebte Fragen zählen nicht für das Bestehen der aktuellen Lektion**, nur für das Gedächtnismodell. Sonst scheitert jemand an Lektion 8 wegen Lektion 3.
- [x] Logging als `review_type = interleaved` (vorhanden), mit Kennzeichnung der Herkunft (`woven_into_lesson_id`).
- [x] Items im Verstehens-Modus (Phase 9) werden nicht eingewebt.
- [x] Feature-Flag `woven_reviews`.

**Akzeptanzkriterium:** Ein Lektionstest enthält bei vorhandenen passenden Schwächen bis zu 2 eingewebte Varianten; ihr Ergebnis aktualisiert den FSRS-Zustand, ändert aber nicht das Bestehen der Lektion.

---

## Phase 11 – Später

- [ ] Planung zusätzlich auf Konzept-Ebene: Ein schwaches Konzept zieht verwandte Items vor (über `item_concept`), auch wenn sie noch nicht fällig sind.
- [ ] Gemischte Sessions über mehrere Domains hinweg gezielt erzwingen (Interleaving), wenn ein Nutzer lange nur eine Domain übt.
- [ ] Hilfe-Leiter (Denkanstoß → Eingrenzung → Lektion → Lösung) auch für normale Szenario-Fragen, nicht nur für Simulationen.
- [ ] Brückenpfade zwischen ähnlichen Tools (siehe Konzept „Konzepte getrennt von Tools“).

---

## Reihenfolge

Die verbindliche Reihenfolge über PWA- und Didaktik-Roadmap steht in `umsetzungsplan.md`. Kurzfassung für diese Roadmap:

1. Phase 2 und Phase 1 (umgesetzt), Prüfungsnachfrage aus Phase 7 (umgesetzt).
2. Phase 4 (Vorabfragen, Einstiegstest) und Phase 8 (Rückblick): beide nutzen die Varianten aus Phase 1.
3. Phase 9 (Verstehens-Modus): verhindert, dass Lernende frustriert aussteigen; vor den neuen Antwortformaten.
4. Phase 5 und 6 parallel, vor dem Launch.
5. Phase 10 (Einweben): nach Phase 9, weil es dessen Signale und die Voraussetzungen im Konzeptmodell nutzt.
6. Phase 3 (neue Antwortformate): größter Aufwand in Generierung und Werkstatt.
7. Phase 7 begleitend; Auswertung des Rückblicks, sobald genug Daten vorliegen.
