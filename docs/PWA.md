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

Lernfortschritt geht nie verloren: Reload bei Netzwechsel ist abgeschaltet (`reloadOnOnline: false`), die Warteschlange wird nie still gelöscht.

## Update-Fluss

`skipWaiting` ist aus. Nach einem Deploy installiert sich der neue Service Worker und **wartet**. `ServiceWorkerManager` zeigt den Toast „Neue Version verfügbar“. Erst der Klick auf „Neu laden“ sendet `SKIP_WAITING`; beim `controllerchange` lädt die Seite neu. Ohne Klick läuft die alte Version weiter, es gibt keinen erzwungenen Reload. Fehlende Skript-Chunks eines alten Tabs (`ChunkLoadError`) fängt `app/error.tsx` ab: einmal neu laden, dann Fehlerseite.

## Tests

- **Unit**: `npm test` (Vitest) deckt die reinen Teile ab (`lib/pwa`, `lib/client/*.test.ts`).
- **E2E** (`e2e/`, Playwright gegen den Produktions-Build): `npm run build && npm run test:e2e`. Braucht eine migrierte Postgres-Datenbank (`E2E_DATABASE_URL` oder `DATABASE_URL`); `e2e/global-setup.ts` legt Testnutzer und einen kleinen Kurs an. Der Next-Server wird von Playwright gestartet (Port 3100).
  - `offline-flow.spec.ts`: herunterladen → offline → `/offline` → Lektion + Quiz → online → Sync.
  - `update-flow.spec.ts`: Update-Toast nach neuem Worker, kein Reload ohne Klick.
  - `cache-privacy.spec.ts`: Admin-/Firmenseiten nie im Cache; Nutzerwechsel und Logout leeren den Seiten-Cache.
  - Die Tests laufen über ein schaltbares Gateway (`e2e/gateway.ts`), weil Playwrights `setOffline` Anfragen des Service Workers nicht sperrt.
- **Lighthouse**: `npm run lighthouse` prüft die Best-Practices-Punktzahl der Login-Seite gegen den laufenden Server. In CI nur als Warnung (`continue-on-error`).

## Bekannte iOS-/Safari-Einschränkungen

- Safari kann IndexedDB und Caches einer Website nach etwa sieben Tagen ohne Nutzung löschen, außer die App ist zum Home-Bildschirm hinzugefügt. Deshalb zeigt der Offline-Manager den Speicherstatus und empfiehlt die Installation.
- `navigator.storage.persist()` wird auf iOS oft verweigert oder ignoriert; die Anzeige „Speicher dauerhaft gesichert“ erscheint dann nicht.
- Background Sync und Web Push gibt es dort nur eingeschränkt oder gar nicht (siehe `roadmap_pwa.md`, Phasen 5 und 6). Die Synchronisation läuft beim Öffnen der App.
- Der Install-Hinweis (`beforeinstallprompt`) existiert nur auf Chromium; auf iOS gibt es nur den manuellen Weg über „Teilen → Zum Home-Bildschirm“.
