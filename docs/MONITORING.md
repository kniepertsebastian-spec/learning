# Monitoring mit Zabbix

Die App liefert zwei Prüfpunkte, der Rest kommt aus den Standard-Vorlagen von Zabbix. In der App
selbst ist dafür nichts weiter nötig.

| Prüfpunkt | Quelle | Bedeutung |
|---|---|---|
| `/api/health` | App | Prozess läuft (200) |
| `/api/ready` | App | zusätzlich Datenbank erreichbar (200, sonst 503) |
| Backup-Alter | `scripts/monitor-backup.sh` | Sekunden seit dem neuesten Datenbank-Backup, -1 = keines oder leer |
| CPU, RAM, Platte, Dienste | Zabbix-Vorlage „Linux by Zabbix agent“ | Zustand des Servers |

## Aufbau

- **Zabbix-Agent auf dem Server** der Lernplattform, **aktiver** Modus: der Agent baut die Verbindung
  zum Zabbix-Server nach außen auf. Dadurch muss auf dem App-Server kein Port (10050) geöffnet werden.
- **Zabbix-Server und Frontend nicht auf demselben Server** betreiben, sonst fällt das Monitoring mit
  der App aus. Das Zabbix-Frontend nicht ungeschützt ins Internet stellen (VPN, Cloudflare Access oder
  IP-Beschränkung).
- Die App-Prüfpunkte laufen über `127.0.0.1:3000`, der App-Port bleibt also gesperrt.

## Einrichtung

1. Agent installieren (Zabbix 7 LTS: `zabbix-agent2`) und in `zabbix_agent2.conf` setzen:
   `Server=<zabbix-ip>`, `ServerActive=<zabbix-ip>`, `Hostname=<name wie im Frontend>`. Falls TLS
   gewünscht: PSK eintragen (`TLSConnect=psk` usw.).
2. `deploy/zabbix/learning.conf` nach `/etc/zabbix/zabbix_agent2.d/` kopieren, Pfad `/opt/learning`
   an den Projektordner anpassen. Agent neu starten.
3. Prüfen: `zabbix_agent2 -t learning.app.ready` liefert `200`, `-t learning.backup.age` eine Zahl.
4. Im Frontend den Host anlegen, Vorlage „Linux by Zabbix agent“ verknüpfen und diese Items
   (Typ „Zabbix agent (active)“, Intervall 1m, bzw. 15m beim Backup-Alter) anlegen:
   `learning.app.health`, `learning.app.ready`, `learning.backup.age`.

## Trigger (Vorschlag)

| Name | Ausdruck (Zabbix 7) | Schwere |
|---|---|---|
| App antwortet nicht | `count(/<host>/learning.app.health,3m,"ne","200")>=3` (3 Messungen in Folge) | Hoch |
| Datenbank nicht erreichbar | `count(/<host>/learning.app.ready,3m,"ne","200")>=3` | Hoch |
| Backup zu alt | `last(/<host>/learning.backup.age)>93600 or last(/<host>/learning.backup.age)<0` (über 26 h oder keines) | Hoch |
| Platte fast voll | aus der Linux-Vorlage | Warnung |

Das Backup läuft laut `deploy/learning-backup.timer` täglich, 26 Stunden lassen eine Stunde Luft. Hast
du einen anderen Rhythmus, den Wert anpassen. Das Backup-Alter prüft nur, dass **eine** Datei
rechtzeitig entsteht. Dass sie sich einspielen lässt, zeigt `scripts/restore-test.sh`
(siehe [BACKUP.md](BACKUP.md)), bitte regelmäßig ausführen.

## Benachrichtigung

Unter „Verwaltung → Mediatypen“ E-Mail (SMTP) oder Telegram einrichten und einer Aktion zuordnen.
Wichtig: Der Alarm muss über einen Weg laufen, der unabhängig vom überwachten Server funktioniert.

## Grenzen

- Nicht Teil dieser Einrichtung: Fehler-Tracking im Code (Stacktraces). Die App schreibt Fehler ins
  Docker-Log (`docker compose logs app`). Ein Log-Item in Zabbix oder ein Dienst wie Sentry wäre die
  nächste Stufe.
- Der Zabbix-Agent braucht keinen Zugriff auf Docker. Bitte den Benutzer `zabbix` **nicht** in die
  Gruppe `docker` aufnehmen, das wäre ein Root-Zugang.
