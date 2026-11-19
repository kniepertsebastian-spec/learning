# Aufgabe 04a: Zod-Schema und Größenbegrenzung für Abgaben

**Herkunft:** Befund 7 (Niedrig, Validierung) aus dem Review vom 12.11.2026 · Phase 1
**Priorität:** vor dem Pilot
**Ort:** `app/api/study-sessions/[sessionId]/attempt/route.ts:33`, `…/exit/route.ts:23`, `app/api/sections/[id]/attempt/route.ts:28`, `…/exit/route.ts:20`, `app/api/remediation/[objectiveId]/attempt/route.ts:33`, `app/api/exams/[certId]/[examId]/attempt/route.ts:42`

## Problem
Der Body wird mit `as` in den erwarteten Typ gegossen, ohne Prüfung. Ungültiges JSON oder falsche Typen enden als 500 statt 400. Anders als `/api/sync` haben diese Routen keine Größengrenze.

## Aufgaben
- [x] Gemeinsames Zod-Schema für Antworten, wie im Sync-Pfad.
- [x] Body über `readJsonCapped` lesen (`lib/server/http/capped-body.ts`).
- [x] In allen sechs Routen: ungültiges JSON und falsche Typen liefern 400, zu großer Body 413.

## Akzeptanzkriterium
Jede der genannten Routen antwortet auf ungültiges JSON mit 400 und auf einen zu großen Body mit 413.

## Umsetzung (14.11.2026)
- **Neu:** `lib/server/http/attempt-body.ts` mit den gemeinsamen Schemas (`studySessionAttemptBody`, `studySessionExitBody`, `sectionAttemptBody`, `sectionExitBody`, `remediationAttemptBody`) und den Helfern `readAttemptJson` und `parseAttemptBody`. Sie lesen über `readJsonCapped` mit Grenze `MAX_ATTEMPT_BODY_BYTES` (256 KB; eine Sitzung hat einige Dutzend Antworten zu je unter 1 KB). Zu groß: 413 „Anfrage zu groß.“, kein gültiges JSON oder falsche Form: 400 „Ungültige Anfrage.“.
- **Routen:** die sechs genannten plus `/api/chapters/:id/attempt` (Kapitel-Quiz), die bisher 400 lieferte, aber ebenfalls ohne Größengrenze las. Die Prüfungsroute behält `parseExamAttemptInput` aus 05a und liest nur mit Grenze.
- **Schema:** Form und Typen, nicht Inhalt. Ob Frage oder Option existiert, entscheidet weiter der Service. Höchstens 500 Antworten je Abgabe, Kennungen höchstens 100 Zeichen, `confidence` nur `guessed`, `unsure` oder `sure`, neue Antwortformate als Union. Längen der Antworten sind großzügig; Kürzen und Verwerfen macht weiter `sanitizeAnswer`. Fehlt `answers` bei Sitzung und Notausstieg, gilt wie bisher eine leere Liste. Unbekannte Felder werden verworfen.
- **Nebeneffekt:** Eine ungültige `sessionId` bei der Wiederholung (keine UUID) war bisher ein 500 aus der Datenbank, jetzt ein 400.
- **Tests:** `app/api/attempt-bodies.test.ts` (je Route: ungültiges JSON, leerer Body, zu großer Body in Stücken und mit Content-Length, jeweils 400 bzw. 413; falsche Typen; Schemas nehmen an, was die Clients senden). Gegenprobe mit den alten Routen: 32 Tests schlagen fehl.
