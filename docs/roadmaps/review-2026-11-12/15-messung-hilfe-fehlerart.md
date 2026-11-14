# Aufgabe 15: Messung von Hilfe-Verhalten und Fehlerart

**Herkunft:** Phase 4 „Menschliche Faktoren, Stufe 1“ der Review-Roadmap, Faktoren 4.7 und 4.8
**Voraussetzung:** keine. Die Daten liegen in vorhandenen Tabellen.
**Priorität:** ab den ersten Echtdaten

## Faktoren
| Nr. | Faktor | Messung | Was die App damit tut |
|---|---|---|---|
| 4.7 | Hilfe-Verhalten | Tipps, „Antwort zeigen“, „Ich hänge fest“ je Frage und je Konzept, früh oder spät genutzt | Unterscheidet „sucht Hilfe“ von „überspringt“, steuert den Verstehens-Modus |
| 4.8 | Fehlerart | Dieselbe falsche Option wiederholt (Fehlvorstellung) gegen wechselnde falsche Optionen (Lücke) gegen Fehler bei sonst sicherem Stoff mit kurzer Antwortzeit (Flüchtigkeit) | Fehlvorstellung: Begründung der Option zeigen. Lücke: Lektion. Flüchtigkeit: kein Eingriff |

## Umsetzung
- [x] 4.7 und 4.8 aus vorhandenen Tabellen ableiten: `simulation_results.bestHelps`, `selected_option_id`, Aufrufe von `reveal`.
- [x] Fehlerart nur für Fragen mit mindestens drei Versuchen einordnen, sonst „unbekannt“.
- [x] Einordnung je Frage und je Konzept in `psrp:metrics` aufnehmen.

## Akzeptanzkriterium
Für jede Frage mit Fehlern ist die Fehlerart einer der drei Klassen oder „unbekannt“. Der Verstehens-Modus wird nur bei „Fehlvorstellung“ eingeschaltet.

## Hinweis (eigene Einschätzung)
Die Abgrenzung zwischen „Lücke“ und „Fehlvorstellung“ ist eine Heuristik. Sie gehört in `docs/MESSEN.md` mit Hypothese, bevor sie eine Mechanik steuert.

## Umsetzung (14.11.2026)
- **Fehlerart (4.8):** `classifyErrors` in `lib/server/psrp/error-types.ts` ordnet je Person und Frage (Item, Varianten zählen mit) in Fehlvorstellung, Lücke, Flüchtigkeit oder „unbekannt“ ein. Unter drei Versuchen bleibt es „unbekannt“; Fragen ohne Fehler bekommen keine Klasse. Daten: `study_session_items` (Ergebnis, `selected_option_id`, Sicherheit) abgeschlossener Sitzungen, `quiz_answers`, Antwortzeiten aus `review_log` und `quiz_answers`.
- **Hilfe-Verhalten (4.7):** `simulation_results` (`solves`, `last_helps`: Hilfe beim ersten gegen beim wiederholten Lösen), `mentor_requests` („Ich hänge fest“, nur je Person), offen gelassene Fragen in abgeschlossenen Sitzungen und `learning_exit` je Frage. `/reveal` ist die Rückmeldung nach dem Antworten und wird nicht gespeichert; es gibt dafür keine Daten (siehe `docs/MESSEN.md`, Grenzen).
- **Export:** `psrp:metrics` enthält `errorTypes` und `helpBehavior`, je Frage (`human_id`) und je Konzept, je Evaluationsgruppe nur die Summen.
- **Verstehens-Modus:** `detectStruggles` schaltet ein Konzept nur noch ein, wenn zusätzlich eine Frage des Konzepts im Signalfenster als Fehlvorstellung gilt (`hasMisconception`, Flag `error_type_gate`, standardmäßig an, `FEATURE_ERROR_TYPE_GATE=0` stellt das alte Verhalten her).
- **Heuristik und Hypothesen** H15 bis H17 stehen in `docs/MESSEN.md`, Abschnitt „Fehlerart und Hilfe-Verhalten“.
- **Noch offen:** „Lücke: Lektion zeigen“ steuert nichts, bis H16 einen Unterschied zeigt.
- **Tests:** `error-types.test.ts` (Regeln, jede Frage mit Fehlern in genau einer Klasse), `error-types.db.test.ts` (Laden aus der DB), `understanding.db.test.ts` (zwei Versuche lösen nicht aus, Lücke löst nicht aus, ohne Flag schon), `exit.db.test.ts` angepasst.
