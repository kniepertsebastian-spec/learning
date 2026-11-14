# Aufgabe 02a: Verwaiste Sync-Claims erkennen und neu verarbeiten

**Herkunft:** Befund 1 (Mittel, PWA/Datenintegrität) aus dem Review vom 12.11.2026 · Phase 1
**Priorität:** vor dem Pilot
**Ort:** `lib/server/sync/service.ts:98-105` (Rückgabe bei vorhandener Zeile), `:110-119` (Claim-Zeile mit Status `error` und Text „wird verarbeitet“), `lib/client/sync-core.ts:132`

## Problem
Vor der Verbuchung legt der Server eine Claim-Zeile in `sync_events` an. Stirbt der Prozess vor dem Ende von `applyEvent`, bleibt die Zeile stehen. Jeder spätere Versuch antwortet mit `error` und „wird verarbeitet“ und setzt bewusst kein `terminal`. Der Client speichert das Ereignis als `failed` und sendet es bei jedem Sync erneut. Es wird weder verbucht noch als `rejected` aussortiert.

## Auslöser
Ein Deploy (`docker compose up -d --build`, `docs/DEPLOY-UPDATE.md:79`) oder ein Absturz, während ein Gerät gerade seine Warteschlange überträgt.

## Aufgaben
- [x] Verwaiste Claim-Zeilen erkennen: Zeile in `sync_events` mit „wird verarbeitet“, älter als 5 Minuten. Zeile löschen, Ereignis neu verarbeiten (`lib/server/sync/service.ts`).
- [x] Test: Claim-Zeile anlegen, Uhr vorstellen, erneut senden. Das Ereignis wird verbucht.

## Akzeptanzkriterium
Ein Neustart mitten in einer Übertragung kostet kein Ergebnis und verbucht keines doppelt.

## Hinweis (eigene Einschätzung)
Die Schwelle von 5 Minuten muss größer sein als die längste legitime Verbuchung. Vorher prüfen, ob die Verbuchung idempotent ist.

## Umsetzung (14.11.2026)
- **Idempotenz geprüft:** Die Verbuchung war es nicht. Ein Lektionstest legt bei jedem Aufruf einen neuen `quiz_attempts`-Eintrag an, eine Session verbucht ihre Wiederholungen erneut. Ein bloßes Löschen alter Claims hätte also doppelt verbucht, wenn der Prozess nach der Verbuchung, aber vor dem Abschluss der Claim-Zeile endet.
- **Lösung:** Verbuchung und Abschluss der Claim-Zeile laufen jetzt in einer Transaktion (`inTransaction()` in `lib/server/db/client.ts`; `getDb()` liefert darin die laufende Transaktion). Bricht der Prozess ab, ist nichts verbucht, nur die Claim-Zeile bleibt.
- **Übernahme:** Eine Claim-Zeile mit „wird verarbeitet“, älter als `STALE_CLAIM_MS` (5 Minuten, `lib/server/sync/service.ts`), wird gelöscht und das Ereignis im selben Aufruf neu verarbeitet. Die Verbuchung hält ihre Claim-Zeile bis zum Commit gesperrt (`FOR UPDATE`). Eine Übernahme wartet also auf eine noch laufende Verbuchung und löscht danach nichts. Die Schwelle muss deshalb nicht größer sein als die längste Verbuchung, um doppelte Verbuchung zu verhindern; sie bestimmt nur, wie schnell eine verwaiste Zeile frei wird.
- **Nachgelagerte Schritte** (Verstehens-Erkennung, Fortschritts-Stand, Frühwarnung, Varianten-Prüfung, Grundlagen-Check, Firmenzuweisungen) laufen über `afterCommit()` nach dem Commit. Ihre Fehler rollen die Verbuchung nicht zurück.
- **Tests:** `lib/server/sync/stale-claim.db.test.ts` (verwaiste Zeile wird nach der Schwelle übernommen und genau einmal verbucht; Fehler zwischen Verbuchung und Abschluss hinterlässt nichts; eine gesperrte, noch laufende Verbuchung wird nicht übernommen), `lib/server/db/client.db.test.ts` (Transaktion, Savepoint, `afterCommit`).
- **Für 02b:** Die Schwelle steht als `STALE_CLAIM_MS` zur Verfügung. Verwaiste Zeilen werden mit 02a bereits beim nächsten Senden freigegeben; das Skript räumt Zeilen ab, deren Gerät nicht mehr sendet.
