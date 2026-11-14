# Aufgabe 03: Session-Abschluss atomar machen

**Herkunft:** Befund 5 (Niedrig, Datenintegrität) aus dem Review vom 12.11.2026 · Phase 1
**Priorität:** vor dem Pilot (zusammen mit Aufgabe 02)
**Ort:** `lib/server/study/session-service.ts:948-960` (Antworten speichern), `:961-973` (Wiederholungen verbuchen), `:989-992` (Status `completed`)

## Problem
Die drei Schritte laufen nacheinander ohne gemeinsame Transaktion. Schlägt nach dem Verbuchen etwas fehl (etwa `recordUnderstandResults` oder das Status-Update bei einem kurzen Datenbankfehler), bleibt die Session `in_progress`. Die Wiederholungen stehen aber bereits in `review_log` und `item_state`.

## Auslöser
Der Client sendet erneut, online oder über den Sync. Dort wird die Claim-Zeile bei unerwarteten Fehlern gelöscht. Dieselben Antworten werden ein zweites Mal verbucht, der FSRS-Zustand rückt zweimal vor.

## Aufgaben
- [ ] `completeStudySession`: Antworten speichern, Wiederholungen verbuchen und den Status setzen, alles in einer Transaktion.
- [ ] Dasselbe für Lektionstest und Simulation prüfen.
- [ ] Test: Fehler nach dem Verbuchen erzwingen, dann erneut senden. In `review_log` steht jede Antwort genau einmal.

## Akzeptanzkriterium
Jede Antwort steht genau einmal in `review_log`, auch nach einem erzwungenen Fehler und einem erneuten Senden.

## Hinweis (eigene Einschätzung)
Die Transaktion allein reicht nicht, wenn der Client erneut sendet. Zusätzlich vor dem Verbuchen prüfen, ob es für `session_id` und Frage schon einen Eintrag gibt.
