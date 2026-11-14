# Aufgabe 21b: Lint-Warnungen entfernen

**Herkunft:** Phase 7 der Review-Roadmap
**Priorität:** nach Bedarf
**Stand:** `npm run lint` meldet 0 Fehler und 22 Warnungen (ungenutzte Importe und Variablen).

## Aufgaben
- [x] Die 22 Warnungen entfernen.
- [x] Keine neuen Warnungen einführen.

## Akzeptanzkriterium
`npm run lint` meldet keine Warnungen mehr.

## Umsetzung (14.11.2026)
- `npm run lint` meldet jetzt **keine Warnungen mehr** (vorher 22). Keine neuen eingeführt.
- **16 ungenutzte Importe oder Variablen** einfach entfernt (`getCourseGenerationJob`, `questions`, `questionOptions`, `ExamScoringService`, `locale`, `and`, `allObjectiveIds`, `inArray`, `domains`, `FEEDBACK_TONE_PROMPT`, `ne`, `sections` u. a.).
- **Mit Bedacht umgebaut** (Verhalten gleich, Tests grün):
  - `generateRemediationForObjective` (`lib/server/ai/service.ts`): Der Parameter `objectiveDescription` war nie im Prompt. Ich habe ihn samt Aufruf in `lib/server/remediation/service.ts` entfernt, statt den Prompt zu ändern. Soll die Beschreibung des Lernziels in die Wiederholungsinhalte einfließen, ist das eine eigene Entscheidung.
  - `lib/server/company/practice-tasks.ts` und `lib/server/psrp/metrics.ts`: Die Destrukturierung `{ feld: _ungenutzt, ...rest }`, die ein Feld entfernt, meldet auch die Warnung. Statt dessen wird das Feld ausdrücklich entfernt (`delete`) bzw. die Felder des Rückblicks einzeln aufgeführt. Ausgabe unverändert.
  - `lib/server/company/certificates-privacy.test.ts`: Der Komma-Ausdruck `(keys.add(k), collect(x))` ist jetzt eine Schleife mit zwei Anweisungen.
  - `app/api/exams/[certId]/attempts/[attemptId]/route.ts`: Das ungenutzte `await getServerLocale()` entfällt; die Antwort der Route hing nicht davon ab.
- **Dauerhaft absichern:** Die CI zeigt Warnungen nur an, sie bricht nicht ab. Wer das ändern will, kann `eslint --max-warnings=0` in `npm run lint` aufnehmen; das habe ich nicht getan, weil es eine Entscheidung über die Strenge der CI ist.
