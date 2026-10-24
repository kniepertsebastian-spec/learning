# Messen: Ausgangswerte vor Zielen

Dieses Dokument beschreibt, wie man die Wirkung der Lern- und Motivationsmechaniken beschreibend misst (`roadmap_motivation.md`, Phase 10). Es geht um **Ausgangswerte zuerst, Ziele erst danach**. Die Nutzerzahlen sind anfangs klein; alles hier ist ein beschreibender Bericht, keine automatische Auswertung und keine Signifikanzprüfung.

## Was gemessen wird
Aus dem anonymisierten Metrik-Export (`npm run psrp:metrics`, Salt in `PSRP_EXPORT_SALT`):

| Kennzahl | Bedeutung |
|---|---|
| `churn7`, `churn30` | Anteil der Personen, die 7 bzw. 30 Tage nach dem Start keine abgeschlossene Session mehr hatten (nur Personen, die lange genug dabei sind) |
| `returnAfterPause` | Von den Pausen (mindestens 7 Tage ohne Session) die Quote, nach der die Person zurückkam |
| `courseCompletion` | Kurse mit begonnener Lernreihe, die vollständig abgeschlossen wurden |
| `exitShare`, `deescalationShare` | Anteil der Personen, die den Notausstieg bzw. eine Entlastung erlebt haben |
| `retention.<flag>` | Behaltensquote der Reviews (Rating über „nochmal“), mit und ohne Flag |

Jede Kennzahl gibt es gesamt, je Evaluationsgruppe und **je Feature-Flag mit und ohne** (`flag.<name>.enabled|disabled.…`). Der Nenner `n` steht immer dabei: Zeilen mit weniger als 20 sind als „klein“ markiert, sie sind nur anzusehen, nicht zu deuten.

## Ablauf
1. **Ausgangswert festhalten, bevor eine Mechanik eingeschaltet wird oder eine Kontrollgruppe startet:**
   `npm run psrp:baseline -- save "Vor dem Pilot"`
   Die Momentaufnahme (Tabelle `metric_snapshots`) enthält nur Aggregate, keine Personen, dazu die Flag-Anteile zu diesem Zeitpunkt und die Größe der Datenbasis.
2. **Kontrollgruppe schaffen, wenn man eine Mechanik prüfen will.** Alle Flags sind standardmäßig für alle an. `FEATURE_<NAME>_ROLLOUT=50` (0 bis 100) gibt nur der Hälfte der Personen die Mechanik, stabil je Person (Hash aus Nutzer-ID); `FEATURE_<NAME>=0` schaltet hart ab. Flags: `pretest_questions`, `recall_check`, `understanding_mode`, `dropout_guard`, `exit_with_win`, `energy_modes`, `reactivation`, `woven_reviews`. Ohne Kontrollgruppe fehlt die Seite „disabled“, dann bleibt nur der Vorher-Nachher-Vergleich.
3. **Später vergleichen:**
   `npm run psrp:baseline -- compare latest` (letzte Momentaufnahme gegen jetzt) oder `compare <id-a> <id-b>`; `list` zeigt alle Momentaufnahmen.
4. **Ziele festlegen**, erst nachdem Ausgangswerte vorliegen und genug Personen dabei sind (Richtwert: mindestens 20 im Nenner der jeweiligen Kennzahl). Ziele gehören in diesen Abschnitt, mit Datum.

## Wichtig beim Testen
- Der Export und die Kennzahlen berücksichtigen nur Personen mit einer **Evaluationsgruppe**. Sie wird bei der Registrierung bzw. beim ersten Zugriff zufällig vergeben: `vanilla` (FSRS pur, ohne Planungsschicht), `planning`, `planning_state` (zusätzlich Tagesform). Wer selbst alle Mechaniken erleben will, sollte nicht in `vanilla` sein.
- Eigene Testkonten verzerren die Zahlen. Vor dem Pilot die Ausgangswerte mit einer Bezeichnung wie „Nur Testkonten“ festhalten und später nur gegen Echtdaten vergleichen.
- Eine einzelne Momentaufnahme ist noch kein Vergleich. Wer lernt, erzeugt die ersten Daten; der Ausgangswert ist dann der Stand **vor** der Einführung für die Pilotgruppe.

## Hypothesen für den Pilot
Das sind **Annahmen, keine Zusagen** und keine Zielwerte. Sie werden mit den Ausgangswerten geprüft und erst danach zu Zielen mit Zahlen.

| Nr. | Annahme | Gemessen mit | Vergleich |
|---|---|---|---|
| H1 | Mit Entlastung (`dropout_guard`) und Notausstieg (`exit_with_win`) brechen weniger Personen nach 7 Tagen ab | `churn7` | mit/ohne Flag, bzw. vor/nach |
| H2 | Mit Reaktivierung (`reactivation`) kommen mehr Personen nach einer Pause zurück | `returnAfterPause` | mit/ohne Flag |
| H3 | Mit „Ich hänge fest“ steigen die Hilfeanfragen, ohne dass die Mentorenzeit steigt | Anfragen und Antwortzeit je Firma (Firmenbereich, ab Mindestgröße) | vor/nach |

Zu H3: Die Kennzahl liegt im Firmenbereich (anonym, aggregiert, erst ab Mindestgröße) und ist nicht Teil dieses Exports.

## Grenzen
- Reaktivierung per Push gibt es nicht, nur per E-Mail (siehe Web Push in `umsetzungsplan.md`, Stufe 5).
- Kleine Stichproben: Veränderungen von wenigen Prozentpunkten bei n unter 20 sind Rauschen.
- Die Auswertung ändert nichts automatisch. Entscheidungen trifft man aus dem Bericht.
