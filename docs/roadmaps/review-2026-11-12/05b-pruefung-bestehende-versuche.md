# Aufgabe 05b: Bestehende Prüfungsversuche prüfen

**Herkunft:** Folgeaufgabe zu 05a
**Voraussetzung:** Aufgabe 05a (Fix ist ausgeliefert)
**Priorität:** vor dem Pilot. Die Entscheidung über Korrekturen trifft der Betreiber.

## Problem
Versuche, die vor dem Fix bestanden wurden, können auf manipulierten Antworten beruhen. Sie wirken weiter auf Statistik und Skills.

## Aufgaben
- [x] Abfrage: Abschlüsse, bei denen die Zahl der Antworten kleiner war als die Zahl der Prüfungsfragen.
- [x] Betroffene Einträge in der Abschlussstatistik und bei den Skills auflisten. Nur Anzahl und Zeitraum im Bericht, keine Namen.
- [ ] Entscheidung des Betreibers einholen: korrigieren, markieren oder belassen.

## Akzeptanzkriterium
Es gibt eine Liste der betroffenen Versuche mit Anzahl. Der Betreiber hat entschieden, und die Entscheidung steht in dieser Datei.

## Umsetzung (14.11.2026)
- **Abfrage:** `npm run exams:audit-attempts` (`scripts/exam-attempts-audit.ts`, Logik in `lib/server/exam/attempt-audit.ts`). Liest nur und gibt nur Anzahlen und Zeiträume aus, keine Personen.
- **Nachgerechnet** wird wie seit 05a: richtige Antworten auf Fragen dieser Prüfung (jede Frage einmal) geteilt durch alle Prüfungsfragen. Geprüft werden alle Versuche, die als bestanden gelten (`passed` oder ältere ohne `passed` mit Score über der Grenze, wie in `recordFinalExamPass`).
- **Ausgabe:**
  - Versuche mit weniger gültigen Antworten als Prüfungsfragen (Kriterium dieser Aufgabe; erfasst auch fremde und doppelte Frage-IDs)
  - Versuche, die nachgerechnet unter der Bestehensgrenze liegen (verdächtig)
  - Versuche ohne gespeicherte Antworten (vor R3, nicht nachrechenbar, getrennt gezählt)
  - Anzahl Personen
  - wahrscheinlich betroffene Zeilen der Abschlussstatistik: verdächtige Versuche, die das erste Bestehen der Person im Kurs waren. `course_completion_events` ist anonym, die Zuordnung ist deshalb eine Schätzung.
  - wahrscheinlich betroffene Kurs-Skills: Kurs nur mit verdächtigen Versuchen bestanden, keine Bescheinigung zum Kurs
- **Test:** `lib/server/exam/attempt-audit.db.test.ts`.

## Ergebnis auf Produktion
_Noch nicht ausgeführt._ Der Betreiber führt `npm run exams:audit-attempts` auf dem Server aus (wie die anderen Skripte, siehe `docs/DEPLOY-UPDATE.md`) und trägt die Ausgabe hier ein.

## Entscheidung des Betreibers
_Offen._ Optionen:
1. **Korrigieren:** verdächtige Versuche auf nicht bestanden setzen, die geschätzten Statistikzeilen entfernen, betroffene Kurs-Skills löschen. Braucht ein eigenes Skript mit Trockenlauf.
2. **Markieren:** Versuche behalten, aber aus Statistik und Skill-Vergabe herausnehmen (neue Spalte oder Liste).
3. **Belassen:** bei null oder sehr wenigen Treffern, etwa wenn nur Testkonten betroffen sind.
