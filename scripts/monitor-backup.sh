#!/usr/bin/env bash
# Für das Monitoring (Zabbix): gibt das Alter des neuesten Datenbank-Backups in Sekunden aus.
# -1 = kein Backup vorhanden oder das neueste ist leer. Nur lesend. Siehe docs/MONITORING.md
#
# Optional: BACKUP_DIR (Standard ./backups im Projektordner, wie scripts/backup.sh)
set -uo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"

newest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.dump.age' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
if [ -z "$newest" ] || [ ! -s "$newest" ]; then echo -1; exit 0; fi
echo $(( $(date +%s) - $(stat -c %Y "$newest") ))
