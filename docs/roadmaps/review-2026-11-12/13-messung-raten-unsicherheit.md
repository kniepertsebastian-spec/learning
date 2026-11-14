# Aufgabe 13: Messung von Raten und Unsicherheit

**Herkunft:** Phase 4 „Menschliche Faktoren, Stufe 1“ der Review-Roadmap, Faktoren 4.2 und 4.6
**Voraussetzung:** Aufgabe 06 (Antwortzeit)
**Priorität:** ab den ersten Echtdaten

## Faktoren
| Nr. | Faktor | Messung | Was die App damit tut |
|---|---|---|---|
| 4.2 | Raten und Durchklicken | Antwort schneller als ein Bruchteil der Basiszeit der Frage, gehäuft | Zählt als Signal der Frühwarnung. Die Antwort geht mit geringerem Gewicht in die Auswertung ein, nicht in FSRS |
| 4.6 | Unsicherheit ohne Selbstauskunft | Geänderte Antwort vor dem Absenden, Zeit zwischen erster Auswahl und Absenden | Ergänzt die Kalibrierung für Personen, die die Sicherheitsangabe ausgeschaltet haben |

## Umsetzung
- [x] 4.2: nur Auswertung der Antwortzeit gegen die Basiszeit je Frage. Der Bruchteil (Vorschlag: ein Drittel) wird vorab festgelegt und in `docs/MESSEN.md` eingetragen.
- [x] 4.6: Feld `changedAnswer` je Antwort im Client erfassen, an `quiz_answers` bzw. `study_session_items` speichern.
- [x] Gewichtung für 4.2 nur nach Entscheidung des Betreibers einschalten (Feature-Flag).

## Akzeptanzkriterium
Der Schwellenwert für Durchklicken steht in `docs/MESSEN.md`. `changedAnswer` ist für neue Antworten gefüllt.

## Hinweis (eigene Einschätzung)
Die Grenze für „zu schnell“ hängt von der Basiszeit ab, die erst nach einigen Wochen stabil ist. Vor dieser Phase keine Gewichtung einschalten.

## Umsetzung (14.11.2026)
- **4.2 Durchklicken:** Schwelle ein Drittel der Basiszeit, Basiszeit erst ab 20 Messungen je Frage stabil, „gehäuft“ ab 3 in einer Sitzung. Alles in `docs/MESSEN.md` eingetragen und als Konstanten in `lib/server/psrp/guessing.ts`. Neuer Abschnitt `guessing.rushing` in `psrp:metrics` mit Nenner (`guessing-db.ts`, `itemBaseTimes`).
- **4.6 Geänderte Antwort:** Der Client schickt `changedAnswer` je Antwort (Sitzung: geändert, wenn vor dem Absenden eine andere Option gewählt wurde; Lektionstest: immer `false`, weil die Auswahl dort gesperrt ist). Gespeichert an `study_session_items.changed_answer` und `quiz_answers.changed_answer` (Migration `0121_changed_answer_guessing`), auch im Zwischenstand einer Pause. Ein unbrauchbarer Wert entfällt (null), die Antwort zählt trotzdem. Export `guessing.changedAnswer`.
- **Gewichtung:** Flag `guess_weighting`, als erstes Flag standardmäßig **aus** (`DEFAULT_OFF_FLAGS` in `lib/server/feature-flags.ts`, an mit `FEATURE_GUESS_WEIGHTING=1`). Dann zählt eine durchgeklickte Antwort im Lernzielstand halb; FSRS bleibt unverändert. Dafür speichert `quiz_answers` jetzt auch die Antwortzeit.
- **Nicht gebaut:** das Signal für die Frühwarnung (erst nach H13) und die Zeit zwischen erster Auswahl und Absenden.
- **Hypothesen:** H13 und H14 in `docs/MESSEN.md`. Datenexport und Datenschutzerklärung nennen die neuen Angaben.
- **Tests:** `guessing.test.ts`, `guessing.db.test.ts` (changedAnswer gefüllt in Sitzung, Pause und Lektionstest; Beurteilung nur bei stabiler Basiszeit; Gewichtung nur mit Flag), `feature-flags.test.ts`.
