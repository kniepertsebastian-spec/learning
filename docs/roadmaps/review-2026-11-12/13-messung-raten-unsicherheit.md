# Aufgabe 13: Messung von Raten und Unsicherheit

**Herkunft:** Phase 4 „Menschliche Faktoren, Stufe 1“ der Review-Roadmap, Faktoren 4.2 und 4.6
**Voraussetzung:** Aufgabe 06 (Antwortzeit)
**Priorität:** ab den ersten Echtdaten

## Faktoren
| Nr. | Faktor | Messung | Was die App damit tut |
|---|---|---|---|
| 4.2 | Raten und Durchklicken | Antwort schneller als ein Bruchteil der Basiszeit der Frage, gehäuft | Zählt als Signal der Frühwarnung. Die Antwort geht mit geringerem Gewicht in die Auswertung ein, nicht in FSRS |
| 4.6 | Unsicherheit ohne Selbstauskunft | Geänderte Antwort vor dem Absenden, Zeit zwischen erster Auswahl und Absenden | Ergänzt die Kalibrierung für Personen, die die Sicherheitsangabe ausgeschaltet haben |

## Umsetzung
- [ ] 4.2: nur Auswertung der Antwortzeit gegen die Basiszeit je Frage. Der Bruchteil (Vorschlag: ein Drittel) wird vorab festgelegt und in `docs/MESSEN.md` eingetragen.
- [ ] 4.6: Feld `changedAnswer` je Antwort im Client erfassen, an `quiz_answers` bzw. `study_session_items` speichern.
- [ ] Gewichtung für 4.2 nur nach Entscheidung des Betreibers einschalten (Feature-Flag).

## Akzeptanzkriterium
Der Schwellenwert für Durchklicken steht in `docs/MESSEN.md`. `changedAnswer` ist für neue Antworten gefüllt.

## Hinweis (eigene Einschätzung)
Die Grenze für „zu schnell“ hängt von der Basiszeit ab, die erst nach einigen Wochen stabil ist. Vor dieser Phase keine Gewichtung einschalten.
