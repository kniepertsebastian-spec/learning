# Monitoring mit Zabbix

Zabbix läuft als eigener Docker-Compose-Stack neben der App (`deploy/zabbix/docker-compose.yml`).
Er prüft, ob die App antwortet, ob die Datenbank erreichbar ist und ob das letzte Backup rechtzeitig
gelaufen ist. Ein Skript legt Host, Prüfpunkte und Alarme an, ihr klickt sie nicht von Hand zusammen.

| Prüfpunkt | Wie | Alarm |
|---|---|---|
| `learning.app.health` | Zabbix ruft `http://app:3000/api/health` ab, Wert = HTTP-Status | 3 Minuten nicht 200 oder keine Daten |
| `learning.app.ready` | dasselbe für `/api/ready` (prüft die Datenbank, sonst 503) | 3 Minuten nicht 200 oder keine Daten |
| Backup | `scripts/backup.sh` fasst nach jedem erfolgreichen Lauf `backups/.last-success` an, der Agent liest den Zeitpunkt | älter als 26 h oder nie gelaufen |

Die App-Prüfungen laufen im Docker-Netz der Lernplattform, der App-Port bleibt also gesperrt.

## Einrichtung

1. **Zugangsdaten:** in `deploy/zabbix/` eine Datei `.env` anlegen (nicht einchecken):
   ```bash
   cd deploy/zabbix
   echo "ZABBIX_DB_PASSWORD=$(openssl rand -hex 24)" > .env && chmod 600 .env
   ```
2. **Starten** (die Lernplattform muss laufen, ihr Netz heißt standardmäßig `learning_default`;
   anderer Ordnername → `LEARNING_NETWORK` in der `.env`):
   ```bash
   docker compose up -d
   ```
3. **Anmelden:** Die Weboberfläche ist nur lokal erreichbar: `ssh -L 8081:127.0.0.1:8081 <server>`, dann
   `http://localhost:8081`. Erstanmeldung `Admin` / `zabbix`. **Sofort das Passwort ändern**
   (Benutzer → Admin → Passwort).
4. **Einrichten lassen** (im Projektordner, mit dem neuen Passwort). Das Skript läuft wie die anderen
   Admin-Skripte im App-Container und erreicht Zabbix über das gemeinsame Docker-Netz:
   ```bash
   docker compose exec -e ZABBIX_URL=http://zabbix-web:8080/api_jsonrpc.php \
     -e ZABBIX_PASSWORD='<neues Passwort>' app npm run monitoring:provision
   ```
   Es legt Gruppe, Host `learning-app`, drei Items und drei Trigger an und ändert bei einem zweiten Lauf
   nichts. (Mit installiertem Node auf dem Host geht auch `ZABBIX_PASSWORD=… npm run monitoring:provision`
   gegen `http://127.0.0.1:8081`.) Voraussetzung: Die App läuft mit dem Stand, der das Skript enthält.
5. **Benachrichtigung einrichten** (das macht das Skript bewusst nicht): Verwaltung → Mediatypen → E-Mail
   (SMTP-Zugang wie in [EMAIL.md](EMAIL.md)), beim Benutzer unter „Medien“ die Adresse eintragen,
   Alarme → Aktionen → Trigger-Aktionen → neue Aktion „Alle Alarme senden“ mit Operation „Nachricht
   senden“.
6. **Probe:** `docker stop learning-app`, nach etwa 4 Minuten muss der Alarm „Lernplattform antwortet
   nicht“ erscheinen, danach `docker start learning-app`.

## Backup-Marker

Der Alarm für das Backup setzt voraus, dass `scripts/backup.sh` mindestens einmal mit dem neuen Stand
gelaufen ist (`ls -la backups/.last-success`). Vorher meldet Zabbix nach einigen Stunden „nie gelaufen“.
Dass sich ein Backup einspielen lässt, zeigt nur `scripts/restore-test.sh` (siehe [BACKUP.md](BACKUP.md)).

## Grenzen

- **Ein Server:** Läuft Zabbix auf demselben Server wie die App, fällt das Monitoring mit ihm aus und
  meldet nichts. Für „der ganze Server ist weg“ braucht es zusätzlich eine Prüfung von außen, etwa einen
  kostenlosen Uptime-Dienst auf die öffentliche Adresse. Später lässt sich der Stack auf einen zweiten
  Host verschieben (der Agent und die HTTP-Prüfung brauchen dann eine erreichbare Adresse der App).
- **Serverwerte** (CPU, RAM, Plattenplatz) sind noch nicht eingerichtet. Dafür kommt ein Agent direkt
  auf dem Host mit der Vorlage „Linux by Zabbix agent“ als nächster Schritt.
- **Fehler-Tracking** (Stacktraces) gibt es nicht. Fehler stehen im Docker-Log
  (`docker compose logs app`).
- Nicht gegen eine laufende Zabbix-Instanz getestet, siehe Roadmap.
