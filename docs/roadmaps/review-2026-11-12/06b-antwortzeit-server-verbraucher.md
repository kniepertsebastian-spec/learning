# Aufgabe 06b: Antwortzeit auf dem Server und in den Verbrauchern

**Herkunft:** Befund 2 (Teil) aus dem Review vom 12.11.2026 · Phase 2
**Voraussetzung:** Aufgabe 06a
**Ort:** `lib/server/db/schema.ts:3449`, `lib/server/review/service.ts:12`, `lib/server/study/session-service.ts:816-827`, Verbraucher `lib/server/psrp/planning-service.ts:63-74`, `lib/server/engagement/rules.ts:93-96`, `lib/server/psrp/review-log.ts:87-104`

## Problem
Das Feld `responseTimeMs` fehlt im Antwort-Typ. Kein Aufrufer von `recordReviewOutcomes` setzt es. Folgen: `averageSecondsPerReview` ist immer `null`, das Tageslimit nutzt 60 Sekunden, das Signal `slow_answers` kann nie auslösen.

## Aufgaben
- [ ] Feld `responseTimeMs` in den Antwort-Typen, online und im Sync-Ereignis. Ältere Clients ohne Feld bleiben gültig.
- [ ] Server: Werte unter 300 ms oder über 10 Minuten auf `null` setzen. An `recordReviewOutcomes` durchreichen.
- [ ] Prüfen, dass die drei Verbraucher Daten bekommen: Tageslimit, `slow_answers`, Basiszeit je Frage.
- [ ] `roadmap_psrp_hr.md` (Zeilen 54 und 80) mit einem Vermerk versehen.

## Akzeptanzkriterium
Nach zehn beantworteten Fragen liefert `averageSecondsPerReview` einen Wert.

## Hinweis (eigene Einschätzung)
Die Grenzen 300 ms und 10 Minuten sind Vorschläge aus der Roadmap. Rohwerte bleiben roh.
