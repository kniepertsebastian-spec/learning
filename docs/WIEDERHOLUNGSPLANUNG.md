# Wiederholungsplanung (PSRP-HR): Betrieb

Die Wiederholungen werden mit FSRS geplant (`lib/server/psrp/`, Umsetzungsstand in `docs/roadmap_psrp_hr.md`). Für den Betrieb zählen drei Skripte.

## Persönliche Parameter fitten (wöchentlich)

Ab 400 Reviews eines Nutzers werden persönliche FSRS-Parameter gefittet, danach höchstens alle 7 Tage neu. Das Skript ist wiederholbar und überspringt Nutzer ohne genug Daten. Es braucht nur die Datenbank (weder Mailversand noch KI-Zugang).

```bash
# einmal von Hand ausprobieren
docker compose exec -T app npm run fsrs:optimize

# wöchentlich, sonntags um 03:20 (Server-Cron, `crontab -e` als der Benutzer, der Docker nutzt)
20 3 * * 0 cd /home/basti/learning && docker compose exec -T app npm run fsrs:optimize >> /home/basti/fsrs-optimize.log 2>&1
```

Die Ausgabe zählt die Nutzer je Ergebnis: `fit`, `recent_fit` (letzter Fit jünger als 7 Tage) oder `too_few_reviews`.

## Konzepte und Abfragevarianten erzeugen (nach Bedarf)

Nach der Generierung eines allgemeinen Kurses läuft das Tagging im Hintergrund (abschaltbar mit `PSRP_TAG_CONCEPTS=0`). Für bestehende Kurse oder nach einem Fehler:

```bash
docker compose exec -T app npm run concepts:tag -- <kurs-slug> [maximal-Lernziele]
```

Braucht `GEMINI_API_KEY` und verursacht KI-Kosten. Bereits getaggte Lernziele werden übersprungen.

## Auswertung

```bash
docker compose exec -T app npm run psrp:metrics        # anonymisierter Export je Evaluationsgruppe (JSON)
docker compose exec -T app npm run psrp:fit-weights    # Vorschlag für die Φ-Gewichte, wird nicht übernommen
npm run psrp:simulate -- 0.75 0.8 0.85 0.9             # Workload-Simulation über 365 Tage
```

Für `psrp:metrics` sollte `PSRP_EXPORT_SALT` gesetzt sein, damit die anonymen Nutzer-Kennungen über Exporte hinweg stabil und nicht rückrechenbar sind.

### Abschnitt `engagement` (Ausgangswerte vor dem Einschalten einer Mechanik)

Beschreibend, gesamt (`all`) und je Evaluationsgruppe (`byGroup`); nur Personen mit mindestens einer abgeschlossenen Session. Jede Rate steht mit Zähler und Nenner, ohne Daten als `null` statt 0.

| Feld | Bedeutung |
| --- | --- |
| `churn7`, `churn30` | Anteil der Personen, die vor mehr als 7 bzw. 30 Tagen begonnen haben und seitdem keine abgeschlossene Session mehr hatten |
| `returnAfterPause` | Pausen von mindestens 7 Tagen: `closed` (Person kam zurück) gegenüber `open` (noch nicht zurück); `rate` = closed / (closed + open) |
| `courseCompletion` | Kurse mit mindestens einer abgeschlossenen Lektion, davon vollständig abgeschlossen |
| `exit` | Anteil der Personen mit Notausstieg „Heute reicht's“ und Nutzungen je 100 Sessions |
| `deescalation` | Anteil der Personen mit mindestens einer entlasteten Session (Frühwarnung) |

Erst den Ausgangswert erfassen, dann eine Mechanik einschalten, dann Ziele festlegen (`roadmap_motivation.md` Phase 10). Bei kleinen Nutzerzahlen sind die Werte nur beschreibend.

## Vergleichsgrafik „Eine Woche Pause“

`npm run psrp:pause-demo` zeigt ohne Nutzerdaten, was nach einer Pause passiert: dieselbe synthetische Person, derselbe Zufall, einmal mit reinem FSRS (wie eine klassische Lernkarten-App: alle fälligen Karten am selben Tag, neue Karten fix pro Tag, kein Tageslimit) und einmal mit der Planungsschicht (Tageslimit aus dem Zeitbudget, Rückstau wird über mehrere Tage abgebaut).

- Ausgabe in `docs/pause-demo/`: `pause-demo.json` (alle Annahmen, Tageswerte und Kennzahlen), `pause-demo.de.svg` und `pause-demo.en.svg` (Minuten pro Tag als zwei Linien, Zeitbudget als gestrichelte Linie, Pause als hinterlegter Bereich, Annahmen in der Fußzeile).
- Standard-Szenario (Platzhalter aus `roadmap_motivation.md`): 1.000 Karten, 10 neue pro Tag, 15 Minuten Zeitbudget, 15 Sekunden je Karte, 60 Tage Vorlauf, 7 Tage Pause, 30 Tage danach, Ziel-Behaltensquote 0,90, Seed 1. Änderbar mit `--pause-days`, `--budget`, `--seconds`, `--seed`, `--out`.
- Kennzahlen je Modus: Last am ersten Tag nach der Pause (Karten und Minuten), Tage bis der Rückstand abgebaut ist, Behaltensquote in den 30 Tagen nach der Pause.
- Reproduzierbar: gleiche Parameter ergeben byte-identische Dateien. Die Ergebnisse sind eine Simulation, keine Messung an echten Lernenden.

## Schwächen in spätere Lektionen einweben (Flag `woven_reviews`)

Im Lektionstest erscheinen bis zu **2 Fragen** (etwa 20 %, bei kleinen Tests mindestens eine) aus **früheren Lektionen**, die gerade fällig oder schwach sind (fällig, oder Abrufwahrscheinlichkeit unter 80 %) und deren Konzept mit der aktuellen Lektion verbunden ist: gemeinsames Konzept, freigegebene Voraussetzung (`concept_prerequisite`, Status `approved`) oder gleiches Themengebiet. Bevorzugt wird eine Variante (Variantenrotation). Auswahl: `lib/server/weaving/candidates.ts`, Regeln: `lib/weaving/rules.ts`.

- Die Fragen sehen aus wie normale Fragen, **zählen aber nicht** für Ergebnis, Punktzahl oder Lernzielstand der aktuellen Lektion (sie werden nicht in `quiz_answer` geschrieben).
- Sie laufen als Review in das Gedächtnismodell: `review_log.review_type = interleaved`, `woven_into_lesson_id` nennt die Lektion, in der sie gestellt wurden; `item_state` wird wie bei jedem Review aktualisiert.
- Items von Konzepten im **Verstehens-Modus** werden nie eingewoben. Im Offline-Leser wird nicht eingewoben.
- Ausschalten: `FEATURE_WOVEN_REVIEWS=0` oder `FEATURE_WOVEN_REVIEWS_ROLLOUT=<0 bis 100>`. Auswertung: `psrp:metrics` unter `wovenReviews` (Flag-Arm, Zahl eingewebter Reviews und davon richtige).
- Offen: Einbau in Simulationen (`task_item`/`embedded_step`).
