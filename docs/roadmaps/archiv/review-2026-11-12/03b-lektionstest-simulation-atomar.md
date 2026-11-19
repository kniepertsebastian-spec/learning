# Aufgabe 03b: Lektionstest und Simulation auf Atomarität prüfen

**Herkunft:** Befund 5 (Teil) aus dem Review vom 12.11.2026 · Phase 1
**Voraussetzung:** Aufgabe 03a (Muster übernehmen)
**Priorität:** vor dem Pilot

## Aufgaben
- [x] Lektionstest (`lib/server/sections/attempt-service.ts`) auf dieselbe Reihenfolge prüfen: Speichern, Verbuchen, Status.
- [x] Simulation (`simulation_results`) auf dasselbe prüfen.
- [x] Wo nötig, das Muster aus 03a übernehmen und je Pfad einen Test mit erzwungenem Fehler ergänzen.

## Akzeptanzkriterium
Für Lektionstest und Simulation gibt es je einen Test, der einen erzwungenen Fehler nach dem Verbuchen abdeckt. Keine Antwort wird doppelt verbucht.

## Umsetzung (14.11.2026)
- **Befund:** Lektionstest (`recordSectionQuizAttempt`), Kapitel-Quiz (`recordChapterQuizAttempt`) und Simulation (`recordSimulationSolved`) schrieben im Online-Pfad Schritt für Schritt ohne Transaktion (Versuch, Antworten, Lernzielstand, Wiederholungen bzw. Lösung, implizite Wiederholungen, Vorziehen). Ein Abbruch ließ einen halben Versuch stehen. Im Sync-Pfad liefen beide durch 02a schon in einer Transaktion.
- **Änderung:** Alle drei laufen jetzt in `inTransaction()` (Muster aus 03a). Im Sync-Pfad werden daraus Savepoints. Auch der eingewebte Review nach einer Simulation (`recordSimulationWovenAnswer`) ist eine Transaktion. Die Auswahl der eingewebten Frage nach der Simulation läuft nach der Verbuchung in einem eigenen Savepoint, damit ihr Fehler (wird abgefangen) weder die Verbuchung noch eine äußere Transaktion abbricht.
- **Nachgelagerte Schritte:** Der Zuweisungsstatus läuft schon über `afterCommit()` (`ObjectiveProgressService`). Sonst gibt es nach der Verbuchung keine best-effort-Schritte, die zurückgestellt werden müssten.
- **Idempotenz:** Ein Lektionstest-Versuch und eine Simulationsrunde sind keine Sitzungsantworten. Jeder Aufruf ist ein eigener Versuch bzw. eine eigene Runde (`solves + 1`), das ist so gewollt. Doppelt verbucht wird deshalb nicht durch eine Prüfung vor dem Verbuchen verhindert, sondern dadurch, dass ein abgebrochener Versuch nichts hinterlässt (sonst stünde beim erneuten Senden die Antwort doppelt) und dass der Sync-Pfad jedes Ereignis über die `clientEventId` nur einmal verbucht.
- **Tests:** `lib/server/sections/attempt-atomic.db.test.ts` (Lektionstest und Kapitel-Quiz: Fehler beim Schreiben der Wiederholungen per Trigger, danach kein Versuch, keine Antworten, kein Lernzielstand; erneutes Senden verbucht jede Antwort genau einmal), `lib/server/simulations/solve-atomic.db.test.ts` (Fehler beim Vorziehen, danach keine Lösung; erneutes Senden zählt eine Lösung). Gegenprobe: ohne Transaktion schlagen alle drei fehl.
