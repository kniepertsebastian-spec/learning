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
- [x] 4.4, 4.5, 4.11: nur Auswertung vorhandener Daten (`review_log`, `learning_time`, `recall_checks`). In `psrp:metrics` als beschreibende Werte aufnehmen, mit Nenner.
- [x] 4.11 nur im Rückblick anzeigen. Keine Empfehlung ohne Hypothese in `docs/MESSEN.md`.

## Akzeptanzkriterium
`psrp:metrics` enthält für 4.4 und 4.5 Werte mit Nenner. Die Empfehlung aus 4.11 ist erst nach einem belegten Effekt sichtbar.

## Hinweis (eigene Einschätzung)
Schlaf wird nicht als eigene Angabe erhoben (Messregel 6). 4.11 leitet nur aus Zeitstempeln ab, ob eine Nacht dazwischen lag.

## Umsetzung (14.11.2026)
- **Code:** `lib/server/psrp/human-factors.ts` (reine Berechnung), `human-factors-db.ts` (Rohdaten, anonymisiert, nur Personen mit Evaluationsgruppe, nur bis zum Stichtag), eingehängt als `humanFactors` in `exportMetrics` (`npm run psrp:metrics`): gesamt und je Gruppe, jeder Wert mit Nenner `n` und `small` unter 20. Definitionen, Grenzen und die Hypothesen H4 bis H6 stehen in `docs/MESSEN.md`. Kein Feature-Flag, weil es nur Auswertung ist und nichts in der App ändert.
- **4.4:** Rückstau zum Stichtag, Anteil später Reviews, Häufung vor dem Prüfungstermin. **Einschränkung:** Die Tage zwischen Fälligkeit und tatsächlicher Wiederholung sind für vergangene Reviews nur eine Näherung (über die Abrufwahrscheinlichkeit), weil der unveränderliche `review_log` die Fälligkeit nicht speichert. Eine exakte Zahl braucht eine neue Spalte und eine Änderung an der Verbuchung; das habe ich nicht angefasst.
- **4.5:** Streuung der Lernstunde, genutzte Wochentage, Wochenziel gegen tatsächliche Lerntage.
- **4.11:** Rückblicke getrennt nach „Nacht dazwischen“ (03:00 Ortszeit liegt dazwischen), nur aus Zeitstempeln und Zeitzone. `sleep.recommendationSupported` bleibt falsch, bis beide Seiten 20 Rückblicke haben und der Unterschied mindestens 10 Prozentpunkte beträgt. Es gibt in diesem Schritt keine Anzeige und keine Empfehlung für Personen.
- **Tests:** `lib/server/psrp/human-factors.test.ts` (Definitionen, Grenzfälle, Zeitzonen, Schwellen der Empfehlung), `lib/server/psrp/human-factors.db.test.ts` (eine Person mit 200 Reviews liefert die Werte zu 4.4 und 4.5 mit Nenner, und sie stehen im Export).
- **Offen für später:** Dass die Person ihre Werte unter „Wie ich lerne“ sieht und im Datenexport bekommt (Messregel 3), gehört zur Anzeige. Die Werte sind aus vorhandenen Daten berechenbar und stehen nicht als eigene Angabe im Export. Beim Anzeigen ist die Datenschutzerklärung (`lib/legal/privacy.ts`) zu prüfen.
