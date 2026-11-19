# Aufgabe 03a: `completeStudySession` in einer Transaktion

**Herkunft:** Befund 5 (Niedrig, Datenintegrität) aus dem Review vom 12.11.2026 · Phase 1
**Priorität:** vor dem Pilot
**Ort:** `lib/server/study/session-service.ts:948-960` (Antworten speichern), `:961-973` (Wiederholungen verbuchen), `:989-992` (Status `completed`)

## Problem
Die Schritte laufen nacheinander ohne gemeinsame Transaktion. Schlägt nach dem Verbuchen etwas fehl, bleibt die Session `in_progress`, die Wiederholungen stehen aber in `review_log` und `item_state`. Sendet der Client erneut, werden dieselben Antworten ein zweites Mal verbucht.

## Aufgaben
- [x] Antworten speichern, Wiederholungen verbuchen und Status setzen in einer Transaktion.
- [x] Vor dem Verbuchen prüfen, ob es für `session_id` und Frage schon einen Eintrag gibt (Idempotenz).
- [x] Test: Fehler nach dem Verbuchen erzwingen, dann erneut senden. Jede Antwort steht genau einmal in `review_log`.

## Akzeptanzkriterium
Jede Antwort steht genau einmal in `review_log`, auch nach einem erzwungenen Fehler und erneutem Senden.

## Umsetzung (14.11.2026)
- `completeStudySession` läuft in `inTransaction()` (aus 02a). Antworten speichern, Wiederholungen verbuchen, Verstehens- und Rückblick-Ergebnisse und Status `completed` werden gemeinsam committet oder gar nicht.
- Die Session-Zeile wird zu Beginn gesperrt (`FOR UPDATE`). Eine zweite, gleichzeitige Abgabe wartet und wird danach als „bereits abgeschlossen“ abgelehnt.
- **Idempotenz:** Vor dem Verbuchen wird `review_log` nach Einträgen mit dieser `session_id` und Frage durchsucht (bei Abfrage-Varianten Original-Item plus Variante). Solche Fragen werden nicht noch einmal verbucht, zählen aber weiter im Ergebnis. Das greift vor allem im Sync-Pfad, wenn ein Gerät Antworten zu einer schon abgeschlossenen Session sendet.
- Nachgelagerte Schritte (Grundlagen-Check, Varianten-Prüfung, Verstehens-Erkennung, Fortschritts-Stand, Frühwarnung) laufen nach dem Commit (`afterCommit()`), ihre Fehler rollen die Verbuchung nicht zurück.
- **Tests:** `lib/server/study/complete-atomic.db.test.ts` (Fehler beim Setzen des Status nach dem Verbuchen, dann erneutes Senden; zwei gleichzeitige Abgaben; erneutes Senden an eine abgeschlossene Session). Gegenprobe: ohne Transaktion schlagen die ersten beiden fehl.
- **Für 03b:** Muster ist `return inTransaction(() => ...)` um die Verbuchung, nachgelagerte best-effort-Schritte mit `afterCommit()`, Fehler im Test per Trigger auf dem letzten Schritt erzwingen (siehe Testdatei). Im Sync-Pfad laufen Lektionstest und Simulation durch 02a bereits in einer Transaktion; offen ist der Online-Pfad.
