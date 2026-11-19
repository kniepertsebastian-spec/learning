# PWA-Review: learning (Knowvia)

**Umfang:** Commit `c0f8caa3` auf `main`. Stack: Next.js 16.4.5 (webpack), Serwist 9, Auth.js v5 (JWT), Drizzle/Postgres, Docker + Cloudflare Tunnel. Geprüft habe ich gezielt 211 API-Routen (Guards per Grep, Stichproben auf IDOR), 61 Seiten, Service Worker und Cache-Regeln, Offline-Sync, Push, SSO, Wiederherstellung von Konten, Uploads, CSP und Header, Dockerfile, Compose, CI und Proxy-Beispiele.
**Ergebnis:** Die Anwendung ist insgesamt stark gehärtet. Guards, Mandantentrennung und Cache-Trennung sind durchgängig umgesetzt. Die Restrisiken liegen vor allem im Betrieb: ein Speicherleck im Rate-Limiter, das sich ohne Anmeldung auslösen lässt, Secrets im Docker-Image und fälschbare Client-IPs bei den Proxy-Beispielen. Kritisch: 0 · Hoch: 1 · Mittel: 2 · Niedrig: 3 · Hinweis: 1

## Befunde

| # | Schwere | Bereich | Titel | Ort |
|---|---------|---------|-------|-----|
| 1 | Hoch | Security/Betrieb | Rate-Limit-Speicher wächst ohne Grenze, Login-E-Mail ohne Längengrenze: Speicher-DoS ohne Anmeldung | `lib/server/admin/rate-limit.ts:5`, `lib/server/auth-rate-limit.ts:37`, `lib/server/auth.ts:36` |
| 2 | Mittel | Security/Container | `.env` mit allen Secrets landet im Docker-Image | `.dockerignore:4-5`, `Dockerfile:10`, `Dockerfile:32`, `next.config.ts:20` |
| 3 | Mittel | Security/Betrieb | Caddy- und nginx-Beispiel reichen einen gefälschten `CF-Connecting-IP` durch, damit sind alle IP-Limits umgehbar | `deploy/Caddyfile:17-22`, `deploy/nginx.conf.example:27`, `lib/server/auth-rate-limit.ts:20-22` |
| 4 | Niedrig | Security | Größenlimits verlassen sich nur auf `Content-Length` | `app/api/sync/route.ts:23`, `app/api/company/documents/route.ts:37` u. a. |
| 5 | Niedrig | PWA/Datenschutz | Logout-Dialog meldet Datenverlust, die Warteschlange bleibt aber unverschlüsselt auf dem Gerät | `lib/client/use-sign-out.ts:24`, `lib/client/offline-db.ts:178` |
| 6 | Niedrig | Validierung | Name bei der Registrierung ohne Längenbegrenzung | `app/api/register/route.ts:20` |
| 7 | Hinweis | Security | Logout macht das JWT nicht serverseitig ungültig | `app/actions/auth.ts:25`, `lib/server/auth.ts:16` |

## Details

### 1. Rate-Limit-Speicher wächst ohne Grenze (Hoch · Security/Betrieb)
- **Ort:** `lib/server/admin/rate-limit.ts:5`, `:26`, `:39`; `lib/server/auth-rate-limit.ts:37-38`; `lib/server/auth.ts:29-36`
- **Problem:** `checkRateLimit` legt für jedes neue `bucket:key` einen Eintrag in einer prozessweiten `Map` an und entfernt ihn nie. Abgelaufene Zeitstempel werden nur beim erneuten Zugriff auf denselben Schlüssel gefiltert. Beim Login ist der Schlüssel die vom Client gesendete E-Mail (`normalizeEmail` = `trim().toLowerCase()`, keine Längenprüfung). Außerdem wird `byEmail` vor `byIp` geprüft und dabei auch dann gespeichert, wenn die IP schon gesperrt ist.
- **Auslöser/Szenario:** Ein Angreifer ohne Konto schickt Login-Versuche mit immer neuen und sehr langen E-Mail-Strings (bis zur Body-Grenze, z. B. etwa 1 MB über die Server Action). Jeder Versuch bleibt dauerhaft im Heap, auch nach der IP-Sperre. Einige tausend Anfragen reichen für einen OOM der einzigen App-Instanz. Laut Compose ist bewusst nur eine Instanz vorgesehen, die Plattform fällt also für alle Nutzer aus.
- **Empfehlung:** E-Mail in `authorize` auf höchstens 254 Zeichen begrenzen, wie schon in `sso/start` und `forgot-password`. Leere bzw. abgelaufene Einträge in `checkRateLimit` löschen, z. B. per periodischem Sweep, und die Map zusätzlich in der Größe begrenzen. Das E-Mail-Limit nur zählen, wenn das IP-Limit nicht greift.

### 2. `.env` landet im Docker-Image (Mittel · Security/Container)
- **Ort:** `.dockerignore:4-5` (schließt nur `.env*.local` und `.env.local` aus), `Dockerfile:10` (`COPY . .`), `Dockerfile:32` (`COPY --from=builder /app/.next ./.next`), `next.config.ts:20` (`output: "standalone"`)
- **Problem:** Die `.env` im Build-Kontext wird in die Builder-Stage kopiert. `next build` mit `output: "standalone"` kopiert sie zusätzlich nach `.next/standalone/.env`. Das ist lokal belegt: `.next/standalone/.env` existiert. Die Runtime-Stage übernimmt `.next` vollständig. Damit liegen `AUTH_SECRET`, `DB_PASSWORD`, `GEMINI_API_KEY`, `APP_ENCRYPTION_KEY`, `VAPID_PRIVATE_KEY` und `TUNNEL_TOKEN` als Datei im fertigen Image und in den Layern des Builders.
- **Auslöser/Szenario:** Wird das Image exportiert (`docker save`), in eine Registry gepusht, gesichert oder an Dritte weitergegeben, sind alle Secrets lesbar. Mit `AUTH_SECRET` lassen sich beliebige Sessions fälschen.
- **Empfehlung:** `.env` und `.env*` in `.dockerignore` aufnehmen und `.env.example` ausdrücklich erlauben. Die Werte kommen ohnehin über `environment:` in Compose.

### 3. Proxy-Beispiele reichen `CF-Connecting-IP` durch (Mittel · Security/Betrieb)
- **Ort:** `deploy/Caddyfile:17-22`, `deploy/nginx.conf.example:27` (auskommentiert), `lib/server/auth-rate-limit.ts:20-22`
- **Problem:** `clientIp()` vertraut zuerst `cf-connecting-ip`. Der Kommentar im Caddyfile sagt, das sei nur sicher, solange Caddy ausschließlich über den Tunnel erreichbar ist. Dieselbe Datei beschreibt aber in Zeilen 4-9 einen direkt öffentlichen Betrieb: Let's Encrypt automatisch, DNS-A-Record zeigt auf den Server. Genau in diesem Fall fehlt `header_up -CF-Connecting-IP`. Im nginx-Beispiel (`listen 443 ssl`, certbot) ist die Abwehr nur auskommentiert.
- **Auslöser/Szenario:** Wird eine der Konfigurationen wie ausgeliefert verwendet, setzt ein Angreifer pro Anfrage einen zufälligen `CF-Connecting-IP`. Damit sind die IP-Limits für Login, Registrierung, Passwort-Reset und Firmenbestätigung wirkungslos. Die Limits pro E-Mail bleiben bestehen.
- **Empfehlung:** In beiden Beispielen das Entfernen des Headers aktiv setzen (Caddy: `header_up -CF-Connecting-IP`, nginx: Zeile einkommentieren). Für den Tunnel-Betrieb ist das unschädlich, weil Cloudflare den Header ohnehin setzt.

### 4. Größenlimits nur über `Content-Length` (Niedrig · Security)
- **Ort:** `app/api/sync/route.ts:23`, `app/api/company/documents/route.ts:37`, `app/api/company/documents/[id]/images/route.ts:35`, `app/api/reviewer/profile/photo/route.ts:26`, `app/api/internal-courses/route.ts:67`
- **Problem:** Fehlt der Header (chunked Upload), ergibt `Number(null)` den Wert `0` und die Prüfung greift nicht. Danach puffern `request.json()` bzw. `request.formData()` den ganzen Body. Die eigentliche Größenprüfung kommt erst danach.
- **Auslöser/Szenario:** Ein angemeldeter Nutzer schickt chunked einen Body bis zur Grenze von Cloudflare (etwa 100 MB) und belegt damit pro Anfrage entsprechend Speicher. Die Wirkung ist begrenzt, weil eine Anmeldung nötig ist und Uploads pro Nutzer begrenzt sind.
- **Empfehlung:** Ohne `Content-Length` mit 411 antworten oder den Stream mit Obergrenze lesen.

### 5. Logout-Dialog stimmt nicht mit der Datenhaltung überein (Niedrig · PWA/Datenschutz)
- **Ort:** `lib/client/use-sign-out.ts:24`, `lib/client/clear-local-data.ts`, `lib/client/offline-db.ts:178-193`
- **Problem:** Der Dialog sagt, die Ergebnisse „gehen beim Abmelden verloren“. `clearOfflineDataForUser` löscht aber nur die Pakete, nicht `pendingSyncEvents`. Die Antworten bleiben unverschlüsselt in IndexedDB und werden erst bei der nächsten Anmeldung derselben Person übertragen.
- **Auslöser/Szenario:** Auf einem geteilten Gerät bleiben die offline gegebenen Antworten der abgemeldeten Person liegen. Gleichzeitig bricht die Person den Logout womöglich unnötig ab, weil sie Datenverlust fürchtet.
- **Empfehlung:** Den Text an das tatsächliche Verhalten anpassen („bleiben auf diesem Gerät und werden bei deiner nächsten Anmeldung übertragen“). Alternativ eine echte Wahl anbieten: behalten oder verwerfen.

### 6. Name ohne Längenbegrenzung (Niedrig · Validierung)
- **Ort:** `app/api/register/route.ts:20` (`name: z.string().min(1).optional()`), Spalte `users.name` ist `text`
- **Problem/Szenario:** Eingeladene Personen können einen beliebig langen Namen speichern. Er erscheint in Zertifikaten (PDF), Firmenlisten und E-Mails, was dort Layout und Darstellung stören kann.
- **Empfehlung:** `.trim().max(200)` ergänzen, so wie es der SSO-Pfad schon macht. Quick Win.

### 7. Logout macht das JWT nicht ungültig (Hinweis · Security)
- **Ort:** `app/actions/auth.ts:25`, `lib/server/auth.ts:16` (kein `maxAge`, also Auth.js-Standard von 30 Tagen)
- **Beobachtung:** `sessionVersion` steigt nur bei Passwortwechsel, Reset und SSO-Verknüpfung. Ein vor dem Logout kopiertes Session-Cookie bleibt bis zum Ablauf gültig, und ein „Überall abmelden“ gibt es nicht. Das ist bei JWT-Sessions üblich. Wenn gewünscht, `sessionVersion` beim Logout erhöhen (das beendet dann alle Geräte) oder `maxAge` verkürzen.

## Positiv aufgefallen
- Nonce-CSP mit `strict-dynamic`, ohne `unsafe-inline` für Skripte, mit `frame-ancestors 'none'`. Eine Basis-CSP gilt zusätzlich für die vom Proxy ausgenommenen Routen (`lib/server/csp.ts`, `next.config.ts`).
- Die Rolle wird bei jeder Anfrage frisch aus der DB geladen (`getCurrentUser`). Sitzungen werden bei Passwortwechsel und Reset über `sessionVersion` beendet.
- Alle 211 API-Routen haben einen Guard oder sind bewusst öffentlich und dann token- oder rate-limit-geschützt. Die Werkstatt-Routen prüfen zentral in `workshopRoute`, und jede Abschnitts-, Fragen- und Revisions-ID wird gegen `certId` geprüft.
- Service Worker: `/api/*` und RSC laufen nur über das Netz, `/admin` und `/company` werden nicht gecacht, im Cache landen nur 200er. Der Cache gehört einem Besitzer und wird bei Nutzerwechsel geleert. `skipWaiting` geht nur über den Toast. Push-Ziele werden über `safeAppPath` geprüft.
- Sync ist idempotent (`userId, clientEventId`), lehnt fremde `userId` mit 403 ab und prüft die Sichtbarkeit jedes Ereignisses.
- Reset- und Verifizierungs-Tokens: 256 Bit, nur gehasht gespeichert, einmalig verwendbar, mit Ablauf. SSO mit PKCE, Nonce, signiertem State, verifizierten Domains und einmaligem Login-Ticket.
- Prüfungs-API liefert `isCorrect` und Erklärungen erst nach der Abgabe aus. Bild-Uploads werden per Magic Bytes geprüft. `safeRedirectPath` verhindert offene Weiterleitungen.
- Container läuft als Nicht-root-Nutzer, Postgres ohne veröffentlichten Port, App nur an `127.0.0.1` gebunden, CI mit `permissions: contents: read`.

## Automatische Checks
| Check | Ergebnis |
|-------|----------|
| npm audit (`--omit=dev`) | 9 × moderate, 0 high/critical. Alle in Build- und Migrationswerkzeugen (esbuild über drizzle-kit, glob/minimatch über @serwist/build). Die CI lässt moderate bewusst zu. |
| lint | Nicht gelaufen: `node_modules` fehlt (`eslint: not found`) |
| tsc | Nicht gelaufen: `typescript` ist nicht installiert |
| Tests | Nicht gelaufen: `node_modules` fehlt (`vitest: not found`) |

## Nicht geprüft
- **lint, tsc, Vitest, Playwright:** Im Arbeitsverzeichnis gibt es kein `node_modules`, und laut Skill-Regeln wird nichts installiert. Achtung: Weil TypeScript fehlte, hat `npx tsc --noEmit` ungefragt das fremde npm-Paket `tsc@2.0.4` in den npx-Cache geladen. Es hat nur eine Hinweismeldung ausgegeben, am Projekt hat sich nichts geändert. Wer den npx-Cache sauber halten will, kann ihn mit `npm cache clean --force` leeren.
- **Next-16-Doku** (`node_modules/next/dist/docs/`) war deshalb auch nicht verfügbar. Aussagen über Framework-Standards (z. B. Body-Limits, `Cache-Control` von Route-Handlern) habe ich nicht als Befund gewertet.
- **Laufzeitverhalten** von Service Worker, Push-Zustellung und iOS/Safari: kein Build, kein Gerät.
- **Barrierefreiheit:** nur `lang`, `viewport` und Reduced-Motion stichprobenartig. Keine Kontrastmessung, keine Tastaturprüfung.
- **DSGVO:** Export und Löschung sind vorhanden. Welche Lernenden-Texte an Gemini gehen und auf welcher Rechtsgrundlage, habe ich nicht im Detail verfolgt.
- **IDOR:** Nicht alle 211 Routen wurden einzeln gelesen, sondern Guards per Grep und Stichproben (Werkstatt, Zertifikate, Gutscheine, Exporte, Prüfungen, Dokumente, Push).

## Empfohlene Reihenfolge
1. **#1** E-Mail im Login auf 254 Zeichen begrenzen (Quick Win), danach Einträge im Rate-Limiter aufräumen.
2. **#2** `.env` in `.dockerignore` aufnehmen (Quick Win). Danach das Image neu bauen und alte Images bzw. Build-Cache entfernen. Wenn Images je weitergegeben wurden, die Secrets rotieren.
3. **#3** `CF-Connecting-IP` in Caddyfile und nginx-Beispiel entfernen (Quick Win).
4. **#6** `max(200)` für den Namen (Quick Win).
5. **#5** Logout-Text anpassen.
6. **#4** Body ohne `Content-Length` ablehnen.
7. **#7** nach Bedarf.
