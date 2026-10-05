# Überwachung per E-Mail

`scripts/monitor.sh` prüft die Plattform alle 5 Minuten und schickt eine Mail, wenn etwas nicht stimmt
und wenn es wieder in Ordnung ist. Es läuft **auf dem Server der App**, aber unabhängig von der App
selbst: der Versand geht direkt über SMTP (`curl`), also auch dann, wenn die App ausgefallen ist.
Ein späteres Monitoring-Werkzeug auf einem eigenen Server kann das ersetzen oder ergänzen.

| Prüfung | Alarm, wenn |
|---|---|
| `ready` | `http://127.0.0.1:3000/api/ready` nicht 200 antwortet (000 = App nicht erreichbar, 503 = Datenbank nicht erreichbar) |
| `containers` | einer von `learning-app`, `learning-postgres` nicht läuft |
| `backup` | das letzte erfolgreiche Backup älter als 26 Stunden ist oder fehlt (`scripts/backup.sh` fasst nach Erfolg `backups/.last-success` an) |
| `disk` | die Platte zu mehr als 85 % voll ist |

Verhalten: Erst die **zweite** Prüfung in Folge, die fehlschlägt, löst die Mail „PROBLEM“ aus (kurze
Aussetzer, z. B. beim Neustart nach einem Update, bleiben still). Danach kommt keine weitere Mail, bis
es behoben ist („BEHOBEN“). Besteht ein Problem länger als 24 Stunden, kommt eine Erinnerung
(„WEITERHIN“). Scheitert der Versand, wird der Alarm bei der nächsten Prüfung erneut versucht.

## Einrichtung

1. **Absender:** Dieselben SMTP-Zugangsdaten wie für die App ([EMAIL.md](EMAIL.md), zunächst Gmail mit
   App-Passwort). Die Werte `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASSWORD`,
   `MAIL_FROM` stehen schon in der `.env` der App; das Skript liest sie dort. Fehlt der Versand dort noch,
   gehören sie in die `.env` oder in `/etc/learning-monitor.env`.
2. **Empfänger:** `MONITOR_MAIL_TO=admin@example.com` (mehrere mit Komma) in `/etc/learning-monitor.env`
   (`chmod 600`). Am besten eine Adresse, die nicht auf demselben Server liegt und auf dem Handy ankommt.
3. **Testmail:** `scripts/monitor.sh --test-mail` im Projektordner. Kommt sie an, passen Zugangsdaten,
   Host und Empfänger.
4. **Zeitgeber installieren** (Pfad `/opt/learning` in der `.service` anpassen):
   ```bash
   sudo cp deploy/learning-monitor.service deploy/learning-monitor.timer /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now learning-monitor.timer
   systemctl list-timers learning-monitor.timer
   journalctl -u learning-monitor.service -n 20     # Ausgabe der letzten Prüfungen
   ```
   Der Benutzer, unter dem der Dienst läuft, muss `docker inspect` dürfen (root oder Gruppe `docker`).
5. **Probe:** `docker stop learning-app`, nach etwa 10 Minuten kommt die Mail „PROBLEM: ready“ und
   „PROBLEM: containers“, nach `docker start learning-app` jeweils „BEHOBEN“.

## Einstellungen (optional, als Umgebungsvariable oder in der `.env`)

| Variable | Standard | Bedeutung |
|---|---|---|
| `MONITOR_URL` | `http://127.0.0.1:3000` | Adresse der App |
| `MONITOR_CONTAINERS` | `learning-app learning-postgres` | zu prüfende Container, leer = nicht prüfen |
| `MONITOR_BACKUP_CHECK` | `1` | `0` schaltet die Backup-Prüfung ab (z. B. solange noch kein Backup läuft) |
| `BACKUP_DIR` | `./backups` | wo `backup.sh` den Marker ablegt |
| `MONITOR_BACKUP_MAX_HOURS` | `26` | Höchstalter des Backups |
| `MONITOR_DISK_MAX_PERCENT` | `85` | Grenze der Plattenbelegung |
| `MONITOR_FAILS_BEFORE_ALARM` | `2` | Fehlschläge in Folge bis zur Mail |
| `MONITOR_REMIND_HOURS` | `24` | Abstand der Erinnerungen |
| `MONITOR_STATE_DIR` | `./.monitor-state` | Merkdateien je Prüfung |
| `MAIL_SMTP_SECURE` | nur Port 465 | `1` implizites TLS auch auf anderem Port, `0` STARTTLS |

## Grenzen

- **Ein Server prüft sich selbst.** Fällt er komplett aus (Strom, Netz, Hoster), kommt keine Mail. Dafür
  braucht es eine Prüfung von außen: ein kostenloser Uptime-Dienst auf die öffentliche Adresse oder das
  spätere Monitoring auf dem zweiten Server.
- **Gmail** hat ein Tageslimit und gehört nicht in den Kundenbetrieb (siehe EMAIL.md). Für Alarme an
  den Betreiber reicht es.
- **Kein Fehler-Tracking:** Stacktraces der App stehen nur im Docker-Log (`docker compose logs app`).
- Keine Serverwerte außer Platte (CPU, RAM, Last).
