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
- [ ] 5.1 und 5.2 zuerst, hinter dem Flag `self_reports`, mit Kontrollgruppe (`FEATURE_SELF_REPORTS_ROLLOUT=50`).
- [ ] 5.3 an den Prüfungsplan anbinden.
- [ ] 5.4 an den Kursstart anbinden.
- [ ] 5.6 an den Check-in anbinden.

## Akzeptanzkriterium
Mit eingeschaltetem Flag bleibt die Abbruchquote der Sessions gegenüber der Kontrollgruppe gleich (beschreibend, `docs/MESSEN.md`).
