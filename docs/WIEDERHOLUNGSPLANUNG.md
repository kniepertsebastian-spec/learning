# Wiederholungsplanung (PSRP-HR): Betrieb

Die Wiederholungen werden mit FSRS geplant (`lib/server/psrp/`, Umsetzungsstand in `roadmap_psrp_hr.md`). Für den Betrieb zählen drei Skripte.

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
