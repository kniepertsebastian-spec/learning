#!/usr/bin/env bash
# Restore-Test: spielt ein verschlüsseltes Datenbank-Backup in eine WEGWERF-Datenbank
# ein, prüft sie und löscht sie wieder. Die Produktionsdatenbank wird nicht angefasst.
# Verfahren: docs/BACKUP.md
#
# Aufruf:  scripts/restore-test.sh <db-YYYYmmdd-HHMMSS.dump.age>
# Pflicht: AGE_IDENTITY             Pfad zur privaten age-Schlüsseldatei
# Optional: RESTORE_MODE            compose (Default) oder direct
#           RESTORE_ADMIN_URL       Modus direct: Verbindung mit CREATEDB-Recht,
#                                   z. B. postgres://postgres@127.0.0.1:5432/postgres
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_FILE="${1:?Aufruf: scripts/restore-test.sh <backup.dump.age>}"
: "${AGE_IDENTITY:?AGE_IDENTITY (Pfad zur privaten age-Schlüsseldatei) fehlt}"
[ -f "$BACKUP_FILE" ] || { echo "Backup nicht gefunden: $BACKUP_FILE" >&2; exit 1; }
MODE="${RESTORE_MODE:-compose}"
TESTDB="restore_test_$(date +%Y%m%d%H%M%S)"

# Je Modus drei Operationen: psql_admin (gegen Wartungs-DB), psql_test (gegen Testdatenbank),
# restore (liest den Dump von stdin).
case "$MODE" in
  compose)
    psql_admin() { docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -tA'; }
    psql_test()  { docker compose exec -T postgres sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d $TESTDB -tA"; }
    restore()    { docker compose exec -T postgres sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $TESTDB --no-owner"; }
    ;;
  direct)
    : "${RESTORE_ADMIN_URL:?RESTORE_ADMIN_URL fehlt (RESTORE_MODE=direct)}"
    TEST_URL="${RESTORE_ADMIN_URL%/*}/$TESTDB"
    psql_admin() { psql -v ON_ERROR_STOP=1 "$RESTORE_ADMIN_URL" -tA; }
    psql_test()  { psql -v ON_ERROR_STOP=1 "$TEST_URL" -tA; }
    restore()    { pg_restore -d "$TEST_URL" --no-owner; }
    ;;
  *) echo "Unbekannter RESTORE_MODE: $MODE" >&2; exit 1 ;;
esac

cleanup() { echo "DROP DATABASE IF EXISTS $TESTDB" | psql_admin >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "CREATE DATABASE $TESTDB" | psql_admin >/dev/null
age -d -i "$AGE_IDENTITY" "$BACKUP_FILE" | restore
echo "Dump entschlüsselt und eingespielt in $TESTDB"

# Plausibilitätsprüfung: Migrationsstand und Kerntabellen vorhanden und lesbar.
MIGRATIONS="$(echo 'select count(*) from drizzle.__drizzle_migrations' | psql_test)"
USERS="$(echo 'select count(*) from users' | psql_test)"
CERTS="$(echo 'select count(*) from certifications' | psql_test)"
echo "Migrationen: $MIGRATIONS, Nutzer: $USERS, Zertifizierungen: $CERTS"
[ "$MIGRATIONS" -gt 0 ] || { echo "FEHLER: keine Migrationen im Backup" >&2; exit 1; }

echo "RESTORE-TEST ERFOLGREICH ($BACKUP_FILE)"
