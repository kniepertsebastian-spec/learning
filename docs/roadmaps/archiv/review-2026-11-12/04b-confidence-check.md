# Aufgabe 04b: Check-Constraint für `confidence`

**Herkunft:** Befund 7 (Teil) aus dem Review vom 12.11.2026 · Phase 1
**Voraussetzung:** keine, unabhängig von 04a möglich
**Priorität:** vor dem Pilot

## Problem
`confidence` ist in der Datenbank freier Text ohne Check. Jeder Wert wird gespeichert, auch wenn er nicht zu „geraten“, „unsicher“ oder „sicher“ gehört.

## Aufgaben
- [x] Bestehende Werte in `study_session_items.confidence` und `quiz_answers.confidence` prüfen.
- [x] Migration mit Check-Constraint auf die drei erlaubten Werte, bestehende Abweichungen vorher korrigieren oder melden.
- [x] Test: unbekannter Wert wird abgelehnt.

## Akzeptanzkriterium
Die Datenbank lehnt einen unbekannten `confidence`-Wert ab. Die Migration läuft auf einer Kopie der Daten ohne Fehler.

## Umsetzung (14.11.2026)
- **Migration `0117_confidence_check.sql`:** Check-Constraints `quiz_answers_confidence_check` und `study_session_items_confidence_check` (NULL, `guessed`, `unsure`, `sure`), auch im Schema (`lib/server/db/schema.ts`).
- **Bestehende Werte:** Die Migration zählt Abweichungen, gibt sie als Meldung (`NOTICE`) aus und setzt sie auf NULL, bevor sie den Constraint anlegt. Die Antwort bleibt, nur die ungültige Selbsteinschätzung entfällt. Geprüft auf einer Kopie der Test-Datenbank mit je einer ungültigen, einer gültigen und einer leeren Zeile je Tabelle: Migration läuft ohne Fehler, ungültige Zeilen sind NULL, gültige unverändert, ein neuer unbekannter Wert wird abgelehnt. Vor dem Einspielen auf dem Server lohnt ein Blick auf die Meldung der Migration.
- **Schreibwege:** `parseConfidence()` (`lib/answer-confidence.ts`) verwirft unbekannte Werte vor dem Speichern. Das ist nötig, weil die Nutzdaten der Sync-Warteschlange nicht per Schema geprüft werden: ein ungültiger Wert von einem älteren Gerät würde sonst am Constraint scheitern, und das Ereignis bliebe als Fehler liegen und würde bei jedem Sync erneut gesendet. Der Online-Weg lehnt unbekannte Werte schon mit 400 ab (Schema aus 04a).
- **Tests:** `lib/server/db/confidence-check.db.test.ts` (beide Tabellen lehnen einen unbekannten Wert ab und nehmen die erlaubten an; Lektionstest und Sync-Ereignis mit unbekanntem Wert werden verbucht, die Einschätzung entfällt). Gegenprobe ohne `parseConfidence`: die beiden Verbuchungstests schlagen fehl.
