# Aufgabe 16: Messung von Lesetiefe, Durchhalten und Gerät

**Herkunft:** Phase 4 „Menschliche Faktoren, Stufe 1“ der Review-Roadmap, Faktoren 4.9, 4.10 und 4.12
**Voraussetzung:** keine für 4.9 (`LearningTimeTracker`), 4.10 und 4.12 nur Auswertung
**Priorität:** ab den ersten Echtdaten

## Faktoren
| Nr. | Faktor | Messung | Was die App damit tut |
|---|---|---|---|
| 4.9 | Lesetiefe | Lesezeit je Lektion im Verhältnis zur Wortzahl, erneutes Öffnen | Hinweis vor dem Lektionstest, wenn kaum gelesen wurde. Auswertung: Lesezeit gegen Testergebnis |
| 4.10 | Durchhalten nach Fehlern | Verhalten nach drei Fehlern in Folge: weiter, Pause, Ausstieg | Leichtere Frage einschieben, bevor der Ausstieg kommt |
| 4.12 | Gerät und Lage | Gerätetyp (schmal, breit), online oder offline, installiert oder Browser | Auswertung je Lage, kurze Formate für das Smartphone bevorzugen |

## Umsetzung
- [ ] 4.9: Lesezeit je Lektion aus `LearningTimeTracker` mit der Lektion als Bezug speichern.
- [ ] 4.10: nur Auswertung der Antwortfolge. Der Eingriff (leichtere Frage) erst nach Auswertung.
- [ ] 4.12: Gerätetyp als grobe Klasse (schmal, breit) an der Session speichern, keine Gerätekennung.

## Akzeptanzkriterium
Lesezeit je Lektion ist gespeichert. Der Gerätetyp ist als grobe Klasse an der Session, nicht als Gerätekennung.

## Hinweis
Der Gerätetyp darf nicht als Kennung gespeichert werden. Die Angabe „schmal oder breit“ genügt für die Auswertung.
