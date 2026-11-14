# Aufgabe 06a: Antwortzeit im Client messen

**Herkunft:** Befund 2 (Mittel, Logik) aus dem Review vom 12.11.2026 · Phase 2
**Priorität:** vor dem Pilot. Grundlage für die Messungen 12 bis 19.
**Ort:** `StudySession.tsx`, `SectionQuiz.tsx`, Prüfung

## Problem
Kein Client misst die Zeit bis zur Antwort. Im ganzen Repository schreibt nur ein Test einen Wert in `review_log.response_time_ms`.

## Aufgaben
- [x] Je Frage die Zeit von der Anzeige bis zur Antwort messen.
- [x] Zeit im Hintergrund abziehen (`visibilitychange`), damit ein Tab-Wechsel nicht als Nachdenken zählt.

## Akzeptanzkriterium
Ein Tab-Wechsel während einer Frage erhöht die gemessene Zeit nicht.

## Umsetzung (14.11.2026)
- **Stoppuhr:** `ResponseTimer` (`lib/client/response-timer.ts`, reine Klasse, mit Testuhr geprüft) und `useResponseTimer` (`lib/client/use-response-timer.ts`). `show(frage)` beim Anzeigen, `answer()` im Moment der Antwort. Die Zeit steht, solange die Seite im Hintergrund ist (`visibilitychange`, auch wenn die Seite schon im Hintergrund startet). Beim Zurückblättern addieren sich die Zeiten einer Frage, bei geänderter Antwort gilt der Zeitpunkt der letzten.
- **Wo gemessen wird:** Tages-Session (`StudySession.tsx`), Lektionstest und Kapitel-Quiz (`SectionQuiz.tsx`), Prüfung (`ExamSession.tsx`). Gemessen wird bis zur Wahl der Antwort, **nicht** bis zur Sicherheitsabfrage: `QuizQuestionCard` und `FormatQuestionCard` melden die Wahl jetzt vorab (`onSelected`).
- **Nutzlast:** Das Feld heißt `responseTimeMs` (ganze Millisekunden, roh) und steht je Antwort in Abgabe, Notausstieg, Pause-Zwischenstand, Prüfung und im Sync-Ereignis (die Warteschlange übernimmt die Antworten unverändert). Fehlt die Zeit, fehlt das Feld. Beim Fortsetzen einer pausierten Session liest der Client ein gespeichertes `responseTimeMs` wieder ein.
- **Tests:** `lib/client/response-timer.test.ts` (Tab-Wechsel zählt nicht, mehrfacher Wechsel, Start im Hintergrund, Zurückblättern, geänderte Antwort); `e2e/response-time.spec.ts` (echte Tages-Session: 0,8 s nachdenken, 5 s im Hintergrund, antworten; die Pause-Anfrage enthält eine Zeit unter 4 s, aber über 0,9 s). Neuer E2E-Nutzer `responseTimer`.
- **Für 06b (Server):** Der Server nimmt das Feld noch nicht an. Die Schemas in `lib/server/http/attempt-body.ts` (Aufgabe 04a) verwerfen unbekannte Felder, `responseTimeMs` kommt also online noch nicht an. Dort ergänzen (`z.number().int().min(0).optional()`), in `StudySessionAnswerInput`, `SectionQuizAnswerInput` und `parseExamAttemptInput` aufnehmen und beim Pausieren (`StudySessionDraft`) mitspeichern. Die Grenzen 300 ms und 10 Minuten setzt der Server (06b), der Client liefert Rohwerte.
- **Für 06c:** Der Offline-Leser nutzt dieselben Komponenten (`SectionQuiz`, `StudySession` mit `offline`), die Zeit steht also schon in der Warteschlange. Offen ist, dass der Sync-Pfad sie auswertet.
