# Aufgabe 05: Prüfungsabgabe absichern

**Herkunft:** neuer Befund aus der Nachprüfung vom 14.11.2026 (nicht im Review-Dokument vom 12.11. enthalten) · Phase 1 (Ergänzung)
**Priorität:** vor dem Pilot, vor allen Messungen
**Einstufung:** Mittel. Im Chat-Bericht vom 14.11. stand Niedrig. Die Einstufung wurde nach der Prüfung des Codes erhöht, weil eine einzelne richtige Antwort zum Bestehen reicht.
**Ort:** `app/api/exams/[certId]/[examId]/attempt/route.ts:55` (`questionIds` aus dem Body), `:77` (`correctOptionId` wird zurückgegeben), `:85` (Score), `:98` (`passed`), `:132` (`recordFinalExamPass`), `:137` (`recordReviewOutcomes`)

## Problem
1. **Zählung nur über eingereichte Antworten.** Der Score ist `richtige / eingereichte Antworten` (`:85`). Eine einzige richtige Antwort ergibt 100 %, und `passed` ist wahr (`:98`).
2. **Fremde Fragen werden akzeptiert.** Die Frage-IDs kommen aus dem Body und werden nicht gegen `exam_questions` dieser Prüfung geprüft (`:55`). Die Optionen werden für jede ID geladen.
3. **Lösungen werden ausgeliefert.** Die Antwort enthält `correctOptionId` für jede Frage-ID, die der Client schickt (`:77`). Wer Optionen durchprobiert, kennt danach die richtige.

Der ehrliche Client sendet alle Fragen (`components/ExamSession.tsx:111-114`), das Problem betrifft also nur manipulierte Anfragen.

## Folgen
Ein bestandener Versuch aus einer manipulierten Anfrage wirkt auf:
- `recordFinalExamPass`, anonyme Abschlussstatistik (`lib/server/stats/completions.ts:115-140`, `insertCompletion` `:93`),
- automatisch vergebene Skills (`lib/server/profile/service.ts:108`, `:149`),
- das Dashboard.

Nach der Prüfung nicht betroffen sind Firmen-Zuweisungen und das signierte Lernprofil (`lib/server/profile-export/service.ts`, basiert auf `userCertificates`). Ob ein Prüfungsversuch dort einfließt, sollte beim Umbau mitgeprüft werden.

## Aufgaben
- [ ] Alle `questionIds` gegen `exam_questions` dieser Prüfung prüfen, sonst 400.
- [ ] Score gegen alle Prüfungsfragen berechnen. Fehlende Antworten zählen als falsch.
- [ ] Anzahl der Antworten gleich Anzahl der Prüfungsfragen verlangen. Doppelte Frage-IDs ablehnen.
- [ ] `correctOptionId` nicht mehr an den Client zurückgeben.
- [ ] Bestehende Versuche prüfen: Gab es Abschlüsse mit weniger Antworten als Fragen? Ob und wie sie korrigiert werden, entscheidet der Betreiber.
- [ ] Tests: eine richtige von zehn Antworten ergibt nicht bestanden. Fremde oder fehlende Frage-IDs werden abgelehnt. Die Antwort enthält keine Lösung.

## Akzeptanzkriterium
Eine Anfrage mit einer einzigen richtigen Antwort wird abgelehnt oder ergibt nicht bestanden. Die Antwort der Route enthält keine `correctOptionId`.

## Abgrenzung
Der Lektionstest (`lib/server/sections/attempt-service.ts:131-132`) filtert auf vorhandene Fragen-IDs, das ist gewollt. Die Antwort dort enthält `correctOptionId` (`:162`) und gehört zu einer eigenen Prüfung der Lektionstests, nicht zu dieser Aufgabe.
