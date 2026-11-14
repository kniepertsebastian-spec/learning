# Aufgabe 06a: Antwortzeit im Client messen

**Herkunft:** Befund 2 (Mittel, Logik) aus dem Review vom 12.11.2026 · Phase 2
**Priorität:** vor dem Pilot. Grundlage für die Messungen 12 bis 19.
**Ort:** `StudySession.tsx`, `SectionQuiz.tsx`, Prüfung

## Problem
Kein Client misst die Zeit bis zur Antwort. Im ganzen Repository schreibt nur ein Test einen Wert in `review_log.response_time_ms`.

## Aufgaben
- [ ] Je Frage die Zeit von der Anzeige bis zur Antwort messen.
- [ ] Zeit im Hintergrund abziehen (`visibilitychange`), damit ein Tab-Wechsel nicht als Nachdenken zählt.

## Akzeptanzkriterium
Ein Tab-Wechsel während einer Frage erhöht die gemessene Zeit nicht.
