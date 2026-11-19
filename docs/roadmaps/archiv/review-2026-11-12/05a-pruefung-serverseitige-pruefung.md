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
- [x] Alle `questionIds` gegen `exam_questions` dieser Prüfung prüfen, sonst 400.
- [x] Score gegen alle Prüfungsfragen berechnen. Fehlende Antworten zählen als falsch.
- [x] Anzahl der Antworten gleich Anzahl der Prüfungsfragen verlangen. Doppelte Frage-IDs ablehnen.
- [x] `correctOptionId` nicht mehr an den Client zurückgeben.
- [x] Tests: eine richtige von zehn Antworten ergibt nicht bestanden. Fremde oder fehlende Frage-IDs werden abgelehnt. Die Antwort enthält keine Lösung.

## Akzeptanzkriterium
Eine Anfrage mit einer einzigen richtigen Antwort wird abgelehnt oder ergibt nicht bestanden. Die Antwort der Route enthält keine `correctOptionId`.

## Abgrenzung
Der Lektionstest (`lib/server/sections/attempt-service.ts:162`) gibt ebenfalls `correctOptionId` zurück. Das ist ein eigenes Thema und nicht Teil dieser Aufgabe.

## Umsetzung (14.11.2026)
- Auswertung aus der Route in `lib/server/exam/attempt.ts` (`submitExamAttempt`) verschoben. Die Route prüft nur noch Anmeldung und Sichtbarkeit und übersetzt Fehler in Statuscodes.
- **Prüfungen (alle mit 400):** Frage gehört nicht zu `exam_questions` dieser Prüfung, Frage doppelt, Anzahl ungleich Anzahl der Prüfungsfragen, gewählte Option gehört nicht zur Frage (sonst wäre das Speichern in `exam_answers` am Fremdschlüssel gescheitert), Body ohne `answers`-Liste.
- **Score** = richtige / alle Prüfungsfragen. Leere Auswahl zählt als falsch. Eine Prüfung ohne Fragen ist nie bestanden.
- **Antwort** enthält `results` nur noch mit `questionId` und `isCorrect`, keine `correctOptionId`. Der Client (`components/ExamSession.tsx`) nutzt `results` nicht.
- Versuch, Antworten und Wiederholungen werden in einer Transaktion gespeichert. Abschlussstatistik und Skill laufen nach dem Commit (beide waren schon vorher best effort).
- **Tests:** `lib/server/exam/attempt.db.test.ts` (1 von 10 richtig ergibt 10 % und nicht bestanden; nur eine eingereichte Antwort wird abgelehnt; fremde und doppelte Fragen und fremde Optionen werden abgelehnt; die Antwort enthält keine Lösung).
- **Bekannte Einschränkung:** Wird eine Frage zwischen Laden und Abgabe gelöscht, lehnt der Server die Abgabe ab, weil die Frage nicht mehr zu `exam_questions` gehört. Der Fall ist selten; die Person kann die Prüfung neu starten.
