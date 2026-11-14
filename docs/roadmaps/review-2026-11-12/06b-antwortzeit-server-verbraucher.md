# Aufgabe 06b: Antwortzeit auf dem Server und in den Verbrauchern

**Herkunft:** Befund 2 (Teil) aus dem Review vom 12.11.2026 · Phase 2
**Voraussetzung:** Aufgabe 06a
**Ort:** `lib/server/db/schema.ts:3449`, `lib/server/review/service.ts:12`, `lib/server/study/session-service.ts:816-827`, Verbraucher `lib/server/psrp/planning-service.ts:63-74`, `lib/server/engagement/rules.ts:93-96`, `lib/server/psrp/review-log.ts:87-104`

## Problem
Das Feld `responseTimeMs` fehlt im Antwort-Typ. Kein Aufrufer von `recordReviewOutcomes` setzt es. Folgen: `averageSecondsPerReview` ist immer `null`, das Tageslimit nutzt 60 Sekunden, das Signal `slow_answers` kann nie auslösen.

## Aufgaben
- [x] Feld `responseTimeMs` in den Antwort-Typen, online und im Sync-Ereignis. Ältere Clients ohne Feld bleiben gültig.
- [x] Server: Werte unter 300 ms oder über 10 Minuten auf `null` setzen. An `recordReviewOutcomes` durchreichen.
- [x] Prüfen, dass die drei Verbraucher Daten bekommen: Tageslimit, `slow_answers`, Basiszeit je Frage.
- [x] `roadmap_psrp_hr.md` (Zeilen 54 und 80) mit einem Vermerk versehen.

## Akzeptanzkriterium
Nach zehn beantworteten Fragen liefert `averageSecondsPerReview` einen Wert.

## Hinweis (eigene Einschätzung)
Die Grenzen 300 ms und 10 Minuten sind Vorschläge aus der Roadmap. Rohwerte bleiben roh.

## Umsetzung (14.11.2026)
- **Eine Stelle für die Grenzen:** `lib/server/review/response-time.ts`. `plausibleResponseTimeMs()` lässt 300 ms bis 10 Minuten roh durch (nur auf ganze Millisekunden gerundet), alles andere wird `null`. `recordReviewOutcomes()` wendet das auf jede Antwort an, bevor etwas in `review_log` landet. Damit gilt es für alle Pfade, auch für die ungeprüfte Nutzlast eines Sync-Ereignisses und für Abfragevarianten.
- **Annahme im Body:** `responseTimeMs` in den Schemas aus 04a (`lib/server/http/attempt-body.ts`) für Sitzung, Notausstieg, Lektionstest und Kapitel-Quiz, dazu in `parseExamAttemptInput`. Das Feld ist optional, ältere Clients bleiben gültig. Ein unbrauchbarer Wert (Text, negativ) wird verworfen, statt die ganze Abgabe mit 400 abzulehnen: Die Antwort ist wichtiger als ihre Zeit.
- **Durchgereicht:** `StudySessionAnswerInput` und `SectionQuizAnswerInput` haben das Feld. Es geht an `recordReviewOutcomes` in `completeStudySession` (beide Zweige, also auch im Sync-Pfad für eine schon abgeschlossene Session), im Lektionstest und Kapitel-Quiz, bei eingewebten Fragen und in der Prüfung.
- **Pause:** `StudySessionDraft` speichert den Rohwert (`rawResponseTimeMs`, ohne Grenzen), damit die Zeit einer pausierten Frage beim Fortsetzen weiterläuft. Die Grenzen gelten erst beim Verbuchen.
- **Verbraucher:** Alle drei lesen `review_log.response_time_ms` und brauchten keine Änderung. Geprüft mit echten Daten: Tageslimit (`averageSecondsPerReview`), Signal `slow_answers` (`collectEngagementFacts` und `detectEngagementSignals`) und Basiszeit je Frage (`getItemBaseTimeMs`).
- **Nicht gemessen:** die eingewebte Frage nach einer Simulation (`/api/sections/:id/woven`). Der Client misst dort keine Zeit (06a), das Feld fehlt also, und die Zeile bekommt `null`.
- **Doku:** Vermerke in `roadmap_psrp_hr.md` (Basiszeit je Item, Tageslimit).
- **Tests:** `lib/server/review/response-time.test.ts` (Grenzen, Schema, Prüfungs-Parser). `lib/server/review/response-time.db.test.ts` deckt ab: das Akzeptanzkriterium (zehn Antworten, dann liefert `averageSecondsPerReview` einen Wert), die Grenzen beim Verbuchen, Lektionstest, Prüfung, Sync-Ereignis, Pause und alle drei Verbraucher. Gegenprobe: Ohne die Server-Änderung schlagen 7 der 10 Tests fehl.
- **Für 06c:** Der Sync-Pfad wertet `responseTimeMs` aus, wenn es in der Nutzlast steht. Offen bleibt nur, ob Offline-Pakete das Feld liefern.
