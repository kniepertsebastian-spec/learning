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

## Bewusst nicht enthalten

- **Wiederholung** (z. B. jährlich erneut): „abgeschlossen“ heißt „jedes Lernziel beherrscht“. Eine neue Runde bräuchte
  Nachweise je Runde; sonst wäre sie sofort wieder abgeschlossen. Das ist eine eigene Entscheidung.
- **Abteilungen**: es gibt nur Rollen (Firmen-Admin, Mentor, Lernender). Eine Abteilung als Gruppierung gibt es noch nicht.
- Änderung der Rolle eines bestehenden Mitglieds löst die Regeln nicht aus (nur Beitritt und Anlegen der Regel).
