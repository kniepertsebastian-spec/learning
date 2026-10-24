# Backup und Wiederanlauf

R0 (roadmap.md): "Backup- und Wiederanlaufverfahren dokumentieren". Deckt die
`docker-compose.yml`-Einzelserver-Deployment ab (ein `postgres`- und ein
`app`-Container, siehe README.md).

Es gibt zwei zu sichernde Datenbestände:

1. **Postgres-Datenbank** (`postgres_data`-Volume) - alle Lerninhalte,
   Nutzerkonten, Fortschritt, Audit-Events usw.
2. **Hochgeladene Quell-PDFs** (`source_uploads_data`-Volume, gemountet unter
   `SOURCES_STORAGE_DIR=/app/data/sources`) - die Original-PDFs der
   freigegebenen Zertifizierungsquellen (R1.1). Ohne sie lassen sich bereits
   extrahierte Inhalte weiter nutzen, aber keine neuen Abschnitte mehr aus
   der Originalquelle nachvollziehen oder neu extrahieren.

## Backup

### Postgres (logisches Backup, empfohlen)

Ein `pg_dump` ist portabel über Postgres-Versionen hinweg und lässt sich
gegen jede kompatible Zielinstanz wiederherstellen - bevorzugt gegenüber
einem rohen Volume-Kopie des Datenverzeichnisses.

```bash
docker compose exec -T postgres pg_dump \
  -U "${DB_USER:-postgres}" -d "${DB_NAME:-learning_pwa}" \
  --format=custom --file=/tmp/backup.dump
docker compose cp postgres:/tmp/backup.dump "./backups/learning_pwa-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T postgres rm /tmp/backup.dump
```

`./backups/` liegt außerhalb der Docker-Volumes (z. B. auf dem Host oder in
einem separaten Objektspeicher) - ein Backup, das im selben Volume wie die
Originaldaten liegt, schützt nicht vor Volume-Verlust.

### Hochgeladene Quell-PDFs

```bash
docker run --rm \
  -v learning_source_uploads_data:/data:ro \
  -v "$(pwd)/backups":/backup \
  alpine tar czf "/backup/sources-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .
```

(Volume-Name ggf. mit `docker volume ls` prüfen - der tatsächliche Name
trägt je nach Compose-Projektnamen ein Präfix.)

### Empfohlener Rhythmus

- Postgres: täglich, plus vor jedem Schema-Migrationslauf (`npm run
  db:migrate`) manuell.
- Quell-PDFs: wöchentlich (ändern sich seltener als Lern-/Fortschrittsdaten).
- Mehrere Generationen aufbewahren (z. B. 7 tägliche + 4 wöchentliche), nicht
  nur die jeweils letzte - ein beschädigtes Backup darf nicht das einzige
  sein.

## Wiederanlauf (Restore)

### Postgres

```bash
# Zielinstanz muss existieren und leer sein (oder --clean anhängen)
docker compose exec -T postgres pg_restore \
  -U "${DB_USER:-postgres}" -d "${DB_NAME:-learning_pwa}" \
  --clean --if-exists < "./backups/learning_pwa-20260101-020000.dump"
```

Anschließend `npm run db:migrate` ausführen, falls das Backup älter als der
aktuell ausgerollte Migrationsstand ist (Backups enthalten immer nur den
Datenstand zum Sicherungszeitpunkt, nicht spätere Schemaänderungen).

### Hochgeladene Quell-PDFs

```bash
docker run --rm \
  -v learning_source_uploads_data:/data \
  -v "$(pwd)/backups":/backup \
  alpine sh -c "cd /data && tar xzf /backup/sources-20260101-020000.tar.gz"
```

### Nach jedem Restore prüfen

- `docker compose exec app npm run db:migrate` läuft ohne Fehler.
- `/api/health` antwortet mit 200.
- Eine Stichprobe freigegebener Zertifizierungen ist im Adminbereich sichtbar
  und referenziert weiterhin ihre Quell-PDFs (`/admin/certifications/[slug]/sources`).
- Rollen (`npm run user:set-role -- <email> admin`) und Zugriffe funktionieren
  wie erwartet.

## Automatisiertes, verschlüsseltes Backup

`scripts/backup.sh` sichert Postgres (`pg_dump`, Custom-Format; darin liegen auch die hochgeladenen
Firmendokumente) und die Quell-PDFs, verschlüsselt
beides mit [age](https://github.com/FiloSottile/age) und räumt lokale Backups nach
`BACKUP_RETENTION_DAYS` (Default 14) auf. Auf dem Server liegt nur der **öffentliche** Schlüssel.
Der private Schlüssel gehört an einen anderen Ort (Passwortmanager, Rechner des Betreibers),
sonst nützt die Verschlüsselung nichts.

```bash
age-keygen -o learning-backup.key        # einmalig, NICHT auf dem Server aufbewahren
# Die Ausgabe nennt "Public key: age1..." - diesen Wert als BACKUP_AGE_RECIPIENT verwenden.

BACKUP_AGE_RECIPIENT=age1... BACKUP_REMOTE=box:learning scripts/backup.sh
```

`BACKUP_REMOTE` ist ein [rclone](https://rclone.org/)-Ziel (S3, SFTP, Storage Box u. a.) für die
Offsite-Kopie. Ohne es bleibt das Backup lokal, und das Skript warnt.

Zeitplan: `deploy/learning-backup.service` und `deploy/learning-backup.timer` sind systemd-Vorlagen
(nächtlich um 02:30). Sie lesen `BACKUP_AGE_RECIPIENT` und `BACKUP_REMOTE` aus `/etc/learning-backup.env`.

### Restore-Test

`scripts/restore-test.sh` spielt ein Datenbank-Backup in eine **Wegwerf-Datenbank** ein, prüft
Migrationsstand und Kerntabellen und löscht sie wieder. Die Produktionsdatenbank bleibt unberührt.

```bash
AGE_IDENTITY=learning-backup.key scripts/restore-test.sh backups/db-20261005-023000.dump.age
```

Ein Backup gilt erst als brauchbar, wenn dieser Test einmal erfolgreich gelaufen ist. Danach
regelmäßig wiederholen (z. B. monatlich), denn ein ungetestetes Backup ist keine Garantie.

## Betriebsprüfung (Datenintegrität, Phase 6)

Das ist Handarbeit auf dem Server und lässt sich nicht aus dem Repository erledigen. Ergebnis jeweils mit Datum festhalten.

- [ ] **Cron/Timer läuft.** `systemctl list-timers learning-backup.timer` zeigt den nächsten Lauf; `journalctl -u learning-backup.service -n 50` zeigt einen erfolgreichen letzten Lauf; `backups/.last-success` ist jünger als 26 Stunden.
- [ ] **Offsite-Kopie.** `BACKUP_REMOTE` steht in `/etc/learning-backup.env`; `rclone lsl "$BACKUP_REMOTE"` listet das jüngste Backup.
- [ ] **Schlüsseltrennung.** Auf dem Server liegt nur `BACKUP_AGE_RECIPIENT` (öffentlich). `find / -name '*.key' -path '*age*'` und ein Blick in `/etc/learning-backup.env` zeigen keinen privaten Schlüssel (`AGE-SECRET-KEY-...`).
- [ ] **Monitoring-Alarm.** `scripts/monitor.sh` meldet `backup`, wenn das letzte erfolgreiche Backup älter als `MONITOR_BACKUP_MAX_HOURS` ist (Standard 26 Stunden, also strenger als die geforderten 36). Alarmprobe: `touch -d '2 days ago' backups/.last-success`, Monitor laufen lassen, Marker danach mit `touch` zurücksetzen.

### Restore-Test-Protokoll (einmal im Quartal)

| Datum | Backup-Datei | Ergebnis | Wer |
|---|---|---|---|
| | | | |
