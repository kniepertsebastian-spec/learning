# Pflichtschulungen: Betrieb

Pflichtregeln legt der Firmen-Admin im Firmenbereich an (Reiter „Zuweisungen“, Abschnitt „Pflichtschulungen“). Erinnerungen
und Eskalation verschickt ein **täglicher Lauf**, den die App nicht selbst auslöst (es gibt keinen eingebauten Zeitgeber).

## Täglicher Lauf einrichten

Der Lauf braucht den Mailversand (`MAIL_*`, `APP_BASE_URL`, siehe `docs/EMAIL.md`). Ohne Versand tut er nichts und sagt es.

```bash
# einmal von Hand ausprobieren
docker compose exec -T app npm run mandatory:run

# täglich um 07:05 (Server-Cron, `crontab -e` als der Benutzer, der Docker nutzt)
5 7 * * * cd /home/basti/learning && docker compose exec -T app npm run mandatory:run >> /home/basti/mandatory-run.log 2>&1
```

Der Lauf ist wiederholbar: je Zuweisung und Art (Erinnerung, „überfällig“, Eskalation) geht höchstens eine Mail raus.
Schlägt der Versand fehl, wird nichts als „gesendet“ vermerkt und der nächste Lauf versucht es erneut.

## Was passiert wann

| Zeitpunkt | Wer bekommt was |
|---|---|
| Regel angelegt | alle vorhandenen Mitglieder der gewählten Rollen bekommen den Lernpfad mit Frist (keine Mail) |
| Neues Mitglied nimmt eine Einladung an | die Regeln der Firma für seine Rolle greifen sofort |
| X Tage vor der Frist (Standard 7) | Erinnerung an die Person |
| Frist abgelaufen | „Frist abgelaufen“ an die Person |
| Y Tage nach der Frist (Standard 3) | eine Sammelmail je Firma an Mentoren und Firmen-Admins (Person, Lernpfad, Frist, nie Lerndaten) |

Erinnerung und „überfällig“ gelten auch für manuell zugewiesene Lernpfade mit Frist (mit den Standardwerten).
Abgeschlossene Zuweisungen bekommen nie Mails. Löscht der Firmen-Admin eine Regel, bleiben alle Zuweisungen bestehen.

## Abteilungen

Im Reiter „Team“ legt der Firmen-Admin Abteilungen an (z. B. „Operations“) und ordnet jedes Mitglied höchstens einer zu.
Eine Pflichtregel gilt für alle Abteilungen (nichts angekreuzt) oder nur für die angekreuzten. Wird eine Abteilung
gelöscht, bleiben ihre Mitglieder ohne Abteilung, und eine Regel nur für diese Abteilung gilt dann für niemanden mehr
(nie für alle).

## Wechsel von Rolle oder Abteilung

Jede Regel hat die Wahl „Auch zuweisen, wenn jemand Rolle oder Abteilung wechselt“ (Standard: ja). Bei „nein“ greift die
Regel nur beim Anlegen und beim Beitritt. Abteilungswechsel im Firmenbereich lösen das sofort aus. Rollenwechsel gibt es
nur über das Betreiber-Skript (`company:set-member`), das ebenfalls die Regeln nachzieht.

## Wiederholung (neue Runde)

Eine Regel kann festlegen, dass 6, 12, 24 oder 36 Monate nach dem Abschluss eine neue Runde beginnt. **Der Status wird dann
zurückgesetzt**: „abgeschlossen“ wird wieder „zugewiesen“, es gibt eine neue Frist und neue Erinnerungen, der letzte
Abschluss bleibt vermerkt (`last_completed_at`). Beim Anlegen muss der Firmen-Admin diese Warnung ausdrücklich bestätigen.

Als abgeschlossen zählt in der neuen Runde nur, was nach dem Beginn der Runde nachgewiesen wird:
- Lernpfade ohne Lektionstests: jede Lektion erneut als durchgearbeitet markieren,
- Lernpfade mit Lektionstests: jedes Lernziel erneut üben und weiterhin als beherrscht abschließen.
Der Fortschritt aus früheren Runden bleibt gespeichert, zählt aber nicht mehr. Die neue Runde beginnt im täglichen Lauf
(auch ohne Mailversand); die Person bekommt dann „Wiederholung fällig“.

## Kurse aus unserem Katalog

Eine Pflicht lässt sich auch für einen freigegebenen Katalogkurs anlegen, den die Firma noch nicht nutzen darf (z. B. „Security
Updates“). Die Regel steht dann auf „Wartet auf Freischaltung“, weist niemandem etwas zu und fragt die Freischaltung bei uns an.
Sobald wir die Anfrage freigeben, wird die Regel aktiv und weist den passenden Mitgliedern zu (mit Frist ab dem Zeitpunkt der Freigabe).

## Bewusst nicht enthalten

- Mehrere Abschlüsse als Historie: bewahrt wird nur der letzte Abschluss der vorherigen Runde.
- Praxisaufgaben sind nicht je Runde, eine bestätigte Aufgabe bleibt bestätigt.
- Eine Änderung einer bestehenden Regel (z. B. Frist): Regel löschen und neu anlegen; bestehende Zuweisungen bleiben.
