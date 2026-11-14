# Aufgabe 04a: Zod-Schema und Größenbegrenzung für Abgaben

**Herkunft:** Befund 7 (Niedrig, Validierung) aus dem Review vom 12.11.2026 · Phase 1
**Priorität:** vor dem Pilot
**Ort:** `app/api/study-sessions/[sessionId]/attempt/route.ts:33`, `…/exit/route.ts:23`, `app/api/sections/[id]/attempt/route.ts:28`, `…/exit/route.ts:20`, `app/api/remediation/[objectiveId]/attempt/route.ts:33`, `app/api/exams/[certId]/[examId]/attempt/route.ts:42`

## Problem
Der Body wird mit `as` in den erwarteten Typ gegossen, ohne Prüfung. Ungültiges JSON oder falsche Typen enden als 500 statt 400. Anders als `/api/sync` haben diese Routen keine Größengrenze.

## Aufgaben
- [ ] Gemeinsames Zod-Schema für Antworten, wie im Sync-Pfad.
- [ ] Body über `readJsonCapped` lesen (`lib/server/http/capped-body.ts`).
- [ ] In allen sechs Routen: ungültiges JSON und falsche Typen liefern 400, zu großer Body 413.

## Akzeptanzkriterium
Jede der genannten Routen antwortet auf ungültiges JSON mit 400 und auf einen zu großen Body mit 413.
