#!/usr/bin/env bash
# Überwachung per E-Mail: prüft die Plattform und schickt bei Problemen und bei Entwarnung eine Mail.
# Läuft auf dem Server der App (Zeitgeber: deploy/learning-monitor.timer), unabhängig von der App selbst,
# der Versand geht direkt über SMTP (curl). Anleitung: docs/MONITORING.md
#
# Aufruf:  scripts/monitor.sh              Prüfungen ausführen (vom Timer, alle 5 Minuten)
#          scripts/monitor.sh --test-mail  nur eine Testmail senden (prüft Zugangsdaten und Empfänger)
#
# Pflicht:  MONITOR_MAIL_TO   Empfänger (mehrere mit Komma)
#           MAIL_SMTP_HOST, MAIL_SMTP_USER, MAIL_SMTP_PASSWORD, MAIL_FROM   wie für die App (docs/EMAIL.md);
#           Werte kommen aus der Umgebung oder aus .env (Pfad ENV_FILE)
# Optional: MAIL_SMTP_PORT (465), MAIL_SMTP_SECURE (1/0, sonst implizites TLS nur auf 465),
#           MONITOR_URL (http://127.0.0.1:3000), MONITOR_CONTAINERS ("learning-app learning-postgres",
#           leer = nicht prüfen), MONITOR_BACKUP_CHECK (1), BACKUP_DIR (./backups),
#           MONITOR_BACKUP_MAX_HOURS (26), MONITOR_DISK_MAX_PERCENT (85),
#           MONITOR_FAILS_BEFORE_ALARM (2), MONITOR_REMIND_HOURS (24), MONITOR_STATE_DIR (./.monitor-state),
#           MONITOR_CACERT (zusätzliche CA-Datei für den SMTP-Server, nur für Tests)
set -uo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
# Liest einen Wert aus der Umgebung (auch ein leerer zählt), sonst aus der .env, sonst der Standard.
# Die .env wird nicht als Skript ausgeführt.
cfg() {
  local key="$1" default="${2:-}"
  if [ -n "${!key+set}" ]; then printf '%s' "${!key}"; return; fi
  if [ -f "$ENV_FILE" ] && grep -qE "^${key}=" "$ENV_FILE"; then
    grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//'
    return
  fi
  printf '%s' "$default"
}

MAIL_TO="$(cfg MONITOR_MAIL_TO)"
SMTP_HOST="$(cfg MAIL_SMTP_HOST)"; SMTP_PORT="$(cfg MAIL_SMTP_PORT 465)"; SMTP_SECURE="$(cfg MAIL_SMTP_SECURE)"
SMTP_USER="$(cfg MAIL_SMTP_USER)"; SMTP_PASSWORD="$(cfg MAIL_SMTP_PASSWORD)"; MAIL_FROM="$(cfg MAIL_FROM)"
URL="$(cfg MONITOR_URL http://127.0.0.1:3000)"
CONTAINERS="$(cfg MONITOR_CONTAINERS "learning-app learning-postgres")"
BACKUP_CHECK="$(cfg MONITOR_BACKUP_CHECK 1)"; BACKUP_DIR="$(cfg BACKUP_DIR ./backups)"
BACKUP_MAX_HOURS="$(cfg MONITOR_BACKUP_MAX_HOURS 26)"; DISK_MAX="$(cfg MONITOR_DISK_MAX_PERCENT 85)"
FAILS_BEFORE="$(cfg MONITOR_FAILS_BEFORE_ALARM 2)"; REMIND_HOURS="$(cfg MONITOR_REMIND_HOURS 24)"
STATE_DIR="$(cfg MONITOR_STATE_DIR ./.monitor-state)"; CACERT="$(cfg MONITOR_CACERT)"
HOST_NAME="$(hostname 2>/dev/null || echo server)"

for pair in MONITOR_MAIL_TO:MAIL_TO MAIL_SMTP_HOST:SMTP_HOST MAIL_SMTP_USER:SMTP_USER MAIL_SMTP_PASSWORD:SMTP_PASSWORD MAIL_FROM:MAIL_FROM; do
  var="${pair#*:}"
  [ -n "${!var}" ] || { echo "Konfiguration unvollständig: ${pair%%:*} fehlt (siehe docs/MONITORING.md)" >&2; exit 2; }
done

b64() { printf '%s' "$1" | base64 -w0; }

# Schickt eine Mail. Zugangsdaten gehen über eine Konfiguration auf stdin, nie in die Prozessliste.
send_mail() {
  local subject="$1" body="$2" file rcpt from_addr scheme secure opts=()
  file="$(mktemp)"
  from_addr="$(printf '%s' "$MAIL_FROM" | sed -E 's/.*<([^>]*)>.*/\1/')"
  {
    printf 'From: %s\r\nTo: %s\r\nSubject: =?UTF-8?B?%s?=\r\nDate: %s\r\n' "$MAIL_FROM" "$MAIL_TO" "$(b64 "$subject")" "$(date -R)"
    printf 'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'
    printf '%s' "$body" | base64 -w76
    printf '\r\n'
  } > "$file"
  case "$SMTP_SECURE" in 1) secure=1 ;; 0) secure=0 ;; *) [ "$SMTP_PORT" = 465 ] && secure=1 || secure=0 ;; esac
  [ "$secure" = 1 ] && scheme=smtps || scheme=smtp
  for rcpt in ${MAIL_TO//,/ }; do opts+=(--mail-rcpt "$rcpt"); done
  [ -n "$CACERT" ] && opts+=(--cacert "$CACERT")
  local u="${SMTP_USER//\\/\\\\}" p="${SMTP_PASSWORD//\\/\\\\}"; u="${u//\"/\\\"}"; p="${p//\"/\\\"}"
  local rc=0
  printf 'user = "%s:%s"\n' "$u" "$p" | curl -sS -m 30 --ssl-reqd -K - \
    --url "$scheme://$SMTP_HOST:$SMTP_PORT" --mail-from "$from_addr" "${opts[@]}" -T "$file" >/dev/null || rc=$?
  rm -f "$file"
  return "$rc"
}

if [ "${1:-}" = "--test-mail" ]; then
  if send_mail "[Learning] Testmail vom Monitoring ($HOST_NAME)" "Das Monitoring von $HOST_NAME kann Mails an $MAIL_TO senden."; then
    echo "Testmail an $MAIL_TO gesendet."; exit 0
  fi
  echo "Versand fehlgeschlagen (Zugangsdaten, Host, Port?)" >&2; exit 1
fi

# --- Prüfungen: jede setzt result (ok|fail) und detail ------------------------------------------
check_ready() {
  local code; code="$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$URL/api/ready" 2>/dev/null)"
  if [ "$code" = 200 ]; then result=ok; detail="bereit"
  else result=fail; detail="$URL/api/ready antwortet mit HTTP $code (000 = keine Verbindung, 503 = Datenbank nicht erreichbar)"; fi
}
check_backup() {
  local marker="$BACKUP_DIR/.last-success" now age
  if [ ! -f "$marker" ]; then result=fail; detail="kein Backup-Marker in $BACKUP_DIR (Backup noch nie erfolgreich gelaufen?)"; return; fi
  now="$(date +%s)"; age=$(( now - $(stat -c %Y "$marker") ))
  if [ "$age" -gt $(( BACKUP_MAX_HOURS * 3600 )) ]; then result=fail; detail="letztes erfolgreiches Backup vor $(( age / 3600 )) Stunden (Grenze $BACKUP_MAX_HOURS)"
  else result=ok; detail="letztes Backup vor $(( age / 3600 )) Stunden"; fi
}
check_disk() {
  local used; used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
  if [ -z "$used" ]; then result=fail; detail="Plattenbelegung nicht lesbar"
  elif [ "$used" -gt "$DISK_MAX" ]; then result=fail; detail="Platte zu ${used}% voll (Grenze ${DISK_MAX}%)"
  else result=ok; detail="Platte ${used}% belegt"; fi
}
check_containers() {
  local c running down=""
  command -v docker >/dev/null 2>&1 || { result=fail; detail="docker nicht gefunden"; return; }
  for c in $CONTAINERS; do
    running="$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo missing)"
    [ "$running" = true ] || down="$down $c($running)"
  done
  if [ -n "$down" ]; then result=fail; detail="Container laufen nicht:$down"; else result=ok; detail="Container laufen"; fi
}

mkdir -p "$STATE_DIR"
exit_code=0
handle() {
  local name="$1" state="$STATE_DIR/$1" fails=0 alerted=0 now; now="$(date +%s)"
  [ -f "$state" ] && read -r fails alerted < "$state"
  if [ "$result" = fail ]; then
    fails=$(( fails + 1 ))
    if [ "$alerted" -eq 0 ] && [ "$fails" -ge "$FAILS_BEFORE" ]; then
      if send_mail "[Learning] PROBLEM: $name auf $HOST_NAME" "$name: $detail"$'\n\n'"Seit $fails Prüfungen in Folge. Du bekommst eine Mail, sobald es wieder in Ordnung ist."; then alerted="$now"; else exit_code=1; fi
    elif [ "$alerted" -ne 0 ] && [ $(( now - alerted )) -ge $(( REMIND_HOURS * 3600 )) ]; then
      if send_mail "[Learning] WEITERHIN: $name auf $HOST_NAME" "$name: $detail"$'\n\n'"Das Problem besteht seit mehr als $REMIND_HOURS Stunden."; then alerted="$now"; else exit_code=1; fi
    fi
    echo "$fails $alerted" > "$state"
  else
    if [ "$alerted" -ne 0 ]; then
      send_mail "[Learning] BEHOBEN: $name auf $HOST_NAME" "$name: $detail" || { exit_code=1; echo "$fails $alerted" > "$state"; return; }
    fi
    rm -f "$state"
  fi
  echo "$name: $result - $detail"
}

result=; detail=; check_ready; handle ready
if [ "$BACKUP_CHECK" = 1 ]; then check_backup; handle backup; fi
check_disk; handle disk
if [ -n "$CONTAINERS" ]; then check_containers; handle containers; fi
exit "$exit_code"
