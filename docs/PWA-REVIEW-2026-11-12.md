# PWA-Review: learning (Knowvia)

**Umfang:** `main` bei Commit `be684769`. Analyse und automatische Checks liefen auf dem Vorgänger `4cd3a279`, der sich nur in `.dockerignore`, `.env.example` und `.gitignore` unterscheidet; diese drei Dateien habe ich auf dem Stand von `main` nachgeprüft. Stack: Next.js 16.4.5 (webpack), Serwist 9, Auth.js v5 (JWT), Drizzle/Postgres, Docker + Cloudflare Tunnel. Geprüft: alle 212 API-Routen mit 268 Handlern (Guard je Handler per Skript), Service Worker, Cache-Regeln, Manifest, Offline-Sync, Datenexport und Kontolöschung gegen alle 132 Tabellen, KI-Datenflüsse, Dockerfile, Compose, CI, Proxy-Beispiele. Dazu die sieben Befunde des Reviews vom 06.11.2026 (`docs/PWA-REVIEW-2026-11-06.md`) nachgeprüft.
**Ergebnis:** Sechs der sieben alten Befunde sind behoben, Guards und Cache-Trennung sind weiter lückenlos. Neu sind zwei Fehler im Lernkern (hängende Sync-Ereignisse nach einem Neustart, Antwortzeit wird nie erfasst), ein Rückfall im Repository (`node_modules` wieder eingecheckt und veraltet) und fehlende Rechtstexte. Kritisch: 0 · Hoch: 0 · Mittel: 4 · Niedrig: 4 · Hinweis: 2

## Befunde

| # | Schwere | Bereich | Titel | Ort |
|---|---------|---------|-------|-----|
| 1 | Mittel | PWA/Datenintegrität | Sync-Ereignis bleibt nach einem Neustart für immer in „wird verarbeitet“ hängen | `lib/server/sync/service.ts:98-105`, `:110-119` |
| 2 | Mittel | Logik | Antwortzeit wird nie erfasst, drei Funktionen laufen deshalb leer | `lib/server/db/schema.ts:3449`, `lib/server/psrp/planning-service.ts:63-74`, `lib/server/engagement/rules.ts:96` |
| 3 | Mittel | Betrieb/Abhängigkeiten | `node_modules` (42.320 Dateien) wieder eingecheckt und nicht mehr passend zum Lockfile | Commit `4cd3a279`, `.gitignore:4`, `.gitignore:42` |
| 4 | Mittel | Datenschutz | Keine Datenschutzerklärung und kein Impressum, AGB-Seite ist ein Auszug | `app/agb/page.tsx:12` |
| 5 | Niedrig | Datenintegrität | Abschluss einer Session ist nicht atomar, ein Fehler mittendrin verbucht Wiederholungen doppelt | `lib/server/study/session-service.ts:948-992` |
| 6 | Niedrig | Datenschutz/Nutzbarkeit | Per SSO angelegte Konten können sich nicht selbst löschen | `lib/server/sso/service.ts:114`, `:155`, `lib/server/account/delete.ts:45` |
| 7 | Niedrig | Validierung | Abgabe-Routen übernehmen den Body per Typ-Cast statt Schema | `app/api/study-sessions/[sessionId]/attempt/route.ts:33` u. a. |
| 8 | Niedrig | Informationsleck | Zwei Admin-Routen geben rohe Fehlertexte mit 502 zurück (bekannt, offen) | `app/api/admin/sources/[id]/parse/route.ts:32-34`, `app/api/admin/sources/[id]/blueprint/route.ts:70-72` |
| 9 | Hinweis | Doku | Sammelroadmap führt Web Push als offen, obwohl es umgesetzt ist | `docs/roadmaps/roadmap_sammel.md`, `docs/PWA.md` (Abschnitt „Web Push“) |
| 10 | Hinweis | Security | Logout macht das JWT nicht serverseitig ungültig (Befund 7 vom 06.11., unverändert) | `app/actions/auth.ts:26`, `lib/server/auth.ts:15` |

## Details

### 1. Sync-Ereignis bleibt nach einem Neustart hängen (Mittel · PWA/Datenintegrität)
- **Ort:** `lib/server/sync/service.ts:98-105` (Rückgabe bei vorhandener Zeile), `:110-119` (Claim-Zeile mit Status `error` und Text „wird verarbeitet“), `lib/client/sync-core.ts:132`
- **Problem:** Vor der Verbuchung legt der Server eine Claim-Zeile an. Wird der Prozess beendet, bevor `applyEvent` fertig ist, bleibt die Zeile stehen. Jeder spätere Versuch findet sie, antwortet mit `error` und „wird verarbeitet“ und setzt bewusst kein `terminal`. Der Client speichert das Ereignis als `failed` und sendet es bei jedem Sync wieder. Es wird weder verbucht noch als `rejected` aussortiert. Ein Aufräumen alter Claims gibt es nicht, `sync:reprocess-conflicts` behandelt nur den Status `conflict`.
- **Auslöser/Szenario:** Ein Deploy (`docker compose up -d --build`, `docs/DEPLOY-UPDATE.md:79`) oder ein Absturz, während ein Gerät gerade seine Warteschlange überträgt. Die offline beantwortete Session dieser Person kommt nie im Gedächtnismodell an, obwohl die Regel „Lernleistung geht nie verloren“ gilt.
- **Empfehlung:** Eine Claim-Zeile mit „wird verarbeitet“, deren `created_at` älter als wenige Minuten ist, als verwaist behandeln: löschen und das Ereignis neu verarbeiten. Dazu ein Test, der den Abbruch simuliert.

### 2. Antwortzeit wird nie erfasst (Mittel · Logik)
- **Ort:** `lib/server/db/schema.ts:3449` (`review_log.response_time_ms`), `lib/server/review/service.ts:12` (Eingabefeld), `lib/server/study/session-service.ts:816-827` (Antwort-Typ ohne Zeitfeld), Verbraucher: `lib/server/psrp/planning-service.ts:63-74`, `lib/server/engagement/rules.ts:93-96`, `lib/server/psrp/review-log.ts:87-104`
- **Problem:** Kein Client misst die Zeit bis zur Antwort, und kein Aufrufer von `recordReviewOutcomes` setzt `responseTimeMs`. Im ganzen Repository schreibt nur ein Test einen Wert. Die Spalte ist im Betrieb also immer leer. Folgen: `averageSecondsPerReview` liefert immer `null`, das Tageslimit rechnet für alle mit dem Rückfallwert von 60 Sekunden. Das Frühwarn-Signal `slow_answers` kann nie auslösen. Die Basiszeit je Frage bleibt leer. In `roadmap_psrp_hr.md:54` und `:80` sind diese Punkte als erledigt abgehakt.
- **Auslöser/Szenario:** Jede Session. Wer schnell antwortet, bekommt zu wenige Fragen für sein Zeitbudget, wer langsam ist, zu viele. Die Entlastung bei auffällig langsamen Antworten greift nie.
- **Empfehlung:** Im Client je Frage die Zeit von der Anzeige bis zur Antwort messen und mitschicken (online und im Sync-Pfad), serverseitig auf plausible Werte begrenzen und an `recordReviewOutcomes` durchreichen. Details in der Roadmap, Phase 2.

### 3. `node_modules` wieder eingecheckt und veraltet (Mittel · Betrieb/Abhängigkeiten)
- **Ort:** Commit `4cd3a279` (42.387 Dateien, rund 7 Mio. Zeilen), `.gitignore:4` (`/node_modules`), `.gitignore:42` (`*.tsbuildinfo`), `tsconfig.tsbuildinfo`
- **Problem:** Commit `e7220d92` hatte `node_modules` aus dem Index genommen, „latest state“ hat es wieder hineingelegt, samt `tsconfig.tsbuildinfo`. Auf `main` (`be684769`) liegen weiterhin 42.320 Dateien unter `node_modules` im Index. Der eingecheckte Stand passt nicht zum Lockfile: `npm ls` meldet fünf direkte Pakete als `invalid`, darunter `@google/genai` 2.32.0 statt `^3.0.0` (Hauptversion), `postgres` 4.0.0 statt `^4.1.0` und `vitest` 5.0.5 statt `^5.1.0`. Enthalten sind außerdem plattformgebundene Binärdateien (nur linux-x64).
- **Auslöser/Szenario:** Wer das Repository klont und ohne `npm ci` startet oder testet, arbeitet mit anderen Versionen als CI und Docker-Image. Dependabot ändert nur das Lockfile, die Abweichung wächst mit jedem Merge. Diffs und Reviews werden unlesbar, das Repository ist rund 340 MB groß. CI und Image sind nicht betroffen, weil beide `npm ci` ausführen und `.dockerignore` den Ordner ausschließt.
- **Empfehlung:** `git rm -r --cached node_modules tsconfig.tsbuildinfo` und committen. Zusätzlich in der CI einen Schritt, der fehlschlägt, wenn `git ls-files node_modules` etwas findet.

### 4. Keine Datenschutzerklärung und kein Impressum (Mittel · Datenschutz)
- **Ort:** `app/agb/page.tsx:12` („Der vollständige Vertragstext … ist hier zu ergänzen“). Es gibt keine Route für Datenschutz oder Impressum und keinen Link darauf in Layout, Login oder Registrierung.
- **Problem:** Die App erhebt neben Konto- und Lerndaten auch Angaben zur Person: Tagesform, Zeitbudget, Arbeitstag (`session_checkin`), Altersspanne (`users.age_range`), Tageszeit-Profil, Selbsteinschätzung, Berufsprofil und Skills. Profil und Skills gehen für die Karrierepfade an Gemini (`lib/server/career/service.ts:66`, der Hinweis dazu steht in `components/career/CareerPaths.tsx:46`). Eine Stelle, die Zwecke, Rechtsgrundlagen, Empfänger und Speicherdauer nennt, fehlt.
- **Auslöser/Szenario:** Sobald Personen außerhalb des eigenen Tests die App nutzen (Pilot, Firmenkunden), fehlen die Pflichtangaben nach DSGVO Art. 13 und das Impressum.
- **Empfehlung:** Seiten `/datenschutz` und `/impressum` anlegen und im Fuß, auf Login und Registrierung verlinken. Inhaltlich vom Betreiber bzw. rechtlich prüfen lassen. Der Datenexport (`lib/server/account/export.ts`) beschreibt die Tabellen schon und taugt als Grundlage.

### 5. Abschluss einer Session ist nicht atomar (Niedrig · Datenintegrität)
- **Ort:** `lib/server/study/session-service.ts:948-960` (Antworten speichern), `:961-973` (Wiederholungen verbuchen), `:989-992` (Status `completed`)
- **Problem:** Die Schritte laufen nacheinander ohne gemeinsame Transaktion. Schlägt nach dem Verbuchen etwas fehl (zum Beispiel `recordUnderstandResults` oder das Status-Update bei einem kurzen Datenbankfehler), bleibt die Session `in_progress`, die Reviews stehen aber schon in `review_log` und `item_state`.
- **Auslöser/Szenario:** Der Client sendet erneut, online oder über den Sync (dort wird die Claim-Zeile bei unerwarteten Fehlern gelöscht). Dieselben Antworten werden ein zweites Mal verbucht, der FSRS-Zustand rückt zweimal vor.
- **Empfehlung:** Speichern, Verbuchen und Status in einer Transaktion ausführen, oder vor dem Verbuchen prüfen, ob es für `session_id` und Frage schon einen Eintrag gibt.

### 6. SSO-Konten können sich nicht selbst löschen (Niedrig · Datenschutz/Nutzbarkeit)
- **Ort:** `lib/server/sso/service.ts:114`, `:155` (zufälliges, unbekanntes Passwort), `lib/server/account/delete.ts:45`, `lib/server/account/password.ts:27`
- **Problem:** Löschen und Passwortwechsel verlangen das aktuelle Passwort. Wer nur über das Firmenkonto angemeldet ist, kennt keines.
- **Auslöser/Szenario:** Eine per SSO angelegte Person will ihr Konto löschen und scheitert an der Passwortabfrage. Der Umweg über „Passwort vergessen“ ist nicht ersichtlich.
- **Empfehlung:** Für Konten mit SSO-Identität die Löschung anders bestätigen, zum Beispiel durch Eintippen der eigenen E-Mail-Adresse bei frischer Sitzung.

### 7. Abgabe-Routen ohne Schema (Niedrig · Validierung)
- **Ort:** `app/api/study-sessions/[sessionId]/attempt/route.ts:33`, `…/exit/route.ts:23`, `app/api/sections/[id]/attempt/route.ts:28`, `…/exit/route.ts:20`, `app/api/remediation/[objectiveId]/attempt/route.ts:33`, `app/api/exams/[certId]/[examId]/attempt/route.ts:42`
- **Problem:** Der Body wird mit `as` in den erwarteten Typ gegossen. Ungültiges JSON oder falsche Typen enden als 500 statt 400. `confidence` ist in der Datenbank freier Text ohne Check, ein beliebiger Wert wird gespeichert. Diese Routen haben anders als `/api/sync` auch keine Größengrenze.
- **Auslöser/Szenario:** Ein angemeldeter Nutzer mit verändertem Client. Betroffen sind nur die eigenen Daten, deshalb niedrig.
- **Empfehlung:** Ein gemeinsames Zod-Schema für Antworten (wie im Sync-Pfad) und `readJsonCapped`.

### 8. Rohe Fehlertexte in zwei Admin-Routen (Niedrig · Informationsleck)
- **Ort:** `app/api/admin/sources/[id]/parse/route.ts:32-34`, `app/api/admin/sources/[id]/blueprint/route.ts:70-72`
- **Problem:** `error.message` beliebiger Fehler geht mit Status 502 an den Client. Steht schon in `roadmap_sammel.md` als offen. Nur für Admins erreichbar.
- **Empfehlung:** Generische Meldung an den Client, Einzelheiten ins Server-Log.

### 9. Sammelroadmap nicht auf dem Stand (Hinweis · Doku)
- `roadmap_sammel.md` führt Web Push mit vier Unterpunkten als offen. Im Code ist es umgesetzt (`app/sw.ts`, `app/api/push/*`, `docs/PWA.md`, Abschnitt „Web Push“). Offen ist nur der Versuch auf einem echten Gerät.

### 10. Logout macht das JWT nicht ungültig (Hinweis · Security)
- Unverändert seit dem 06.11. `sessionVersion` steigt nur bei Passwortwechsel, Reset und SSO-Verknüpfung. Ein „Überall abmelden“ gibt es nicht.

## Stand der Befunde vom 06.11.2026

| Alt | Titel | Stand |
|---|---|---|
| 1 | Rate-Limit-Speicher ohne Grenze | behoben (`lib/server/admin/rate-limit.ts`: Sweep, Obergrenze 20.000, Schlüssel gekürzt; `lib/server/login-input.ts`) |
| 2 | `.env` im Docker-Image | behoben auf `main` mit `be684769` (`.dockerignore:6-9` schließt `.env` und `.env*` aus). Wirkt erst nach einem neuen Build; alte Images und der Build-Cache enthalten die Datei weiter. |
| 3 | `CF-Connecting-IP` in Proxy-Beispielen | behoben (`deploy/Caddyfile:24`, `deploy/nginx.conf.example:29`) |
| 4 | Größenlimit nur über `Content-Length` | behoben für die genannten Routen (`lib/server/http/capped-body.ts`) |
| 5 | Logout-Dialog passt nicht zur Datenhaltung | behoben (Text angepasst, `lib/i18n/components/useSignOut.ts`) |
| 6 | Name ohne Längengrenze | behoben (`app/api/register/route.ts:20`) |
| 7 | Logout macht JWT nicht ungültig | offen, siehe Befund 10 |

## Positiv aufgefallen
- Alle 268 Handler haben einen Guard oder sind bewusst öffentlich (Health, Registrierung, Wiederherstellung, SSO, Abmeldelink, Expertenfoto).
- Datenexport deckt jede Tabelle mit Personenbezug ab oder begründet die Ausnahme im Code. Alle Fremdschlüssel auf `users` löschen mit oder setzen auf null, die Kontolöschung hängt an keiner Tabelle.
- Ausgehende Abrufe (Quellen-URLs, SSO) laufen über `lib/server/network/guarded-request.ts`: DNS-Prüfung beim Verbindungsaufbau, Größen- und Zeitgrenze.
- Service Worker wie dokumentiert: API und RSC nur über das Netz, Admin- und Firmenseiten nie im Cache, Update nur nach Klick.
- Manifest vollständig, alle Icons und Screenshots haben die angegebene Größe. `lang`, Zoom und Reduced Motion sind gesetzt, der Kontrasttest besteht.
- Karrierepfade nennen in der Oberfläche, dass Profil und Skills an den KI-Dienst gehen.

## Automatische Checks
| Check | Ergebnis |
|-------|----------|
| npm audit (`--omit=dev`) | 9 × moderate, 0 high/critical (esbuild über drizzle-kit, glob/minimatch über @serwist/build). Die CI lässt moderate bewusst zu. |
| lint | 0 Fehler, 22 Warnungen (ungenutzte Importe und Variablen) |
| lint:ui | bestanden (Rohfarben 2, Inline-Texte 15, beides Bestand) |
| check:contrast | 98 Paare, 0 unter dem Sollwert |
| tsc | 1 Fehler: `app/layout.tsx(95,56)` kennt `LayoutProps` nicht. Der Typ entsteht erst bei `next build` (so auch in der CI vermerkt), deshalb kein Befund. |
| Tests | 1.130 bestanden, 594 übersprungen (Datenbank-Tests ohne `TEST_DATABASE_URL`), 0 fehlgeschlagen |

Alle Läufe liefen auf Commit `4cd3a279` und nutzten das eingecheckte, veraltete `node_modules` (Befund 3), nicht die Versionen aus dem Lockfile.

## Nicht geprüft
- **Build, Playwright, Lighthouse:** kein Produktions-Build und keine Datenbank in dieser Umgebung.
- **Datenbank-Tests:** 594 Tests übersprungen, darunter die Rechte-Tests des Firmenbereichs.
- **Laufzeit auf Geräten:** Service Worker, Push-Zustellung, iOS/Safari und Android.
- **Barrierefreiheit:** nur statisch (Labels von Icon-Buttons, `alt`, klickbare Nicht-Buttons, Dialoge). Keine Prüfung mit Tastatur oder Screenreader.
- **IDOR:** Guards je Handler vollständig, die Besitzprüfung je ID nur in Stichproben (Sessions, Lektionen, Energie, Lernzeit, Export).
- **Rechtliche Bewertung** der Datenverarbeitung: nur der technische Stand.

## Empfohlene Reihenfolge
1. **#3** `node_modules` und `tsconfig.tsbuildinfo` aus dem Index nehmen (Quick Win).
2. Image mit der neuen `.dockerignore` neu bauen und alte Images samt Build-Cache entfernen (Abschluss von Altbefund 2).
3. **#1** Verwaiste Claim-Zeilen erkennen und neu verarbeiten.
4. **#2** Antwortzeit erfassen. Das ist zugleich die Grundlage für weitere Messwerte.
5. **#4** Datenschutzerklärung und Impressum, vor dem Pilot.
6. **#5**, **#7** Session-Abschluss atomar, Schema für Abgaben.
7. **#6**, **#8**, **#9**, **#10** nach Bedarf.

Die Umsetzung steht als Plan in `docs/roadmaps/roadmap_review_messung.md`.
