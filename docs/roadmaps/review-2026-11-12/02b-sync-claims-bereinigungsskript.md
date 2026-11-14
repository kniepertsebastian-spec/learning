# Aufgabe 02b: Einmaliges Bereinigungsskript für verwaiste Claims

**Herkunft:** Befund 1 (Teil) aus dem Review vom 12.11.2026 · Phase 1
**Voraussetzung:** Aufgabe 02a
**Priorität:** vor dem Pilot, sobald 02a gilt
**Ort:** `sync:reprocess-conflicts` als Vorlage

## Problem
Schon vorhandene verwaiste Zeilen bleiben nach dem Umbau von 02a nicht von selbst liegen, sie müssen einmal freigegeben werden.

## Aufgaben
- [ ] Skript nach dem Muster von `sync:reprocess-conflicts` schreiben.
- [ ] Trockenlauf als Standard: zeigt Anzahl und Konten, ändert nichts.
- [ ] Ausführung nur mit ausdrücklichem Flag.

## Akzeptanzkriterium
Der Trockenlauf zeigt die Zeilen, ohne etwas zu ändern. Nach der Ausführung ist kein Claim älter als die Schwelle aus 02a übrig.
