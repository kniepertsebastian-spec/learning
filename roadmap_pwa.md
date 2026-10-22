# Entwicklungs-Roadmap: PWA-Härtung

Technischer Umsetzungsplan, mit dem ProofPath zu einer belastbaren, gut installierbaren PWA wird. Das Dokument ist für die Umsetzung durch einen Coding-Agenten geschrieben und setzt kein Vorwissen aus anderen Dokumenten voraus. Grundlage ist ein Review des Stands vom 22.10.2026 (`main`, nach PR #115).

---

## Kontext

Die Plattform ist eine Next.js-16-App mit Serwist (`@serwist/next`). Vorhanden sind:

- Service Worker `app/sw.ts`: Precache, `NetworkOnly` für `/api/*`, `NetworkFirst` (3 s) für Navigationen, `StaleWhileRevalidate` für statische Assets, alles im Cache `ui-cache`
- `public/manifest.json`, Icons 192/512 (`scripts/generate-icons.mjs`)
- Offline-Kurspakete in IndexedDB (`lib/client/offline-db.ts`, `offline-download.ts`), Offline-Leser unter `/cert/[id]/offline` (`components/OfflinePackageManager.tsx`)
- Sync-Warteschlange für offline erzeugten Lernfortschritt (`lib/client/sync-queue.ts`, `components/SyncStatusBadge.tsx`)
- Aufräumen beim Logout (`lib/client/clear-local-data.ts`)
- Nonce-CSP in `proxy.ts` / `lib/server/csp.ts` (`worker-src 'self' blob:`, `manifest-src 'self'`)

**Hinweis:** Vor jeder Änderung an Next.js-Konfiguration oder Routing die passende Anleitung in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`). Für Serwist-Optionen die Typen in `node_modules/@serwist/next` bzw. `node_modules/serwist` prüfen.

## Architektur-Regeln (verbindlich)

1. **Lernfortschritt geht nie verloren.** Nichts darf eine laufende Session oder die Sync-Warteschlange verwerfen: weder Reload, Update noch Speicherbereinigung.
2. **API-Antworten bleiben ungecacht.** Offline-Daten liegen ausschließlich in IndexedDB, nicht im Service-Worker-Cache.
3. **Kein Fremdzugriff auf Nutzerdaten über den Cache.** Seiten aus Admin- und Firmenbereich werden nicht gecacht. Gecachte Seiten gehören immer genau einem Nutzer.
4. **Progressive Enhancement.** Jede neue Browser-API (Background Sync, Push, `storage.persist`, Install-Prompt) wird per Feature-Detection genutzt, mit funktionierendem Rückfall, insbesondere für iOS/Safari.
5. **Zweisprachig (de/en)**, wie der Rest der Plattform.

## Platzhalter-Entscheidungen

| Punkt | Standardwert |
|---|---|
| Route der Offline-Fallback-Seite | `/~offline` |
| Route „Meine Offline-Kurse“ | `/offline` |
| Max. Einträge Seiten-Cache | 50 |
| Max. Alter Seiten-Cache | 14 Tage |
| Max. Einträge Asset-Cache | 200 |
| Max. Alter Asset-Cache | 30 Tage |
| Update-Verhalten | Toast „Neue Version verfügbar“, Aktivierung erst nach Klick |
| Install-Hinweis erneut zeigen nach Ablehnung | 30 Tage |
| Web Push | eigene Phase, optional (Phase 6) |

---

## Phase 1 – Datenverlust verhindern (Priorität: hoch)

- [ ] `reloadOnOnline: false` in `withSerwistInit` (`next.config.ts`) setzen, damit ein Netzwechsel keine laufende `StudySession` per Reload beendet
- [ ] `navigator.storage.persist()` beim ersten erfolgreichen Offline-Download anfragen (`lib/client/offline-download.ts`); Ergebnis über `navigator.storage.persisted()` prüfen
- [ ] In `OfflinePackageManager` den Speicherstatus anzeigen: belegt/verfügbar via `navigator.storage.estimate()` und ob der Speicher dauerhaft ist; wenn nicht, ein Hinweis (iOS: „App installieren, damit Offline-Daten erhalten bleiben“)
- [ ] Ausstehende Sync-Ereignisse beim Logout nicht stillschweigend löschen: vor `clearLocalUserData` synchronisieren versuchen; gelingt das nicht, warnen („X Lernergebnisse noch nicht übertragen“) und den Nutzer entscheiden lassen

**Akzeptanzkriterium:** Offline begonnene Session → Netz an/aus → Session läuft ohne Reload weiter, das Ergebnis landet in der Warteschlange und wird synchronisiert. Tests decken den Logout mit ausstehenden Ereignissen ab.

---

## Phase 2 – Offline-Navigation (Priorität: hoch)

- [ ] Offline-Fallback-Seite `/~offline` anlegen (statisch, ohne DB- oder Session-Zugriff) und über Serwist `fallbacks` für `request.destination === "document"` einbinden; die Seite muss im Precache landen
- [ ] Seite `/offline` „Meine Offline-Kurse“: rein clientseitig, liest alle Pakete des zuletzt angemeldeten Nutzers aus IndexedDB (`listOfflinePackages`) und öffnet den Offline-Leser. Precachen.
- [ ] Offline-Leser von der serverseitigen Route lösen: `/cert/[id]/offline` braucht heute `auth()` und DB, lädt also offline nur, wenn die Seite zufällig im Cache liegt. Der Leser muss aus `/offline` heraus ohne Server funktionieren (z. B. `/offline?cert=<id>` oder Client-Route).
- [ ] Die User-ID für den Offline-Fall clientseitig vorhalten (z. B. `localStorage` „zuletzt angemeldet“), damit `/offline` ohne Session weiß, welche Pakete gezeigt werden. Beim Logout entfernen.
- [ ] Offline-Navigation: Ist `navigator.onLine === false`, führen Links zu Offline-Zielen eine harte Navigation aus, damit nicht RSC-Requests ins Leere laufen. Zentraler Hinweisbalken „Du bist offline – zu deinen Offline-Kursen“ in der `AppShell` (`lib/client/use-online-status.ts` existiert bereits).
- [ ] Die Fallback-Seite verlinkt auf `/offline`

**Akzeptanzkriterium:** Installierte App im Flugmodus starten → `/offline` bzw. Fallback erscheint → heruntergeladenen Kurs öffnen → Lektion lesen und Quiz abschließen → Ergebnis in der Warteschlange. Funktioniert auch, wenn vorher keine Seite außer dem Download besucht wurde.

---

## Phase 3 – Caching & Updates (Priorität: mittel)

- [ ] Seiten und Assets in getrennte Caches aufteilen (`pages-cache`, `assets-cache`), jeweils mit `ExpirationPlugin` (Werte siehe Platzhalter). `clearLocalUserData` löscht `pages-cache`.
- [ ] Navigationen unter `/admin` und dem Firmenbereich vom Seiten-Cache ausnehmen (`NetworkOnly`)
- [ ] Wechselt der angemeldete Nutzer (Login mit anderer ID als „zuletzt angemeldet“), Seiten-Cache leeren, auch bei abgelaufener Session ohne aktiven Logout
- [ ] Update-Fluss: `skipWaiting: false`; Client-Komponente lauscht auf einen wartenden Service Worker (`serwist`-Window-Events oder `registration.waiting`) und zeigt per Sonner-Toast „Neue Version verfügbar – neu laden“. Klick sendet `SKIP_WAITING`, danach Reload bei `controllerchange`. Während einer aktiven Session keinen Reload erzwingen.
- [ ] `ChunkLoadError` abfangen (Error-Boundary): einmalig neu laden statt Fehlerseite

**Akzeptanzkriterium:** Nach einem Deploy sieht ein offener Tab den Update-Toast; ohne Klick bleibt die alte Version funktionsfähig. Admin-Seiten tauchen nie in einem Cache auf (Test über Cache-Inspektion im Playwright-Test).

---

## Phase 4 – Manifest, Icons, iOS (Priorität: mittel)

- [ ] Manifest ergänzen: `id: "/"`, `lang`, `dir: "ltr"`, `categories: ["education", "productivity"]`, `orientation` weglassen oder `any`
- [ ] `screenshots` ergänzen: mind. 1× `form_factor: "wide"` und 1× `"narrow"`, damit Chrome den ausführlichen Installationsdialog zeigt
- [ ] `shortcuts`: „Heute wiederholen“, „Meine Offline-Kurse“ (`/offline`), „Prüfungsplan“
- [ ] Icons neu im aktuellen Branding: getrennte Einträge `purpose: "any"` und `purpose: "maskable"` (kein kombiniertes `"any maskable"`), maskable mit Safe-Zone (80 %). Zusätzlich SVG-Favicon, `favicon.ico` erneuern. `scripts/generate-icons.mjs` entsprechend anpassen oder durch echte Assets ersetzen.
- [ ] `theme_color`/`background_color` im Manifest an das Theme angleichen (aktuell `#0f172a` vs. `#0A0C10`/`#F6F7F9` im Viewport)
- [ ] iOS: `apple-touch-icon` 180×180 ohne Transparenz; Startbilder (`apple-touch-startup-image`) für gängige Geräte über `metadata.appleWebApp.startupImage`
- [ ] Statusleiste: entweder `viewportFit: "cover"` plus `env(safe-area-inset-*)`-Abstände in `AppShell`/Header/Bottom-Navigation, oder `statusBarStyle: "default"`. Heute laufen Inhalte bei `black-translucent` unter die Statusleiste.
- [ ] `<html lang>` aus der Server-Locale setzen statt fest `"en"`

**Akzeptanzkriterium:** Lighthouse/Chrome DevTools „Manifest“ ohne Warnungen; installierte App auf iPhone mit Notch zeigt keine verdeckten Bedienelemente.

---

## Phase 5 – Installation & Hintergrund-Sync (Priorität: mittel)

- [ ] Install-Hinweis: `beforeinstallprompt` abfangen und einen eigenen Button/Banner zeigen (z. B. im Dashboard und beim Offline-Download). Nach Ablehnung 30 Tage pausieren. `appinstalled` erfassen.
- [ ] iOS-Anleitung („Teilen → Zum Home-Bildschirm“) zeigen, wenn Safari auf iOS und nicht `display-mode: standalone`
- [ ] Background Sync: Bei neuem Eintrag in der Warteschlange `registration.sync.register("sync-queue")` registrieren; der Service Worker arbeitet die Warteschlange im `sync`-Event direkt aus IndexedDB ab. Dafür die Sync-Logik aus `sync-queue.ts` in ein vom Window unabhängiges Modul ziehen, das SW und Seite gemeinsam nutzen. Rückfall: bisheriges `online`-Event.
- [ ] Auth im Service Worker prüfen: Sync-Requests laufen mit Cookies (same-origin); bei 401 Ereignisse behalten und Status „Anmeldung nötig“ setzen

**Akzeptanzkriterium:** Chrome/Android: Quiz offline abschließen, App schließen, Netz an → Ereignis wird ohne erneutes Öffnen übertragen. iOS: Übertragung beim nächsten Öffnen wie bisher.

---

## Phase 6 – Erinnerungen per Push (optional)

- [ ] Web Push (VAPID) für Prüfungs- und Wiederholungserinnerungen als Ergänzung zu `exams:remind` (E-Mail). Abo-Tabelle pro Gerät, Opt-in in den Einstellungen, Abmeldung beim Logout.
- [ ] Erinnerungszeitpunkte aus der PSRP-HR-Planungsschicht ableiten (Tageszeit, Arbeitstag), siehe `roadmap_psrp_hr.md`
- [ ] Hinweis: Auf iOS nur für installierte PWAs (ab iOS 16.4) verfügbar
- [ ] CSP prüfen (`connect-src` für Push-Dienste ist nicht nötig, der SW nutzt `PushManager`)

**Akzeptanzkriterium:** Nutzer mit Opt-in erhält eine Erinnerung zur geplanten Zeit; ohne Opt-in wird keine Push-Berechtigung angefragt.

---

## Phase 7 – Tests & Qualitätssicherung

- [ ] Playwright-E2E gegen den Produktions-Build (SW ist im Dev deaktiviert): Kurs herunterladen → offline → `/offline` → Lektion + Quiz → online → Sync erfolgreich
- [ ] Test: Update-Toast erscheint nach neuem SW-Build, kein erzwungener Reload während einer Session
- [ ] Test: Admin-/Firmenseiten landen nicht im Cache; Logout bzw. Nutzerwechsel leert den Seiten-Cache
- [ ] Lighthouse-PWA-/Best-Practices-Check in CI (Warnschwelle, kein harter Fehler)
- [ ] Kurze Doku `docs/PWA.md`: Caching-Strategie, Offline-Fluss, Update-Fluss, bekannte iOS-Einschränkungen

**Akzeptanzkriterium:** Die E2E-Tests laufen in CI grün.

---

## Reihenfolge

1. Phase 1 und 2 zusammen: Sie schließen die Lücken, durch die heute Lernfortschritt verloren gehen kann oder Offline gar nicht erreichbar ist.
2. Phase 3: Datenschutz im Cache und saubere Updates.
3. Phase 4 und 5: Installations-Erlebnis, wichtig für Vertrieb und Firmenkunden.
4. Phase 7 begleitend, spätestens nach Phase 3.
5. Phase 6 nach Bedarf, sinnvoll zusammen mit PSRP-HR.
