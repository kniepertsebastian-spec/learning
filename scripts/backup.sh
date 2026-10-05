#!/usr/bin/env bash
# Verschlüsseltes Backup von Postgres und hochgeladenen Quell-PDFs.
# Verfahren und Wiederanlauf: docs/BACKUP.md
#
# Pflicht:   BACKUP_AGE_RECIPIENT   öffentlicher age-Schlüssel (age1...). Der private
#                                   Schlüssel gehört NICHT auf den Server.
# Optional:  BACKUP_DIR             Zielordner (Default ./backups)
#            BACKUP_RETENTION_DAYS  lokale Aufbewahrung in Tagen (Default 14)
#            BACKUP_REMOTE          rclone-Ziel für Offsite-Kopie, z. B. "box:learning"
#            BACKUP_SOURCES         0 = Quell-PDFs überspringen (Default 1)
#            BACKUP_PG_MODE         compose (Default) oder direct (pg_dump gegen DATABASE_URL)
#            SOURCES_VOLUME         Docker-Volume der Quell-PDFs (Default learning_source_uploads_data)
#            SOURCES_DIR            Ordner der Quell-PDFs im Modus direct
set -euo pipefail
cd "$(dirname "$0")/.."

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (öffentlicher age-Schlüssel) fehlt}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
MODE="${BACKUP_PG_MODE:-compose}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
umask 077

# Schreibt nach <ziel>.part und benennt erst bei Erfolg um: ein abgebrochener
# Lauf hinterlässt nie eine Datei, die wie ein gültiges Backup aussieht.
encrypt_to() {
  local target="$1"
  age -r "$BACKUP_AGE_RECIPIENT" -o "$target.part"
  [ -s "$target.part" ] || { echo "Leeres Backup: $target" >&2; rm -f "$target.part"; exit 1; }
  mv "$target.part" "$target"
  echo "geschrieben: $target ($(du -h "$target" | cut -f1))"
}

DB_FILE="$BACKUP_DIR/db-$STAMP.dump.age"
case "$MODE" in
  compose)
    # POSTGRES_USER/POSTGRES_DB stehen im Container (docker-compose.yml).
    docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
      | encrypt_to "$DB_FILE"
    ;;
  direct)
    : "${DATABASE_URL:?DATABASE_URL fehlt (BACKUP_PG_MODE=direct)}"
    pg_dump "$DATABASE_URL" --format=custom | encrypt_to "$DB_FILE"
    ;;
  *) echo "Unbekannter BACKUP_PG_MODE: $MODE" >&2; exit 1 ;;
esac
FILES=("$DB_FILE")

if [ "${BACKUP_SOURCES:-1}" != "0" ]; then
  SRC_FILE="$BACKUP_DIR/sources-$STAMP.tar.gz.age"
  if [ "$MODE" = "compose" ]; then
    docker run --rm -v "${SOURCES_VOLUME:-learning_source_uploads_data}":/data:ro alpine tar cz -C /data . \
      | encrypt_to "$SRC_FILE"
    FILES+=("$SRC_FILE")
  elif [ -n "${SOURCES_DIR:-}" ]; then
    tar cz -C "$SOURCES_DIR" . | encrypt_to "$SRC_FILE"
    FILES+=("$SRC_FILE")
  else
    echo "Quell-PDFs übersprungen (SOURCES_DIR nicht gesetzt)"
  fi
fi

if [ -n "${BACKUP_REMOTE:-}" ]; then
  for f in "${FILES[@]}"; do rclone copy "$f" "$BACKUP_REMOTE"; done
  echo "Offsite kopiert nach $BACKUP_REMOTE"
else
  echo "WARNUNG: kein BACKUP_REMOTE gesetzt - Backup liegt nur lokal, nicht offsite" >&2
fi

# Marker für das Monitoring (docs/MONITORING.md): Zabbix liest nur den Änderungszeitpunkt dieser Datei.
touch "$BACKUP_DIR/.last-success" && chmod 644 "$BACKUP_DIR/.last-success"

# Lokale Aufbewahrung. Offsite-Aufbewahrung regelt das Ziel (z. B. Lifecycle-Regel).
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump.age' -o -name 'sources-*.tar.gz.age' \) \
  -mtime "+$RETENTION_DAYS" -print -delete
