# Server-Update und Absicherung

Für Server, die noch mit der **alten** `docker-compose.yml` laufen (Postgres auf `0.0.0.0:5432`, App auf
`0.0.0.0:3000`, Standardpasswort `postgres`). Die neue Compose-Datei veröffentlicht den Datenbank-Port
nicht mehr, bindet die App nur an `127.0.0.1` und verlangt `DB_PASSWORD` und `AUTH_SECRET`.

Reihenfolge einhalten. Die Schritte 1 und 2 sind eilig, der Rest kann in Ruhe folgen.

## 1. Sofort: Ports beim Hoster sperren

`ufw` hilft hier **nicht**: Docker setzt seine Regeln vor die von ufw. Die Sperre gehört in die Firewall
des Hosters (Cloud-Firewall/Security Group) oder in die `DOCKER-USER`-Kette:

- Eingehend nur erlauben, was nötig ist (SSH, ggf. 80/443). **5432 und 3000 nicht.**
- Der Zugang der Nutzer läuft über den Cloudflare Tunnel (ausgehende Verbindung), er braucht keinen offenen Port.

Von einem anderen Rechner prüfen: `nc -vz <server-ip> 5432` und `nc -vz <server-ip> 3000` müssen scheitern.

## 2. Prüfen, ob schon Schaden möglich war

Im Projektordner auf dem Server (ändert nichts, zeigt keine Passwörter):

```bash
scripts/check-server.sh
```

Das Skript prüft veröffentlichte Ports, ob die Datenbank das Standardpasswort `postgres` akzeptiert,
`.env`-Pflichtangaben und Dubletten bei E-Mail-Adressen (Migration `0024`). Endet es mit `FEHLER`,
weiter bei Schritt 3. Akzeptiert die Datenbank das Standardpasswort, gilt sie als **kompromittiert**:
Abschnitt „Falls das Standardpasswort galt“ unten.

## 3. Backup vor dem Update

```bash
docker exec learning-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > pre-update.dump
chmod 600 pre-update.dump
```

(Regelmäßige verschlüsselte Backups: [BACKUP.md](BACKUP.md).) Das Backup liegt unverschlüsselt auf dem
Server, nach erfolgreichem Update an einen sicheren Ort kopieren und löschen.

## 4. Dubletten bei E-Mail-Adressen beheben

Migration `0024` macht E-Mail-Adressen eindeutig ohne Rücksicht auf Groß-/Kleinschreibung und bricht bei
Dubletten ab. Anzeigen:

```bash
docker exec learning-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "select lower(btrim(email)) as mail, count(*) from users group by 1 having count(*) > 1"'
```

Gibt es Zeilen, die Konten vorher zusammenführen oder eines löschen. Keine Zeilen: nichts zu tun.

## 5. Datenbank-Passwort ändern (vor `.env`!)

`POSTGRES_PASSWORD` wirkt nur bei der **ersten** Initialisierung des Datenvolumens. Das Passwort muss
deshalb in der laufenden Datenbank geändert werden, **bevor** die neue `.env` gilt:

```bash
NEWPW="$(openssl rand -hex 24)"
docker exec learning-postgres sh -c "psql -U \"\$POSTGRES_USER\" -d postgres -c \"ALTER USER \\\"\$POSTGRES_USER\\\" PASSWORD '$NEWPW'\""
echo "DB_PASSWORD=$NEWPW"   # in .env eintragen, danach Terminalverlauf löschen
```

## 6. `.env` ergänzen

```bash
DB_PASSWORD=<das neue Passwort aus Schritt 5>
AUTH_SECRET=<mindestens 32 Zeichen, z. B. openssl rand -base64 48>
# optional, für E-Mail-Versand: MAIL_* und APP_BASE_URL, siehe docs/EMAIL.md
```

`chmod 600 .env`. Ein neuer `AUTH_SECRET` meldet alle Nutzer ab. Das ist gewollt, falls es einen Verdacht gibt.

## 7. Update einspielen

```bash
git pull
docker compose up -d --build
```

Die App führt beim Start die Migrationen aus. Prüfen:

```bash
docker compose ps                       # App und Postgres laufen, Postgres ohne Port-Weiterleitung
docker ps --format '{{.Names}}\t{{.Ports}}' | grep learning    # nur 127.0.0.1:3000 bei der App
docker compose logs --tail 50 app       # Migrationen ohne Fehler
curl -s http://127.0.0.1:3000/api/health
scripts/check-server.sh                 # muss "keine Fehler" melden
```

Von außen: `nc -vz <server-ip> 5432` und `nc -vz <server-ip> 3000` scheitern, die Seite über den Tunnel
funktioniert.

## Rückweg

Das Update ändert Schema nur vorwärts. Bei einem Problem das Backup aus Schritt 3 mit `pg_restore` in eine
leere Datenbank einspielen und den alten Stand der Compose-Datei verwenden (`git checkout <alter-commit>`).
Die alte Compose-Datei veröffentlicht die Ports wieder, daher die Firewall aus Schritt 1 nicht entfernen.

## Falls das Standardpasswort galt

Solange 5432 offen war und `postgres`/`postgres` funktionierte, konnte jeder im Internet lesen, schreiben
und löschen. Das lässt sich im Nachhinein nicht ausschließen. Vorgehen:

1. Schritte 1, 5 und 6 sofort, `AUTH_SECRET` neu setzen (meldet alle Sitzungen ab).
2. Nach Spuren suchen: `docker logs learning-postgres` (fremde IP-Adressen, ungewöhnliche Verbindungen),
   `\du` und `\l` in psql (unbekannte Rollen oder Datenbanken), `select * from pg_stat_activity`,
   unbekannte Tabellen oder Erpressungsnachrichten in der Datenbank.
3. Auffälligkeiten: aus einem sauberen Backup vor dem Zeitpunkt wiederherstellen, alle Nutzer-Passwörter
   zurücksetzen lassen.
4. Enthält die Datenbank Daten echter Personen, prüfen, ob eine Meldepflicht nach Art. 33 DSGVO besteht
   (72 Stunden ab Kenntnis). Das ist eine rechtliche Entscheidung des Betreibers.
5. Passwort-Hashes (bcrypt) und Einladungstoken (nur Hash) lassen sich nicht direkt verwenden, die
   Nutzer sollten ihr Passwort trotzdem ändern, wenn sie es woanders nutzen.
