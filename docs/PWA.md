# PWA: Caching, Offline- und Update-Fluss

Kurzüberblick für Entwickler. Die Planung steht in `roadmap_pwa.md`, die Umsetzungsreihenfolge in `umsetzungsplan.md`.

## Bausteine

| Teil | Datei |
|---|---|
| Service Worker (Serwist) | `app/sw.ts`, Konfiguration in `next.config.ts` |
| Cache-Regeln (Namen, Limits, Pfade) | `lib/pwa/cache-policy.ts` |
| Offline-Einstieg (`/offline`, `/~offline`) | `app/offline`, `app/~offline`, `components/OfflineHome.tsx`, `components/OfflineFallback.tsx` |
| Offline-Pakete und Sync-Warteschlange | `lib/client/offline-db.ts`, `offline-download.ts`, `sync-queue.ts` |
| Update-Hinweis, Cache-Besitzer | `components/ServiceWorkerManager.tsx`, `lib/client/cache-owner.ts` |
| Hinweisbalken, harte Navigation offline | `components/OfflineBanner.tsx`, `lib/client/offline-nav.ts` |

Der Service Worker ist im Dev-Server abgeschaltet (`disable` in `next.config.ts`). Alles Folgende gilt für den Produktions-Build.

## Caching-Strategie

- **API (`/api/*`)**: nie im Cache (`NetworkOnly`). Offline-Daten liegen ausschließlich in IndexedDB, nicht im Service-Worker-Cache.
- **Seiten (Navigationen)**: `NetworkFirst` (3 s) im `pages-cache` (max. 50 Einträge, 14 Tage). Nur Antworten mit Status 200.
- **Admin- und Firmenbereich** (`/admin`, `/company`, `/confirm-company`): `NetworkOnly`, landen in keinem Cache.
- **Statische Dateien** (Stil, Skript, Bild, Schrift): `StaleWhileRevalidate` im `assets-cache` (max. 200 Einträge, 30 Tage).
- **Precache**: alle Build-Assets plus `/offline` und `/~offline` (Revision je Build).
- **Besitzer**: Gecachte Seiten gehören genau einem Nutzer. Beim Logout (`clearLocalUserData`) und beim Anmelden mit einer anderen Nutzer-ID (auch nach abgelaufener Sitzung) wird der `pages-cache` geleert.
- Der frühere gemeinsame Cache `ui-cache` wird beim Aktivieren des Service Workers gelöscht.

`/offline` und `/~offline` werden vorab zwischengespeichert. Das Layout rendert sie deshalb **ohne Nutzer** (`x-pathname` aus `proxy.ts`, `isOfflineShellPath`); die Seiten enthalten keine Nutzerdaten.

## Offline-Fluss

1. Online: Kurs unter `/cert/<slug>/offline` mit „Für offline speichern“ herunterladen (IndexedDB, danach `navigator.storage.persist()`).
2. Offline: Der Hinweisbalken führt zu `/offline` (harte Navigation, kommt aus dem Precache). Dort stehen die Pakete des zuletzt angemeldeten Nutzers (`proofpath-last-user` im `localStorage`, beim Logout entfernt).
3. Lektion lesen, Lektionstest oder Tages-Session abschließen: Das Ergebnis landet in der Sync-Warteschlange (IndexedDB, `pendingSyncEvents`).
4. Wieder online: Die Warteschlange wird beim App-Start, beim `online`-Ereignis, über den Sync-Knopf im Kopf oder auf `/offline` übertragen. Beim Logout wird erst synchronisiert, sonst gewarnt.
5. Seiten, die offline weder im Cache liegen noch erreichbar sind, zeigen `/~offline` (Serwist-`fallbacks`).

**Background Sync (Chrome/Android):** Beim Einreihen eines Ergebnisses meldet die Seite `sync-queue:<Nutzer-ID>` beim Service Worker an. Der überträgt die Warteschlange im `sync`-Ereignis direkt aus IndexedDB, auch bei geschlossener App (`app/sw.ts`, gemeinsame Logik in `lib/client/sync-core.ts`). Bei 401/403 bleiben die Ereignisse unverändert liegen und der Sync-Knopf zeigt „Anmeldung nötig“; ohne Netz wiederholt der Browser den Auftrag. Der Server lehnt Ereignisse einer anderen als der genannten Person ab (403). Wo es Background Sync nicht gibt (iOS, Firefox), bleibt es bei den Auslösern oben.

Lernfortschritt geht nie verloren: Reload bei Netzwechsel ist abgeschaltet (`reloadOnOnline: false`), die Warteschlange wird nie still gelöscht.

## Datenintegrität über Zeit

Plan: `roadmap_datenintegritaet.md`. Offline erbrachte Lernleistung soll auch nach Tagen vollständig, mit dem richtigen Zeitpunkt und nur bei Berechtigten ankommen.

**Zeitpunkt der Antwort.** Jede Antwort in einer Offline-Session oder einem Lektionstest trägt `answeredAt` (Gerätezeit). Der Server begrenzt sie mit `effectiveTime()` (`lib/server/sync/effective-time.ts`): Zukunft über 5 Minuten → Serverzeit, nicht vor Erstellung der Session, älter als 30 Tage → nur Protokolleintrag. Mit diesem Zeitpunkt entstehen `review_log.timestamp_utc`, `local_hour`/`weekday`, der FSRS-Zustand, `study_sessions.completed_at` (Lernserie, Wochenziel) und der Abschluss des Lektionstests. Hat das Item inzwischen ein jüngeres `last_review` (z. B. online auf einem anderen Gerät gelernt), wird die verspätete Antwort nur geloggt (`review_log.state_applied = false`), der Zustand bleibt. Nur der Sync-Pfad wertet `answeredAt` aus; die Online-Routen ignorieren es.

**Übertragung beim Verlassen.** `startSyncTriggers()` (in `ServiceWorkerManager`, daher auch auf `/offline`) überträgt beim Start, bei `online` und beim Zurückkehren in den Vordergrund. Beim Wechsel in den Hintergrund oder Schließen (`visibilitychange` → `hidden`, `pagehide`) geht die Warteschlange mit `fetch(..., { keepalive: true })` hoch, in Teilen von höchstens 60 KB; größere Einzelereignisse bleiben für den normalen Sync. Das ist die Antwort auf fehlenden Background Sync auf iOS. Die Verbuchung ist idempotent, eine nicht mehr angekommene Antwort kostet nichts.

**iOS ohne Installation.** Liegt das älteste unübertragene Ergebnis länger als 24 Stunden (`lib/pwa/unsynced.ts`), erscheint im Kopf und auf `/offline` ein deutlicher Hinweis (`UnsyncedNotice`), die Offline-Übersicht nennt das Alter. Vor dem ersten Download zeigt der Offline-Manager die Installationsanleitung (überspringbar).

**Konflikte.** Eine inzwischen abgeschlossene oder ausgesetzte Session endet nicht mehr als `conflict`: die Antworten werden als Wiederholungen gezählt, der Status ist `applied_partial` (Hinweis „Session war schon abgeschlossen, deine Antworten wurden trotzdem gezählt“). Ein verspäteter Lektionstest wird protokolliert und verbucht, der Lernzielstand sinkt dadurch nie. Alte Konflikte werden beim erneuten Senden mit der heutigen Logik verarbeitet; die Seite reiht lokale Konflikte einmalig wieder ein. Einmalig auf dem Server: `npm run sync:reprocess-conflicts -- --dry-run`, dann ohne `--dry-run`.

**Entzogener Zugriff.** Beim Start und bei `online` fragt die Seite für jedes lokale Paket `/api/cert/<id>/offline-package/version`. 404/403 → Paket vom Gerät entfernt, kurze Meldung. Netzfehler, 401 und Serverfehler löschen nie. Bewusster Kompromiss: **offline bleibt ein Paket nutzbar**, bis das Gerät wieder Netz hat; die Sync-Warteschlange bleibt von der Löschung unberührt. Optional je Firma: `npm run company:offline-expiry -- <organization-id> <tage|off>` sperrt Pakete interner Lernpfade, die so viele Tage nicht online geprüft wurden (Standard aus).

**Aufräumen.** Meldet der Server dreimal hintereinander denselben endgültigen Fehler (Lektion, Session oder Simulation nicht zuzuordnen), wird das Ereignis `rejected` und nicht mehr gesendet. Es bleibt gespeichert, der Sync-Knopf zeigt „N Ergebnisse konnten nicht zugeordnet werden“ mit „Ansehen“ und „Verwerfen“. Antworten auf Fragen, die nach dem Download gelöscht wurden, werden übersprungen und im Ergebnis gemeldet; der Rest wird verbucht. Varianten werden auch bei `active = false` dem Original-Item zugeordnet.

## Update-Fluss

`skipWaiting` ist aus. Nach einem Deploy installiert sich der neue Service Worker und **wartet**. `ServiceWorkerManager` zeigt den Toast „Neue Version verfügbar“. Erst der Klick auf „Neu laden“ sendet `SKIP_WAITING`; beim `controllerchange` lädt die Seite neu. Ohne Klick läuft die alte Version weiter, es gibt keinen erzwungenen Reload. Fehlende Skript-Chunks eines alten Tabs (`ChunkLoadError`) fängt `app/error.tsx` ab: einmal neu laden, dann Fehlerseite.

## Web Push

Erinnerungen als Push-Nachricht (Prüfungstermin, fällige Wiederholungen, Lernserie in Gefahr), zusätzlich zur E-Mail (`npm run exams:remind`).

- **Opt-in.** Das Abo entsteht nur, wenn die Person unter `/account` auf „Auf diesem Gerät benachrichtigen“ klickt; erst dann fragt der Browser nach der Berechtigung. Ohne Klick wird nie gefragt. Die drei Arten sind einzeln abschaltbar (gilt für alle Geräte), „Test senden“ zeigt, dass es ankommt. Beim Abmelden wird das Abo des Geräts beendet (`lib/client/use-sign-out.ts`), mit dem Konto verschwinden alle (CASCADE).
- **Einrichtung.** `npm run push:keys` erzeugt ein VAPID-Schlüsselpaar; `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` und `VAPID_SUBJECT` (eine Adresse des Betreibers) in die `.env`, `docker-compose.yml` reicht sie durch. Der private Schlüssel ist geheim und gehört nicht ins Repository. Ohne Schlüssel sagt die Karte „nicht eingerichtet“, die Schnittstellen antworten 503.
- **Versand.** Stündlich per Cron: `npm run push:remind` (z. B. `0 * * * * cd /pfad/zur/app && npm run push:remind`; in Docker `docker compose exec app npm run push:remind`). Ein verpasster Lauf holt sich im Zeitfenster von drei Stunden nach; Doppelte verhindert die Tabelle `push_deliveries`.
- **Wann.** Prüfungstermin, Voucher und Wiederholungsversuch: dieselben Anlässe wie bei der E-Mail, einmal je Plan und Art, nur tagsüber (9 bis 20 Uhr Ortszeit). Fällige Wiederholungen (ab 3 Fragen) und gefährdete Lernserie (ab 3 Tagen, nur wenn die Serie unter „Wie ich lerne“ eingeschaltet ist): höchstens **eine** Nachricht am Tag, nur wenn heute noch nicht gelernt wurde, die Serie hat Vorrang. Die Uhrzeit und die Lerntage kommen aus der Wiederholungsplanung (PSRP-HR): Median der lokalen Stunde der Reviews der letzten 60 Tage (ins Fenster 8 bis 21 Uhr geschoben, ohne Daten 18 Uhr), Wochentage mit mindestens zwei Lerntagen (bei wenig Daten jeder Tag), in der Zeitzone der Person (`users.timezone`).
- **Sicherheit.** Der Server schickt nur an Adressen von Push-Diensten der Browser (Allowlist in `lib/server/push/config.ts`, nur https, Port 443, keine Zugangsdaten; weitere über `PUSH_ALLOWED_HOSTS`), damit niemand den Server zu internen Adressen lenken kann. Die Nachrichten sind nach RFC 8291 verschlüsselt, ihr Inhalt ist knapp gehalten (Kursname, Zahlen). Der Service Worker prüft den Inhalt und öffnet nur Pfade der eigenen App (`lib/pwa/push-payload.ts`). Schnittstellen verlangen Anmeldung und sind je Person begrenzt.
- **CSP.** Geprüft: `connect-src 'self'` genügt (der Service Worker nutzt `PushManager`; nur die eigenen Schnittstellen unter `/api/push` werden aufgerufen), `worker-src 'self' blob:` deckt den Service Worker ab. Es war keine Änderung nötig.
- **iOS.** Push gibt es nur für zum Home-Bildschirm hinzugefügte Apps (ab iOS 16.4); die Einstellungen zeigen den Hinweis.
- **Nicht in der Pipeline getestet:** die Zustellung über einen echten Push-Dienst (FCM, Mozilla, Apple). Tests laufen mit einem Fake-Sender; der Weg bis zum Gerät braucht einen Versuch auf einem echten Gerät.

## Tests

- **Unit**: `npm test` (Vitest) deckt die reinen Teile ab (`lib/pwa`, `lib/client/*.test.ts`).
- **E2E** (`e2e/`, Playwright gegen den Produktions-Build): `npm run build && npm run test:e2e`. Braucht eine migrierte Postgres-Datenbank (`E2E_DATABASE_URL` oder `DATABASE_URL`); `e2e/global-setup.ts` legt Testnutzer und einen kleinen Kurs an. Der Next-Server wird von Playwright gestartet (Port 3100).
  - `offline-flow.spec.ts`: herunterladen → offline → `/offline` → Lektion + Quiz → online → Sync.
  - `background-sync.spec.ts`: Lektionstest offline, Seite zu, Netz an → der Service Worker überträgt (Headless-Chromium hat Background Sync abgeschaltet, der `sync`-Handler wird per DevTools-Protokoll angestoßen).
  - `leave-flush.spec.ts`: Ergebnis offline, Seite in den Hintergrund, Netz an → das Ereignis ist ohne erneutes Öffnen auf dem Server (`keepalive`).
  - `revoked-package.spec.ts`: Zugriff entzogen → Paket beim nächsten Online-Start gelöscht; ohne Netz bleibt es.
  - `install.spec.ts`: iOS-Anleitung im Dashboard, nach „Nicht jetzt“ 30 Tage Ruhe.
  - `update-flow.spec.ts`: Update-Toast nach neuem Worker, kein Reload ohne Klick.
  - `cache-privacy.spec.ts`: Admin-/Firmenseiten nie im Cache; Nutzerwechsel und Logout leeren den Seiten-Cache.
  - Die Tests laufen über ein schaltbares Gateway (`e2e/gateway.ts`), weil Playwrights `setOffline` Anfragen des Service Workers nicht sperrt.
- **Lighthouse**: `npm run lighthouse` prüft die Best-Practices-Punktzahl der Login-Seite gegen den laufenden Server. In CI nur als Warnung (`continue-on-error`).

## Bekannte iOS-/Safari-Einschränkungen

- Safari kann IndexedDB und Caches einer Website nach etwa sieben Tagen ohne Nutzung löschen, außer die App ist zum Home-Bildschirm hinzugefügt. Deshalb zeigt der Offline-Manager den Speicherstatus und empfiehlt die Installation.
- `navigator.storage.persist()` wird auf iOS oft verweigert oder ignoriert; die Anzeige „Speicher dauerhaft gesichert“ erscheint dann nicht.
- Background Sync gibt es dort nicht; Web Push nur für zum Home-Bildschirm hinzugefügte Apps ab iOS 16.4 (siehe Abschnitt „Web Push“). Die Synchronisation läuft beim Öffnen der App.
- Der Install-Hinweis (`beforeinstallprompt`) existiert nur auf Chromium; auf iOS gibt es nur den manuellen Weg über „Teilen → Zum Home-Bildschirm“. `components/InstallBanner.tsx` zeigt dort in Safari die Anleitung; „Nicht jetzt“ pausiert den Hinweis 30 Tage (`lib/pwa/install.ts`), `appinstalled` wird lokal festgehalten.
