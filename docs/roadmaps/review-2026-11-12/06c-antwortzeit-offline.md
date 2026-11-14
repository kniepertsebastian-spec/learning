# Aufgabe 06c: Antwortzeit in den Offline-Paketen

**Herkunft:** Befund 2 (Teil) aus dem Review vom 12.11.2026 · Phase 2
**Voraussetzung:** Aufgabe 06b
**Priorität:** vor dem Pilot

## Aufgaben
- [ ] Offline-Leser füllt das Feld genauso wie der Online-Pfad.
- [ ] Test: Antwort mit Zeit offline erfasst landet nach dem Sync in `review_log.response_time_ms`.
- [ ] Zeit im Hintergrund zählt auch offline nicht.

## Akzeptanzkriterium
Eine offline beantwortete Frage hat nach dem Sync dieselbe Zeit wie eine online beantwortete.
