# Aufgabe 14: Messung von Aufschieben, Regelmäßigkeit und Schlaf

**Herkunft:** Phase 4 „Menschliche Faktoren, Stufe 1“ der Review-Roadmap, Faktoren 4.4, 4.5 und 4.11
**Voraussetzung:** Aufgabe 06 nur für Teile, sonst keine
**Priorität:** ab den ersten Echtdaten. Alle drei Werte werden zuerst nur ausgewertet, nicht als Eingriff genutzt.

## Faktoren
| Nr. | Faktor | Messung | Was die App damit tut |
|---|---|---|---|
| 4.4 | Aufschieben | Tage zwischen Fälligkeit und tatsächlicher Wiederholung, Häufung kurz vor dem Prüfungstermin | Erinnerungszeit anpassen, Rückstau früher verteilen |
| 4.5 | Regelmäßigkeit | Streuung der Lernzeiten über Tageszeit und Wochentag, geplante gegen tatsächliche Lerntage | Realistisches Wochenziel vorschlagen |
| 4.11 | Schlaf zwischen Lernen und Abruf | Aus den Zeitstempeln: liegt zwischen Lektion und Rückblick eine Nacht? | Auswertung im Rückblick. Empfehlung „abends lernen, morgens abrufen“ nur bei belegtem Effekt |

## Umsetzung
- [ ] 4.4, 4.5, 4.11: nur Auswertung vorhandener Daten (`review_log`, `learning_time`, `recall_checks`). In `psrp:metrics` als beschreibende Werte aufnehmen, mit Nenner.
- [ ] 4.11 nur im Rückblick anzeigen. Keine Empfehlung ohne Hypothese in `docs/MESSEN.md`.

## Akzeptanzkriterium
`psrp:metrics` enthält für 4.4 und 4.5 Werte mit Nenner. Die Empfehlung aus 4.11 ist erst nach einem belegten Effekt sichtbar.

## Hinweis (eigene Einschätzung)
Schlaf wird nicht als eigene Angabe erhoben (Messregel 6). 4.11 leitet nur aus Zeitstempeln ab, ob eine Nacht dazwischen lag.
