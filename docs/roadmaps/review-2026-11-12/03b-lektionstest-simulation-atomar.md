# Aufgabe 03b: Lektionstest und Simulation auf Atomarität prüfen

**Herkunft:** Befund 5 (Teil) aus dem Review vom 12.11.2026 · Phase 1
**Voraussetzung:** Aufgabe 03a (Muster übernehmen)
**Priorität:** vor dem Pilot

## Aufgaben
- [ ] Lektionstest (`lib/server/sections/attempt-service.ts`) auf dieselbe Reihenfolge prüfen: Speichern, Verbuchen, Status.
- [ ] Simulation (`simulation_results`) auf dasselbe prüfen.
- [ ] Wo nötig, das Muster aus 03a übernehmen und je Pfad einen Test mit erzwungenem Fehler ergänzen.

## Akzeptanzkriterium
Für Lektionstest und Simulation gibt es je einen Test, der einen erzwungenen Fehler nach dem Verbuchen abdeckt. Keine Antwort wird doppelt verbucht.
