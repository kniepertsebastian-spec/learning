# Aufgabe 12: Messung von Ermüdung und Unterbrechungen

**Herkunft:** Phase 4 „Menschliche Faktoren, Stufe 1“ der Review-Roadmap, Faktoren 4.1 und 4.3
**Voraussetzung:** Aufgabe 06 (Antwortzeit)
**Priorität:** ab den ersten Echtdaten

## Faktoren
| Nr. | Faktor | Messung | Was die App damit tut |
|---|---|---|---|
| 4.1 | Ermüdung in der Session | Fehlerquote und Antwortzeit nach Position in der Session (erstes, zweites, drittes Drittel) | Persönliche Session-Länge vorschlagen, schwere Fragen nach vorn |
| 4.3 | Unterbrechungen | Zahl und Dauer der Wechsel in den Hintergrund während einer Session | Kürzere Sessions anbieten, Tageszeit mit wenigen Unterbrechungen empfehlen |

## Umsetzung
- [x] 4.1: nur Auswertung vorhandener Daten (Antwortzeit aus Aufgabe 06, Position in der Session). In `psrp:metrics` als beschreibender Wert aufnehmen, mit Nenner.
- [x] 4.3: Feld `interruptions` je Session (Zahl und Dauer) im Client erfassen, an `study_sessions` speichern.
- [x] Die Zahlen für die Person nur als Aussage in ganzen Sätzen zeigen („Nach etwa 12 Fragen machst du mehr Fehler“).

## Akzeptanzkriterium
Für eine Person mit 200 Reviews liefert `psrp:metrics` die Werte aus 4.1 mit Nenner. Die Unterbrechungszahl ist je Session gespeichert.

## Hinweis
Eine persönliche Session-Länge darf erst eingeführt werden, wenn sie eine Hypothese in `docs/MESSEN.md` hat (Phase 6).

## Umsetzung (14.11.2026)
- **4.1 Ermüdung:** `lib/server/psrp/fatigue.ts` (reine Berechnung) und `fatigue-db.ts`. Abgeschlossene Sitzungen ab drei Antworten werden nach der Reihenfolge der Aufgaben in Drittel geteilt; je Drittel Fehlerquote (`errors` mit Nenner) und Median der Antwortzeit (`timed` als Nenner). Die Antwortzeit kommt aus `review_log` (Aufgabe 06b) über Sitzung und Frage. Neuer Abschnitt `fatigue` in `psrp:metrics`, gesamt und je Evaluationsgruppe.
- **4.3 Unterbrechungen:** Der Client zählt Wechsel in den Hintergrund ab 2 Sekunden (`lib/client/interruption-counter.ts`, `useInterruptionCounter`) und schickt `interruptions: { count, totalMs }` beim Abschluss, beim Notausstieg, bei „Pause für heute“ und über die Sync-Warteschlange. Gespeichert in `study_sessions.interruption_count` und `interruption_ms` (Migration `0120_session_interruptions`), nur bei eingeschaltetem Flag `interruptions`. Der Server prüft die Werte (`lib/interruptions.ts`); ein unbrauchbarer Wert entfällt, die Abgabe zählt trotzdem.
- **Für die Person:** „Wie ich lerne“ zeigt höchstens drei Sätze (mehr Fehler nach etwa N Fragen, gegen Ende langsamer, oft unterbrochen), nur ab den Schwellen in `docs/MESSEN.md`. Ohne genug Daten erscheint nichts.
- **Hypothesen:** H10 bis H12 in `docs/MESSEN.md`. Eine persönliche Sitzungslänge ist nicht gebaut.
- **Datenexport und Datenschutzerklärung:** die neuen Spalten stehen in `learning.studySessions`; der Eintrag „Wiederholungsplanung und Lernsitzungen“ nennt sie.
- **Tests:** `fatigue.test.ts`, `fatigue.db.test.ts` (Akzeptanz mit 200 Reviews, Route, Pause, Sync, Flag aus), `interruption-counter.test.ts`.
