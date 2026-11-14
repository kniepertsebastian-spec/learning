# Aufgabe 02: Verwaiste Sync-Claims freigeben

**Herkunft:** Befund 1 (Mittel, PWA/Datenintegrität) aus dem Review vom 12.11.2026 · Phase 1
**Priorität:** vor dem Pilot
**Ort:** `lib/server/sync/service.ts:98-105` (Rückgabe bei vorhandener Zeile), `:110-119` (Claim-Zeile mit Status `error` und Text „wird verarbeitet“), `lib/client/sync-core.ts:132`

## Problem
Vor der Verbuchung legt der Server eine Claim-Zeile in `sync_events` an. Stirbt der Prozess, bevor `applyEvent` fertig ist, bleibt die Zeile stehen. Jeder spätere Versuch findet sie, antwortet mit `error` und „wird verarbeitet“ und setzt bewusst kein `terminal`. Der Client speichert das Ereignis als `failed` und sendet es bei jedem Sync erneut. Es wird weder verbucht noch als `rejected` aussortiert.

Ein Aufräumen alter Claims gibt es nicht. `sync:reprocess-conflicts` behandelt nur den Status `conflict`.

## Auslöser
Ein Deploy (`docker compose up -d --build`, `docs/DEPLOY-UPDATE.md:79`) oder ein Absturz, während ein Gerät gerade seine Warteschlange überträgt. Die offline beantwortete Session dieser Person erreicht das Gedächtnismodell nie, obwohl die Regel „Lernleistung geht nie verloren“ gilt.

## Aufgaben
- [ ] Verwaiste Claim-Zeilen erkennen: Zeile in `sync_events` mit „wird verarbeitet“, älter als 5 Minuten. Zeile löschen und das Ereignis neu verarbeiten (`lib/server/sync/service.ts`).
- [ ] Test: Claim-Zeile anlegen, Uhr vorstellen, erneut senden. Das Ereignis wird verbucht.
- [ ] Einmaliges Skript mit Trockenlauf, das vorhandene verwaiste Zeilen freigibt. Muster: `sync:reprocess-conflicts`.

## Akzeptanzkriterium
Ein Neustart des Servers mitten in einer Übertragung kostet kein Ergebnis und verbucht keines doppelt.

## Hinweis (eigene Einschätzung)
Die Schwelle von 5 Minuten muss größer sein als die längste legitime Verbuchung. Sonst wird ein laufender Vorgang doppelt verarbeitet. Vor dem Umbau prüfen, ob die Verbuchung idempotent ist (Ereignis-ID in `review_log` oder `item_state`).
