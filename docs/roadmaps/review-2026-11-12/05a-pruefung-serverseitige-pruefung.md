# Aufgabe 05a: Prüfungsabgabe serverseitig prüfen

**Herkunft:** neuer Befund aus der Nachprüfung vom 14.11.2026 (nicht im Review vom 12.11.) · Phase 1 (Ergänzung)
**Priorität:** vor dem Pilot, vor allen Messungen
**Einstufung:** Mittel. Im Chat-Bericht vom 14.11. stand Niedrig. Erhöht, weil eine einzige richtige Antwort zum Bestehen reicht.
**Ort:** `app/api/exams/[certId]/[examId]/attempt/route.ts:55` (`questionIds` aus dem Body), `:77` (`correctOptionId` wird zurückgegeben), `:85` (Score), `:98` (`passed`)

## Problem
1. **Zählung nur über eingereichte Antworten.** Score ist `richtige / eingereichte Antworten` (`:85`). Eine einzige richtige Antwort ergibt 100 %, `passed` ist wahr (`:98`).
2. **Fremde Fragen werden akzeptiert.** Frage-IDs aus dem Body werden nicht gegen `exam_questions` dieser Prüfung geprüft (`:55`).
3. **Lösungen werden ausgeliefert.** Die Antwort enthält `correctOptionId` für jede geschickte Frage-ID (`:77`). Wer Optionen durchprobiert, kennt danach die richtige.

Der ehrliche Client sendet alle Fragen (`components/ExamSession.tsx:111-114`). Das Problem betrifft nur manipulierte Anfragen.

## Folgen
Ein bestandener Versuch aus einer manipulierten Anfrage wirkt auf `recordFinalExamPass`, die anonyme Abschlussstatistik (`lib/server/stats/completions.ts:115-140`), automatisch vergebene Skills (`lib/server/profile/service.ts:108`, `:149`) und das Dashboard. Nach meiner Prüfung nicht betroffen: Firmen-Zuweisungen und das signierte Lernprofil (`lib/server/profile-export/service.ts`).

## Aufgaben
- [ ] Alle `questionIds` gegen `exam_questions` dieser Prüfung prüfen, sonst 400.
- [ ] Score gegen alle Prüfungsfragen berechnen. Fehlende Antworten zählen als falsch.
- [ ] Anzahl der Antworten gleich Anzahl der Prüfungsfragen verlangen. Doppelte Frage-IDs ablehnen.
- [ ] `correctOptionId` nicht mehr an den Client zurückgeben.
- [ ] Tests: eine richtige von zehn Antworten ergibt nicht bestanden. Fremde oder fehlende Frage-IDs werden abgelehnt. Die Antwort enthält keine Lösung.

## Akzeptanzkriterium
Eine Anfrage mit einer einzigen richtigen Antwort wird abgelehnt oder ergibt nicht bestanden. Die Antwort der Route enthält keine `correctOptionId`.

## Abgrenzung
Der Lektionstest (`lib/server/sections/attempt-service.ts:162`) gibt ebenfalls `correctOptionId` zurück. Das ist ein eigenes Thema und nicht Teil dieser Aufgabe.
