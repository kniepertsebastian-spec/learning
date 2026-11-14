# Aufgabe 04b: Check-Constraint für `confidence`

**Herkunft:** Befund 7 (Teil) aus dem Review vom 12.11.2026 · Phase 1
**Voraussetzung:** keine, unabhängig von 04a möglich
**Priorität:** vor dem Pilot

## Problem
`confidence` ist in der Datenbank freier Text ohne Check. Jeder Wert wird gespeichert, auch wenn er nicht zu „geraten“, „unsicher“ oder „sicher“ gehört.

## Aufgaben
- [ ] Bestehende Werte in `study_session_items.confidence` und `quiz_answers.confidence` prüfen.
- [ ] Migration mit Check-Constraint auf die drei erlaubten Werte, bestehende Abweichungen vorher korrigieren oder melden.
- [ ] Test: unbekannter Wert wird abgelehnt.

## Akzeptanzkriterium
Die Datenbank lehnt einen unbekannten `confidence`-Wert ab. Die Migration läuft auf einer Kopie der Daten ohne Fehler.
