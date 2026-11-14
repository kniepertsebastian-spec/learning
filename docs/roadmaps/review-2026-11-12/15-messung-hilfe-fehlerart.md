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
- [ ] 4.7 und 4.8 aus vorhandenen Tabellen ableiten: `simulation_results.bestHelps`, `selected_option_id`, Aufrufe von `reveal`.
- [ ] Fehlerart nur für Fragen mit mindestens drei Versuchen einordnen, sonst „unbekannt“.
- [ ] Einordnung je Frage und je Konzept in `psrp:metrics` aufnehmen.

## Akzeptanzkriterium
Für jede Frage mit Fehlern ist die Fehlerart einer der drei Klassen oder „unbekannt“. Der Verstehens-Modus wird nur bei „Fehlvorstellung“ eingeschaltet.

## Hinweis (eigene Einschätzung)
Die Abgrenzung zwischen „Lücke“ und „Fehlvorstellung“ ist eine Heuristik. Sie gehört in `docs/MESSEN.md` mit Hypothese, bevor sie eine Mechanik steuert.
