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
  -U "${DB_USER:-postgres}" -d "${DB_NAME:-certstudy}" \
  --format=custom --file=/tmp/backup.dump
docker compose cp postgres:/tmp/backup.dump "./backups/certstudy-$(date +%Y%m%d-%H%M%S).dump"
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
  -U "${DB_USER:-postgres}" -d "${DB_NAME:-certstudy}" \
  --clean --if-exists < "./backups/certstudy-20260101-020000.dump"
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

## Nicht abgedeckt

Dieses Dokument deckt kein automatisiertes, unbeaufsichtigtes
Backup-Scheduling (z. B. Cron/systemd-Timer auf dem Zielserver) ab - das
Skript oben ist der manuelle, getestete Grundbaustein dafür. Automatisierung
folgt, sobald ein konkretes Ziel-Hosting dafür feststeht (siehe R16
„Enterprise Governance" in roadmap.md für den größeren Rahmen: dokumentierte
Aufbewahrungsfristen, Backup-/Restore-Tests als wiederkehrende Sicherheits-
prüfung).
