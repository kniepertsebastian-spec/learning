# Aufgabe 06: Antwortzeit erfassen

**Herkunft:** Befund 2 (Mittel, Logik) aus dem Review vom 12.11.2026 · Phase 2
**Priorität:** vor dem Pilot. Grundlage für alle Messungen in den Aufgaben 12 bis 19.
**Ort:** `lib/server/db/schema.ts:3449` (`review_log.response_time_ms`), `lib/server/review/service.ts:12` (Eingabefeld), `lib/server/study/session-service.ts:816-827` (Antwort-Typ ohne Zeitfeld). Verbraucher: `lib/server/psrp/planning-service.ts:63-74`, `lib/server/engagement/rules.ts:93-96`, `lib/server/psrp/review-log.ts:87-104`

## Problem
Kein Client misst die Zeit bis zur Antwort, und kein Aufrufer von `recordReviewOutcomes` setzt `responseTimeMs`. Im ganzen Repository schreibt nur ein Test einen Wert. Die Spalte ist im Betrieb immer leer.

Folgen:
- `averageSecondsPerReview` liefert immer `null`.
- Das Tageslimit rechnet für alle mit dem Rückfallwert von 60 Sekunden.
- Das Frühwarn-Signal `slow_answers` kann nie auslösen.
- Die Basiszeit je Frage bleibt leer.

In `roadmap_psrp_hr.md:54` und `:80` sind diese Punkte als erledigt abgehakt, obwohl sie es nicht sind.

## Auslöser
Jede Session. Wer schnell antwortet, bekommt zu wenige Fragen für sein Zeitbudget, wer langsam ist, zu viele. Die Entlastung bei auffällig langsamen Antworten greift nie.

## Aufgaben
- [ ] Client: je Frage die Zeit von der Anzeige bis zur Antwort messen (`StudySession.tsx`, `SectionQuiz.tsx`, Prüfung). Zeit im Hintergrund abziehen (`visibilitychange`), damit ein Tab-Wechsel nicht als Nachdenken zählt.
- [ ] Feld `responseTimeMs` in den Antwort-Typen, online und im Sync-Ereignis. Ältere Clients ohne Feld bleiben gültig.
- [ ] Server: Werte unter 300 ms oder über 10 Minuten auf `null` setzen. An `recordReviewOutcomes` durchreichen.
- [ ] Prüfen, dass die drei vorhandenen Verbraucher jetzt Daten bekommen: Tageslimit aus persönlichem Durchschnitt, Signal `slow_answers`, Basiszeit je Frage.
- [ ] Offline-Pakete: das Feld im Offline-Leser genauso füllen.
- [ ] Tests: Antwort mit Zeit landet in `review_log.response_time_ms`, online und über den Sync. Zeit im Hintergrund zählt nicht.
- [ ] `roadmap_psrp_hr.md` (Zeilen 54 und 80) mit einem Vermerk versehen, dass die Messung erst hier dazukam.

## Akzeptanzkriterium
Nach zehn beantworteten Fragen liefert `averageSecondsPerReview` einen Wert. Das Tageslimit einer Person mit kurzen Antwortzeiten liegt über dem einer Person mit langen.

## Hinweis (eigene Einschätzung)
Die Grenzen 300 ms und 10 Minuten sind Vorschläge aus der Roadmap. Rohwerte bleiben roh, Ausreißer werden erst bei der Auswertung behandelt (Regel 5 der Messregeln).
