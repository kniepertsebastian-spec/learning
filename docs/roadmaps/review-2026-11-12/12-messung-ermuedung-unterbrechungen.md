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
- [ ] 4.1: nur Auswertung vorhandener Daten (Antwortzeit aus Aufgabe 06, Position in der Session). In `psrp:metrics` als beschreibender Wert aufnehmen, mit Nenner.
- [ ] 4.3: Feld `interruptions` je Session (Zahl und Dauer) im Client erfassen, an `study_sessions` speichern.
- [ ] Die Zahlen für die Person nur als Aussage in ganzen Sätzen zeigen („Nach etwa 12 Fragen machst du mehr Fehler“).

## Akzeptanzkriterium
Für eine Person mit 200 Reviews liefert `psrp:metrics` die Werte aus 4.1 mit Nenner. Die Unterbrechungszahl ist je Session gespeichert.

## Hinweis
Eine persönliche Session-Länge darf erst eingeführt werden, wenn sie eine Hypothese in `docs/MESSEN.md` hat (Phase 6).
