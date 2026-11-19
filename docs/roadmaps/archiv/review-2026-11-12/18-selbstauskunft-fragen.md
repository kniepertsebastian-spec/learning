# Aufgabe 18: Die einzelnen Selbstauskunft-Fragen

**Herkunft:** Phase 5 „Menschliche Faktoren, Stufe 2“ der Review-Roadmap, Faktoren 5.1 bis 5.6
**Voraussetzung:** Aufgabe 17
**Priorität:** 5.1 und 5.2 zuerst, die übrigen nach Bedarf

## Fragen
| Nr. | Faktor | Frage | Was die App damit tut |
|---|---|---|---|
| 5.1 | Empfundene Anstrengung | Nach einer Lektion: „Wie anstrengend war das?“ (5 Stufen) | Zusammen mit dem Ergebnis: hoher Aufwand bei schwachem Ergebnis löst Hilfe aus, niedriger Aufwand bei gutem Ergebnis verkürzt |
| 5.2 | Vorhersage des eigenen Behaltens | Nach einer Lektion: „Wie viel davon weißt du in einer Woche noch?“ | Vergleich mit dem Rückblick (`recall_checks`), zeigt Selbstüberschätzung auf Lektionsebene |
| 5.3 | Zuversicht für die Prüfung | Wöchentlich bei gesetztem Termin: „Wie sicher bestehst du?“ | Vergleich mit dem Bereitschaftswert, bei großer Abweichung Probeprüfung vorschlagen |
| 5.4 | Grund fürs Lernen | Einmal je Kurs: Pflicht, Stelle, Wechsel, Interesse | Ton der Erinnerungen, Auswertung von Abbruch je Grund |
| 5.5 | Nutzen für die Arbeit | Nach einer Lektion, selten: „Brauchst du das in deiner Arbeit?“ | Reihenfolge der Lektionen, Rückmeldung an Autoren |
| 5.6 | Lernumgebung | Im Check-in, ein Tipp: ruhig, unterwegs, bei der Arbeit | Format wählen (unterwegs: nur Wiederholungen) |

## Aufgaben
- [x] 5.1 und 5.2 zuerst, hinter dem Flag `self_reports`, mit Kontrollgruppe (`FEATURE_SELF_REPORTS_ROLLOUT=50`).
- [x] 5.3 an den Prüfungsplan anbinden.
- [x] 5.4 an den Kursstart anbinden.
- [x] 5.6 an den Check-in anbinden.

## Akzeptanzkriterium
Mit eingeschaltetem Flag bleibt die Abbruchquote der Sessions gegenüber der Kontrollgruppe gleich (beschreibend, `docs/MESSEN.md`).

## Umsetzung (14.11.2026)
- **Wann welche Frage dran ist:** `lib/server/self-reports/ask.ts` (`nextSelfReportQuestion`) baut auf `canAskSelfReport` aus 17 auf (Flag, Schalter je Art, 30 Tage Pause, eine Frage je Sitzung) und ergänzt die Regeln je Ort (Tabelle in `docs/MESSEN.md`). Schnittstelle `GET /api/self-reports/next?context=lesson|course&refId=…`; der Check-in (5.6) wird beim Aufbau der Kursseite entschieden.
- **5.1 und 5.2:** `components/SelfReportPrompt.tsx` nach dem Abschluss einer Lektion ohne Test (`SectionContent`) und im Ergebnis des Lektionstests (`SectionQuiz`, nicht im Kapitel-Quiz, nicht offline). Im Wechsel, je Lektion einmal, höchstens eine Frage am Tag. **Hinweis:** Die Grundlage aus 17 begrenzt nur „eine Frage je Lernsitzung“. Lektionen werden aber außerhalb der Sitzungs-Seite gelesen und kennen keine Sitzung, deshalb gilt dort die Tagesgrenze.
- **5.4 und 5.3:** auf der Kursseite (`app/cert/[id]/page.tsx`): 5.4 einmal je Kurs, solange noch keine Lektion abgeschlossen ist; sonst 5.3 wöchentlich, solange ein Prüfungstermin in der Zukunft liegt (`exam_plans`).
- **5.6:** im Check-in der Sitzung (`StartSessionPicker`, nur wenn der Check-in angeboten wird): „Wo lernst du heute? (freiwillig)“ mit ruhig, unterwegs, bei der Arbeit. Gespeichert beim Start der Sitzung, mit der Sitzung als Bezug; ohne Wahl zählt die gezeigte Frage als übersprungen.
- **Bewusst nicht gebaut:** 5.5 (nicht in der Aufgabenliste von 18) und alle **Eingriffe** („Was die App damit tut“: Hilfe bei hoher Anstrengung, Kürzen, Probeprüfung, Format „unterwegs“). Sie kommen erst nach der Auswertung; sonst würde die Kontrollgruppe das Verhalten verändern, das gemessen werden soll.
- **Abnahme (Abbruchquote bleibt gleich):** messbar, nicht von mir festgestellt: es gibt noch keine Echtdaten. `psrp:metrics` enthält `selfReports.arms` und `engagement.byFlag.self_reports` mit und ohne Flag (Hypothese H10, Vorgehen in `docs/MESSEN.md`). Ausgangswert vor dem Einschalten festhalten.
- **Auswertung:** `lib/server/psrp/self-report-metrics.ts` (gefragt, beantwortet, übersprungen je Art; 5.2 gegen den Rückblick; 5.1 gegen den ersten Test; Gründe), im Export als `selfReports`.
- **Datenschutzerklärung:** Eintrag „Freiwillige Selbstauskünfte“ angepasst (5.5 wird nicht gefragt, die Antworten ändern bisher nichts am Plan).
- **Tests:** `lib/server/self-reports/ask.db.test.ts` (Wechsel, einmal je Lektion, Tagesgrenze, abgeschaltete und pausierte Art, Kontrollgruppe, 5.4 und 5.3, 5.6, Schnittstelle), `lib/server/psrp/self-report-metrics.test.ts`, `components/quiz/quiz-components.test.tsx` (Zeile im Check-in), `e2e/self-reports.spec.ts` (Kursseite: beantworten, danach nicht noch einmal; Lektion: Frage erst nach dem Abschluss, einmal je Lektion).
