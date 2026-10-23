# E-Mail-Versand

Die App verschickt E-Mails für **Bestätigung der E-Mail-Adresse**, **Passwort vergessen** und
**Einladungen**. Der Versand läuft über SMTP und ist anbieterneutral: Gmail ist nur eine
Konfiguration, ein anderer Anbieter ändert nur die Umgebungsvariablen, nicht den Code.

## Ohne Konfiguration

Sind die Angaben unvollständig, ist der Versand **aus**. Das ist ein gültiger Zustand:

- Neue Registrierungen gelten sofort als bestätigt (es gäbe sonst keinen Weg zur Bestätigung).
- „Passwort vergessen“ und „Bestätigung erneut senden“ antworten mit 503 und einem Hinweis.
- Einladungen erzeugen weiter den Link, den der Firmen-Admin selbst weitergibt.

Sobald der Versand eingerichtet ist, müssen **neue** Konten ihre Adresse bestätigen, bevor sie sich
anmelden können. Bestehende Konten wurden bei der Einführung als bestätigt markiert und bleiben
nutzbar.

## Gmail einrichten

1. Beim Google-Konto die **Bestätigung in zwei Schritten** einschalten.
2. Unter Google-Konto → Sicherheit → **App-Passwörter** ein Passwort für „Mail“ erzeugen (16 Zeichen).
   Das normale Konto-Passwort funktioniert für SMTP nicht.
3. In der `.env` auf dem Server eintragen (siehe `.env.example`):

```bash
MAIL_SMTP_HOST=smtp.gmail.com
MAIL_SMTP_PORT=465
MAIL_SMTP_USER=deine.adresse@gmail.com
MAIL_SMTP_PASSWORD=das-app-passwort-ohne-leerzeichen
MAIL_FROM="Learning <deine.adresse@gmail.com>"
APP_BASE_URL=https://learning.pwa-tree.de
```

4. `docker compose up -d` (die Variablen werden an die App durchgereicht).

`APP_BASE_URL` ist die öffentliche Adresse, mit der die Links in den E-Mails gebaut werden. In
Produktion muss sie `https://` sein, sonst bleibt der Versand aus.

## Verbindung und Sicherheit

- Port **465** nutzt implizites TLS, Port **587** erzwingt STARTTLS. Zugangsdaten gehen nie
  unverschlüsselt über die Leitung. Ein anderer Port mit implizitem TLS lässt sich mit
  `MAIL_SMTP_SECURE=1` einstellen.
- Das App-Passwort steht nur in der `.env` und wird nie protokolliert. Es lässt sich bei Google
  jederzeit einzeln widerrufen.
- Die Links in den Mails enthalten Einmal-Tokens: Bestätigung 24 Stunden, Passwort-Reset 1 Stunde,
  Einladung 7 Tage. In der Datenbank steht nur der Hash.

## Grenzen von Gmail (Stand der Planung, vor dem Produktivbetrieb prüfen)

- **Absender:** Gmail setzt die angemeldete Adresse als Absender. Eine eigene Domain als Absender
  braucht einen anderen Anbieter oder Google Workspace.
- **Mengenlimit:** ein kostenloses Gmail-Konto darf nur eine begrenzte Zahl Empfänger pro Tag
  anschreiben (grob 500, bei Workspace mehr). Für einen Pilot reicht das, für viele Nutzer nicht.
  Die App begrenzt zusätzlich: „Passwort vergessen“ je Adresse 3 pro Stunde und je IP 10 pro Stunde.
- **Datenschutz:** Für den Einsatz bei Kunden braucht es einen Auftragsverarbeitungsvertrag. Ein
  privates Gmail-Konto bietet den nicht. Für Pilotkunden daher Google Workspace mit AV-Vertrag oder
  einen EU-Anbieter (Hoster-SMTP, E-Mail-Dienst) verwenden; die Roadmap führt das als offenen Punkt.
- **Zustellung:** Mails von einem privaten Gmail-Konto für eine fremde Domain landen eher im
  Spam-Ordner. Bei Problemen zuerst dort nachsehen.

## Anderer Anbieter

Nur die Variablen ändern (`MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, ggf. `MAIL_SMTP_SECURE`,
`MAIL_SMTP_USER`, `MAIL_SMTP_PASSWORD`, `MAIL_FROM`). Am besten danach „Passwort vergessen“ mit
einer eigenen Adresse ausprobieren.

## Tests

Die Tests laufen gegen einen lokalen SMTP-Server (`lib/server/mail/test-smtp.ts`), der wie Gmail eine
Anmeldung verlangt. Gegen Gmail selbst wurde nicht getestet: dafür braucht es echte Zugangsdaten und
ausgehende SMTP-Verbindungen.

## Reaktivierung nach einer Pause (Flag `reactivation`)

`npm run reactivation:run` verschickt freundliche Mails „3 Minuten reichen heute“ an Personen, die länger nicht gelernt haben: nach **5, 12 und 26 Tagen** ohne Aktivität (Session, gelöste Simulation oder Spickzettel), **höchstens drei je Pause**, danach Ruhe. Eine neue Aktivität beginnt eine neue Pause. Der Link in der Mail (`/cert/<slug>/restart`) startet direkt eine 3-Minuten-Runde; den Rückstand verteilt wie immer die Planungsschicht.

- **Täglich per Cron** (tagsüber; ein Lauf außerhalb 8 bis 20 Uhr in der Zeitzone der Person verschickt nichts, der nächste holt es nach): `0 10 * * * cd /pfad/zum/projekt && docker compose exec -T app npm run reactivation:run`.
- **Ausgeschlossen:** Personen mit Abmeldung (Konto → „Freundliche Erinnerung nach einer Pause“ oder Abmeldelink in der Mail), Personen, die die E-Mail-Erinnerungen des Prüfungsplaners abgeschaltet haben, und **alle Mitglieder einer Firma** (dort gelten nur die Fristerinnerungen; nie an Arbeitgeber oder Mentor).
- **Abmeldelink:** `/unsubscribe/reactivation?u=…&t=…`, signiert mit `AUTH_SECRET`, ohne Anmeldung nutzbar; erst ein Klick meldet ab, damit Mail-Scanner nichts auslösen. Die Mail trägt zusätzlich den Header `List-Unsubscribe`.
- **Ausschalten:** `FEATURE_REACTIVATION=0` (alle) oder `FEATURE_REACTIVATION_ROLLOUT=<0 bis 100>` (Anteil der Personen).
- **Auswertung:** `psrp:metrics` enthält unter `reactivation` den Flag-Arm sowie die Zahl der Mails und die Rückkehr binnen 7 Tagen.
