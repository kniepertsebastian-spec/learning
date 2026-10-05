#!/usr/bin/env bash
# Prüft auf dem SERVER, ob die Installation von außen angreifbar ist. Nur lesend: ändert nichts und
# gibt keine Passwörter aus. Anleitung zum Beheben: docs/DEPLOY-UPDATE.md
#
# Aufruf im Projektordner auf dem Server:   scripts/check-server.sh
# Optional:  LEARNING_PG_CONTAINER (Standard learning-postgres), LEARNING_APP_CONTAINER (learning-app),
#            ENV_FILE (Standard .env)
set -uo pipefail

PG="${LEARNING_PG_CONTAINER:-learning-postgres}"
APP="${LEARNING_APP_CONTAINER:-learning-app}"
ENV_FILE="${ENV_FILE:-.env}"
errors=0
notes=0
ok()   { echo "  OK       $*"; }
bad()  { echo "  FEHLER   $*"; errors=$((errors + 1)); }
note() { echo "  HINWEIS  $*"; notes=$((notes + 1)); }

command -v docker >/dev/null 2>&1 || { echo "docker nicht gefunden - dieses Skript gehört auf den Server." >&2; exit 2; }

echo "1) Von außen erreichbare Docker-Ports (0.0.0.0 bzw. [::])"
exposed_any=0
while IFS=$'\t' read -r name ports; do
  [ -z "${name:-}" ] && continue
  published="$(echo "$ports" | tr ',' '\n' | grep -E '(0\.0\.0\.0|\[::\]):[0-9]+->' | sed -E 's/^ *//' | sort -u | tr '\n' ' ')"
  [ -z "$published" ] && continue
  exposed_any=1
  case "$name" in
    learning-*|"$PG"|"$APP") bad "$name ist von außen erreichbar: $published" ;;
    *) note "$name veröffentlicht auf allen Interfaces: $published (gehört das so?)" ;;
  esac
done < <(docker ps --format '{{.Names}}\t{{.Ports}}')
[ "$exposed_any" -eq 0 ] && ok "kein Container veröffentlicht einen Port auf allen Interfaces"

echo "2) Datenbank-Passwort (Test über das Docker-Netz, nicht über Loopback im Container)"
pg_user="$(docker exec "$PG" printenv POSTGRES_USER 2>/dev/null | head -1)"
pg_db="$(docker exec "$PG" printenv POSTGRES_DB 2>/dev/null | head -1)"
if [ -z "$pg_user" ] || [ -z "$pg_db" ]; then
  note "Container $PG nicht gefunden oder ohne POSTGRES_USER/POSTGRES_DB - Test übersprungen"
else
  # Aus dem App-Container zum Dienst „postgres“: dort greift die Passwortprüfung. Innerhalb des
  # Postgres-Containers wäre die lokale Verbindung ohne Passwort erlaubt und der Test wertlos.
  result="$(docker exec "$APP" node -e "
    const postgres = require('postgres');
    const sql = postgres({ host: 'postgres', user: process.argv[1], password: 'postgres', database: process.argv[2], connect_timeout: 5, max: 1 });
    sql\`select 1\`.then(() => { console.log('STANDARD'); process.exit(0); }).catch(() => { console.log('SICHER'); process.exit(0); });
  " "$pg_user" "$pg_db" 2>/dev/null | tail -1)"
  case "$result" in
    STANDARD) bad "die Datenbank akzeptiert das Standardpasswort 'postgres' (Benutzer $pg_user) - als kompromittiert behandeln, siehe docs/DEPLOY-UPDATE.md" ;;
    SICHER)   ok "das Standardpasswort 'postgres' wird abgelehnt" ;;
    *)        note "Test nicht möglich (läuft $APP und enthält das Paket 'postgres'?)" ;;
  esac
fi

echo "3) Pflichtangaben in $ENV_FILE (Werte werden nicht angezeigt)"
if [ ! -f "$ENV_FILE" ]; then
  note "$ENV_FILE nicht gefunden (Aufruf im Projektordner?)"
else
  value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//'; }
  dbpw="$(value DB_PASSWORD)"; secret="$(value AUTH_SECRET)"
  if [ -z "$dbpw" ]; then bad "DB_PASSWORD fehlt - die neue Compose-Datei startet dann nicht"
  elif [ "$dbpw" = "postgres" ] || [ "${#dbpw}" -lt 16 ]; then bad "DB_PASSWORD ist das Standardpasswort oder kürzer als 16 Zeichen"
  else ok "DB_PASSWORD gesetzt (${#dbpw} Zeichen)"; fi
  if [ -z "$secret" ]; then bad "AUTH_SECRET fehlt"
  elif [ "${#secret}" -lt 32 ]; then bad "AUTH_SECRET ist kürzer als 32 Zeichen"
  else ok "AUTH_SECRET gesetzt (${#secret} Zeichen)"; fi
  mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo "")"
  case "$mode" in
    600|400) ok "$ENV_FILE ist nur für den Besitzer lesbar ($mode)" ;;
    "") : ;;
    *) note "$ENV_FILE hat Rechte $mode - besser: chmod 600 $ENV_FILE" ;;
  esac
fi

echo "4) Vor dem Update: Konten, die sich nur in der Schreibweise der E-Mail unterscheiden (Migration 0024)"
if [ -n "${pg_user:-}" ] && [ -n "${pg_db:-}" ]; then
  dup="$(docker exec "$PG" psql -U "$pg_user" -d "$pg_db" -tAc "select count(*) from (select lower(btrim(email)) from users group by 1 having count(*) > 1) t" 2>/dev/null | tr -d '[:space:]')"
  case "$dup" in
    0) ok "keine Dubletten" ;;
    ''|*[!0-9]*) note "Abfrage nicht möglich (Tabelle users noch nicht vorhanden?)" ;;
    *) bad "$dup E-Mail-Adresse(n) kommen mehrfach in unterschiedlicher Schreibweise vor - die Migration würde abbrechen, vorher zusammenführen" ;;
  esac
fi

echo "5) Auf dem Host lauschende Datenbank-/App-Ports (ohne Docker-Weiterleitung)"
if command -v ss >/dev/null 2>&1; then
  listeners="$(ss -ltn 2>/dev/null | awk 'NR>1 {print $4}' | grep -E '^(0\.0\.0\.0|\*|\[::\]):(5432|3000)$' | sort -u | tr '\n' ' ')"
  [ -z "$listeners" ] && ok "nichts auf 5432/3000 für alle Interfaces" || bad "lauscht auf allen Interfaces: $listeners"
else
  note "ss nicht verfügbar - übersprungen"
fi

echo
if [ "$errors" -gt 0 ]; then
  echo "ERGEBNIS: $errors Fehler, $notes Hinweise - bitte docs/DEPLOY-UPDATE.md folgen."
  exit 1
fi
echo "ERGEBNIS: keine Fehler ($notes Hinweise)."
