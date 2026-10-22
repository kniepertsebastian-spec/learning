# Entwicklungs-Roadmap: Didaktik für Endnutzer

Technischer Umsetzungsplan, um die Lernwirkung der Plattform zu erhöhen. Das Dokument ist für die Umsetzung durch einen Coding-Agenten geschrieben und setzt kein Vorwissen aus anderen Dokumenten voraus. Grundlage ist ein Review des Stands vom 22.10.2026 (`main`, nach PR #116).

---

## Kontext

Die Plattform bereitet auf IT-Zertifikate vor. Bereits vorhanden:

- **Wiederholungsplanung PSRP-HR** (`lib/server/psrp/`, siehe `roadmap_psrp_hr.md`): FSRS über `ts-fsrs`, Planungsschicht mit Tageslimit, Rückstau-Abbau, Prüfungsmodus, Tagesform (Φ), Evaluationsgruppen `vanilla` / `planning` / `planning_state`.
- **Item = Frage:** Der FSRS-Zustand (`item_state`, `review_items`) hängt an `questions.id`. Fragen haben ein Lernziel (`objectiveId`), eine Schwierigkeit und einen Typ (`knowledge`, `comprehension`, `application`, `scenario`, `troubleshooting`). Beantwortet werden alle über Antwortoptionen (Single/Multiple Choice).
- **Rating:** `ratingFromOutcome(isCorrect, confidence)` in `lib/server/psrp/service.ts`: falsch → 1, richtig + geraten → 2, richtig ohne Angabe/unsicher → 3, richtig + sicher → 4.
- **Konzepte und Abfragevarianten** (`concepts`, `item_concept`, `probe_variant`, `questions.probe_only`): heute nur für die Kalibrierung (`selectProbes`, `user_calibration`).
- **Übungssession** (`components/StudySession.tsx`, `lib/server/study/session-service.ts`): Mix 60 % fällig / 25 % schwach / 15 % neu; Feedback erst gesammelt am Ende (`ResultSummary`). Lektionstests (`SectionQuiz`) geben Feedback pro Frage.
- **Lektionsablauf** (`components/lesson/LessonPhases.tsx`): Verstehen (Text) → Anwenden (Simulationen `terminal` / `decision`, `lib/markdown/simulation.ts`) → Auswerten.
- **Kapitel überspringen:** `applyChapterSkip` in `lib/server/psrp/implicit.ts` existiert, wird aber von keinem Einstiegstest aufgerufen.
- **Lernserie:** `computeStreak` in `lib/server/study/session-builder.ts`; ein Tag ohne abgeschlossene Session setzt die Serie auf 0.
- **Prüfungsplan** (`exam_plans.status`: `planned` / `passed` / `failed` / `cancelled`): Nutzer kann im `ExamPlanner` von Hand „bestanden“ setzen; nicht in `psrp:metrics` enthalten.

**Hinweis:** Vor Änderungen an Next.js-Routen die passende Anleitung in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`).

## Architektur-Regeln (verbindlich)

1. **Es gelten weiter alle Regeln aus `roadmap_psrp_hr.md`:** FSRS bekommt das rohe Rating, Burnout-Schutz nur in der Planungsschicht, `review_log` ist unveränderlich, Gewichte und Schwellen sind Konfiguration.
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

---

## Phase 1 – Varianten statt Wiederholung derselben Frage (Priorität: hoch)

Ziel: Wiederholungen prüfen Wissen, nicht das Wiedererkennen einer bekannten Frage.

- [ ] Datenmodell: Varianten für die **Wiederholung** nutzbar machen, nicht nur für Kalibrierung. Neue Tabelle `item_variant` (item_id → question_id, `source`: `original` | `probe` | `generated`, `active`), Original-Frage als Variante mit `source = original` eintragen (Migration + Backfill).
- [ ] Generierung: Pro Frage mindestens 2 Varianten erzeugen (anderer Kontext, andere Distraktoren, gleiches Wissen). Vorhandene `probe_variant`-Fragen mit `is_bottleneck = true` übernehmen. Backfill-Skript `npm run variants:backfill`, mit Kostenschätzung vor dem Lauf. Validierung wie bei Abfragevarianten: Variante darf Lösung oder Formulierung des Originals nicht wörtlich enthalten.
- [ ] Auswahl in der Session: Für ein fälliges Item die Variante wählen, die am längsten nicht gezeigt wurde (mind. 30 Tage Abstand, sonst die älteste). Das Review wird dem Item zugeschrieben (`review_log.item_id` = Original), die gezeigte Variante wird mitgeloggt (neue Spalte `review_log.variant_question_id`).
- [ ] Neue Fragen (Kategorie „neu“) zeigen immer zuerst das Original.
- [ ] Variante mit auffällig anderer Erfolgsquote als die übrigen (> 25 Prozentpunkte Abweichung bei ≥ 30 Antworten) automatisch in die Werkstatt-Prüfliste (`ContentReportQueue`) legen.
- [ ] Feature-Flag `variant_rotation`, im Metrik-Export getrennt auswertbar.

**Akzeptanzkriterium:** Ein Nutzer, der ein Item viermal wiederholt, sieht bei ≥ 2 vorhandenen Varianten nie zweimal hintereinander dieselbe Frage. Ein Test belegt, dass FSRS-Zustand und `review_log` am Original-Item hängen.

---

## Phase 2 – Sofortiges Feedback in Übungssessions (Priorität: hoch)

Ziel: Denkfehler werden korrigiert, solange der Kontext noch präsent ist.

- [ ] `StudySession`: Nach Antwort und (optionaler) Sicherheitsangabe sofort Richtig/Falsch, Erklärung (`explanation`) und Begründung der gewählten falschen Option (`rationale`) anzeigen, wie in `SectionQuiz` (`FeedbackPanel` wiederverwenden). Antwort danach gesperrt.
- [ ] Reihenfolge erzwingen: Sicherheitsangabe vor dem Aufdecken (sonst ist sie wertlos). Ohne Angabe gilt wie bisher Rating 3.
- [ ] Bei falscher Antwort: Link „Nochmal nachlesen“ zur passenden Lektionsstelle (gleiches Muster wie Simulations-Auswertung, `review`-Überschriften bzw. Quellenverweis).
- [ ] `ResultSummary` am Ende bleibt als Zusammenfassung erhalten.
- [ ] Prüfungssimulation (`ExamSession`) bleibt unverändert: Feedback erst am Ende.
- [ ] Einstellung „Feedback erst am Ende“ für Nutzer, die Prüfungsbedingungen üben wollen.
- [ ] Offline-Leser: gleiches Verhalten, Antworten weiter über die Sync-Warteschlange.

**Akzeptanzkriterium:** In einer Übungssession erscheint die Erklärung direkt nach jeder Antwort; das gespeicherte Rating ist identisch zum bisherigen Verhalten bei gleicher Antwort und Sicherheit.

---

## Phase 3 – Selbst erzeugen statt wiedererkennen (Priorität: hoch)

Ziel: Mehr Abfragen, bei denen die Antwort aktiv erzeugt werden muss. Das festigt Wissen stärker und senkt den Rateanteil.

### 3.1 Neue Antwortformate (regelbasiert auswertbar)
- [ ] `ordering`: Schritte in die richtige Reihenfolge bringen (z. B. Troubleshooting-Ablauf). Auswertung: exakte Reihenfolge = richtig; optional Teilpunkte nur für die Anzeige, Rating bleibt binär.
- [ ] `short_answer`: kurze freie Eingabe (Befehl, Port, Ressourcentyp) mit Liste akzeptierter Antworten und Normalisierung (Groß/Klein, Leerzeichen, Synonyme). Für Befehle die vorhandene Terminal-Logik aus `lib/markdown/simulation.ts` wiederverwenden.
- [ ] `matching`: Begriffe zuordnen (z. B. Dienst ↔ Zweck).
- [ ] Datenmodell: neues Feld `questions.answer_format` (`choice` Standard, `ordering`, `short_answer`, `matching`) plus formatabhängige Lösungsdaten; bestehender `type` (kognitive Stufe) bleibt.
- [ ] Generierung und Werkstatt: KI erzeugt für geeignete Lernziele auch diese Formate; Validierung, Vorschau und Bearbeitung in der Kurs-Werkstatt.
- [ ] Session-Mix: bis 20 % solche Fragen, bevorzugt bei Items mit Rating 4 („sicher“), um Überschätzung früh zu erkennen.

### 3.2 Erst denken, dann Optionen sehen
- [ ] Modus „Antwort zuerst überlegen“ für Single-Choice: Optionen sind zunächst verdeckt, Nutzer tippt auf „Optionen zeigen“, wenn er eine Antwort im Kopf hat. Kein zusätzliches Rating, reine Lernhilfe. Standard aus, in den Einstellungen aktivierbar; im Metrik-Export auswertbar.

### 3.3 Selbsterklärung (nicht gewertet)
- [ ] Nach einer Simulation oder einer falsch beantworteten Szenario-Frage optional: „Erkläre in einem Satz, warum …“. Freitext wird nicht bewertet und nicht für das Rating genutzt; danach Musterantwort zum Vergleich zeigen. Speicherung nur lokal oder ausdrücklich im Datenexport, nicht im Firmenbereich sichtbar.

**Akzeptanzkriterium:** Mindestens ein Pilotkurs enthält alle drei neuen Formate; sie funktionieren in Session, Lektionstest und Offline-Leser und erzeugen korrekte Ratings.

---

## Phase 4 – Handeln vor Lesen und kürzerer Weg für Könner (Priorität: hoch)

Ziel: Grundsätze „Lernen beginnt mit Handeln“ und „Gute Lernende bekommen einen kürzeren Weg“ tatsächlich umsetzen.

### 4.1 Vorabfragen vor der Lektion
- [ ] Vor dem Lektionstext 2 Fragen zu den Kernpunkten der Lektion (aus dem vorhandenen Fragenpool des Lernziels, keine Wertung, kein FSRS-Review). Hinweis: „Rate ruhig – danach weißt du, worauf du achten musst.“
- [ ] Nach dem Lesen dieselben Fragen im Lektionstest wieder vorlegen (dann gewertet).
- [ ] Überspringbar; als eigener Schritt in `LessonPhases` vor „Verstehen“.
- [ ] Feature-Flag `pretest_questions`.

### 4.2 Einstiegstest je Kapitel
- [ ] Neuer Einstieg auf der Kursseite: „Kenne ich schon? Kapitel testen“ je Domain/Kapitel.
- [ ] Test mit 1 Frage je Lernziel (max. 12), mit Sicherheitsangabe, Feedback am Ende.
- [ ] Bestanden nach Schwelle (siehe Platzhalter) → `applyChapterSkip` aufrufen, Lektionen als „übersprungen“ markieren (nicht „abgeschlossen“), Lernziele mit niedriger Leistung bleiben offen.
- [ ] Nicht bestanden → Ergebnis zeigt die schwachen Lernziele und startet dort.
- [ ] Bei Firmen-Pflichtkursen: Überspringen nur, wenn der Firmenadmin es erlaubt (Statusanzeige im Firmenbereich bleibt „abgeschlossen ja/nein“, siehe Grundsatz „Arbeitgeber sieht nur den Status“).

**Akzeptanzkriterium:** Ein Nutzer mit Vorwissen kann ein Kapitel per Einstiegstest überspringen; die Items des Kapitels starten mit Rating 4 im FSRS-Zustand und erscheinen später als normale Wiederholungen.

---

## Phase 5 – Motivation ohne Strafe (Priorität: mittel)

- [ ] Tagesserie durch **Wochenziel** ersetzen: „x von 4 Lerntagen diese Woche“. Leichte Tage aus `study_profiles.light_weekdays` zählen nicht gegen das Ziel.
- [ ] Bisherige Serie optional weiter anzeigen, aber mit automatischem Serienschutz: ein Tag Pause pro Woche bricht sie nicht.
- [ ] Nach längerer Pause (≥ 7 Tage): Begrüßung mit „Willkommen zurück – heute nur 5 Minuten“ statt Rückstand-Zahl; Rückstand wird nicht als Zahl angezeigt, nur „wird über die nächsten Tage verteilt“.
- [ ] Fortschritt als Kompetenz statt Aktivität: „3 Lernziele sicher seit letzter Woche“ in `TodayDashboard`.
- [ ] Keine Vergleiche mit anderen Nutzern (Grundsatz bleibt).

**Akzeptanzkriterium:** Ein Nutzer, der an einem leichten Tag oder einem einzelnen Tag pro Woche nicht lernt, sieht keinen zurückgesetzten Zähler.

---

## Phase 6 – Einstieg vereinfachen (Priorität: mittel)

- [ ] Erste Session ohne Check-in und ohne Sicherheitsangabe: nur „Starten“ (Zeitbudget mit Standard 10 Minuten).
- [ ] Ab der 3. abgeschlossenen Session die Sicherheitsangabe einführen, mit einem Satz Begründung („Damit wir Geratenes öfter wiederholen“).
- [ ] Check-in zur Tagesform erst ab der 5. Session anbieten, jederzeit abschaltbar.
- [ ] „Selbsteinschätzung“ (`SelfAssessmentCard`) erst zeigen, wenn belastbare Daten vorliegen (bestehende Regel beibehalten).
- [ ] Alle Zusatz-Eingaben auf einer Einstellungsseite „Wie ich lerne“ gebündelt.

**Akzeptanzkriterium:** Ein neuer Nutzer kommt von der Registrierung zur ersten beantworteten Frage mit höchstens zwei Klicks nach Kurswahl.

---

## Phase 7 – Wirkung messen (Priorität: mittel, begleitend)

- [ ] Nachfrage zum Prüfungsergebnis: 1 Tag nach `exam_plans.scheduledAt` Hinweis im Dashboard (und optional E-Mail über die vorhandene Erinnerungslogik): „Wie lief deine Prüfung?“ → `passed` / `failed` / „noch nicht“. Erinnerung nach 7 Tagen. Optional Punktzahl erfassen.
- [ ] `psrp:metrics` um Prüfungsergebnis, Bereitschaftswert (`readiness`) vor der Prüfung und Feature-Flags dieser Roadmap erweitern (anonymisiert, wie bisher mit `PSRP_EXPORT_SALT`).
- [ ] Auswertung: Wie gut sagt der Bereitschaftswert das echte Ergebnis vorher? Ergebnis als Grundlage, um die Readiness-Engine zu kalibrieren.
- [ ] Kennzahlen je Feature-Flag: Behaltensquote nach 30 Tagen, Anteil richtig + „sicher“ bei Varianten vs. Originalen, Abbruchquote, Bestehensquote.
- [ ] Da Nutzerzahlen anfangs klein sind: Auswertung als beschreibender Bericht, keine automatische Übernahme von Änderungen.

**Akzeptanzkriterium:** Für jeden Nutzer mit vergangenem Prüfungstermin ist das Ergebnis erfragt; der Export enthält es und lässt sich nach Feature-Flags aufschlüsseln.

---

## Phase 8 – Später

- [ ] Planung zusätzlich auf Konzept-Ebene: Ein schwaches Konzept zieht verwandte Items vor (über `item_concept`), auch wenn sie noch nicht fällig sind.
- [ ] Gemischte Sessions über mehrere Domains hinweg gezielt erzwingen (Interleaving), wenn ein Nutzer lange nur eine Domain übt.
- [ ] Hilfe-Leiter (Denkanstoß → Eingrenzung → Lektion → Lösung) auch für normale Szenario-Fragen, nicht nur für Simulationen.
- [ ] Brückenpfade zwischen ähnlichen Tools (siehe Konzept „Konzepte getrennt von Tools“).

---

## Reihenfolge

1. Phase 2 (klein, sofort spürbar) und Phase 1 (größter Hebel für „bestanden heißt beherrscht“).
2. Phase 4: macht zwei Grundsätze aus dem Konzept erstmals wahr und nutzt vorhandenen Code (`applyChapterSkip`).
3. Phase 3: mehr Aufwand in Generierung und Werkstatt, daher nach Phase 1 (die Varianten-Generierung lässt sich erweitern).
4. Phase 5 und 6 parallel, vor dem Launch.
5. Phase 7 begleitend ab Phase 1, Prüfungsnachfrage so früh wie möglich, weil Daten Zeit brauchen.
