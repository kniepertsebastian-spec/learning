# Aufgabe 03a: `completeStudySession` in einer Transaktion

**Herkunft:** Befund 5 (Niedrig, Datenintegrität) aus dem Review vom 12.11.2026 · Phase 1
**Priorität:** vor dem Pilot
**Ort:** `lib/server/study/session-service.ts:948-960` (Antworten speichern), `:961-973` (Wiederholungen verbuchen), `:989-992` (Status `completed`)

## Problem
Die Schritte laufen nacheinander ohne gemeinsame Transaktion. Schlägt nach dem Verbuchen etwas fehl, bleibt die Session `in_progress`, die Wiederholungen stehen aber in `review_log` und `item_state`. Sendet der Client erneut, werden dieselben Antworten ein zweites Mal verbucht.

## Aufgaben
- [ ] Antworten speichern, Wiederholungen verbuchen und Status setzen in einer Transaktion.
- [ ] Vor dem Verbuchen prüfen, ob es für `session_id` und Frage schon einen Eintrag gibt (Idempotenz).
- [ ] Test: Fehler nach dem Verbuchen erzwingen, dann erneut senden. Jede Antwort steht genau einmal in `review_log`.

## Akzeptanzkriterium
Jede Antwort steht genau einmal in `review_log`, auch nach einem erzwungenen Fehler und erneutem Senden.
