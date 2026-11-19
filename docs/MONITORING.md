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
| `app-kennzahlen` | `/api/monitor` nicht antwortet (nur mit `MONITOR_TOKEN`, siehe unten) |
| `serverfehler` | in den letzten 15 Minuten mindestens 3 Serverfehler aufgetreten sind (Mail nennt die neuesten fünf) |
| `ki-budget` | mehr als 80 % von `GEMINI_BUDGET_USD` verbraucht sind (ohne gesetztes Budget keine Prüfung) |
| `app-last` | die Event-Loop-Verzögerung der App (p99 seit der letzten Prüfung) über 500 ms liegt; die Mail nennt auch Speicher und laufende Kursgenerierungen |
| `kursgenerierung` | eine Kursgenerierung gescheitert ist. Jede gescheiterte wird **einmal und sofort** gemeldet, ohne „BEHOBEN“ |

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
5. **App-Kennzahlen (Serverfehler, Kursgenerierung, KI-Budget):** in der `.env` der App
   `MONITOR_TOKEN=` mit einem zufälligen Wert setzen (`openssl rand -hex 24`, mindestens 16 Zeichen) und die App neu
   starten (`docker compose up -d`). Das Skript liest denselben Wert aus der `.env`. Ohne Token antwortet
   `/api/monitor` immer mit 404 und die drei Prüfungen entfallen.
6. **Probe:** `docker stop learning-app`, nach etwa 10 Minuten kommt die Mail „PROBLEM: ready“ und
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
| `MONITOR_TOKEN` | leer | schaltet `/api/monitor` und die App-Kennzahlen ein (gleicher Wert in App und Skript) |
| `MONITOR_ERRORS_MAX` | `3` | Serverfehler in 15 Minuten bis zum Alarm |
| `MONITOR_BUDGET_WARN_PERCENT` | `80` | Warnschwelle für das KI-Budget |
| `MONITOR_EVENT_LOOP_MAX_MS` | `500` | Grenze für die Event-Loop-Verzögerung der App |
| `MAIL_SMTP_SECURE` | nur Port 465 | `1` implizites TLS auch auf anderem Port, `0` STARTTLS |

## Erster echter Kurslauf: Last beobachten (R3)

Die Kursgenerierung läuft im Prozess der Web-App, mit mehreren Lernzielen parallel (`COURSE_GEN_CONCURRENCY`, Standard 5).
Während ein Auftrag läuft, schreibt die App jede Minute eine Zeile ins Log:

```bash
docker compose logs -f app | grep -E 'PROCESS|USAGE'
# PROCESS eventLoopP99Ms=14 eventLoopMaxMs=62 rssMb=412 heapUsedMb=230 activeCourseJobs=1
# USAGE model=… promptTokens=… completionTokens=… finishReason=STOP configFallback=none
```

Faustregel: `eventLoopP99Ms` unter 100 ist unauffällig, ab etwa 200 spürt man es bei Klicks, ab 500 meldet der Monitor.
`docker stats learning-app` zeigt dazu CPU und Speicher des Containers. Ist es spürbar, zuerst `COURSE_GEN_CONCURRENCY`
senken (z. B. 2); der nächste Schritt ist ein eigener Worker-Container aus demselben Image.

`finishReason` in der `USAGE`-Zeile: `STOP` ist normal. `MAX_TOKENS` heißt, die Antwort war zu lang und wurde abgeschnitten
(das Lernziel scheitert ohne bezahlte Wiederholung). `SAFETY`, `RECITATION` oder `BLOCKED:…` heißt, Gemini hat blockiert.
`configFallback` ist `none`, solange Gemini Denk-Einstellung und Ausgabe-Limit annimmt.

## Grenzen

- **Ein Server prüft sich selbst.** Fällt er komplett aus (Strom, Netz, Hoster), kommt keine Mail. Dafür
  braucht es eine Prüfung von außen: ein kostenloser Uptime-Dienst auf die öffentliche Adresse oder das
  spätere Monitoring auf dem zweiten Server.
- **Gmail** hat ein Tageslimit und gehört nicht in den Kundenbetrieb (siehe EMAIL.md). Für Alarme an
  den Betreiber reicht es.
- **Kein Fehler-Tracking:** Jeder Serverfehler, den Next.js auffängt (`onRequestError` in `instrumentation.ts`), steht
  als eine JSON-Zeile im Docker-Log: `docker compose logs app | grep request_error` (Pfad ohne Query, Meldung, Digest,
  die ersten Zeilen des Stacktrace). Gezählt wird im Speicher der App; nach einem Neustart beginnt die Zählung bei null.
  Fehler, die eine Route selbst abfängt und als 500 beantwortet, zählen nicht. Ein externer Dienst (Sentry o. ä.) kommt
  erst mit Echtdaten und braucht dann einen Eintrag in der Datenschutzerklärung.
- **Fehler im Browser:** Was die Fehlerseiten (`app/error.tsx`, `app/global-error.tsx`) auffangen, melden sie an
  `POST /api/client-errors`; es steht als JSON-Zeile im Log: `docker compose logs app | grep client_error` (Pfad ohne
  Query und ohne Einmal-Token, Meldung, Digest, gekürzter Stack, User-Agent, keine Nutzerkennung). `chunkError: true` heißt:
  ein offener Tab hatte nach einem Deploy noch Skripte der alten Version; mit `reloading: true` hat die Seite sich danach
  selbst neu geladen. Höchstens 20 Meldungen je IP und 300 insgesamt in 10 Minuten; sie zählen nicht zu den Serverfehlern
  im Monitor, weil jeder sie auslösen kann.
- Keine Serverwerte außer Platte (CPU, RAM, Last).
