---
name: pwa-review
description: Analysiert und reviewt die PWA im Projektverzeichnis auf Security, Code-Qualität, PWA-Spezifika (Service Worker, Caching, Offline, Manifest), Datenschutz, Performance, Barrierefreiheit und Abhängigkeiten und gibt am Ende eine nach Schweregrad sortierte Befundliste aus. Verwenden, wenn der Nutzer die PWA prüfen, auditieren oder reviewen lassen will ("PWA-Review", "Security-Check der App", "schau dir die ganze App an"). Nicht für das Review eines einzelnen Diffs oder PRs (dafür code-review).
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(git ls-files:*), Bash(git log:*), Bash(git status:*), Bash(npm audit:*), Bash(npm ls:*), Bash(npm run lint:*), Bash(npx tsc --noEmit:*), Bash(npm test:*)
---

# PWA-Review

Prüft die gesamte PWA im aktuellen Projektverzeichnis und liefert eine priorisierte Befundliste.
Das ist ein **Audit des Ist-Zustands**, kein Diff-Review. Antworte auf Deutsch.

**Regeln**

- Nur lesen und melden. Keinen Code ändern, nichts installieren, nichts committen, nichts deployen.
- Nur Befunde mit konkretem Beleg im Code (Datei + Zeile) und realistischem Auslöser. Keine generischen Best-Practice-Hinweise, keine Füllbefunde. Wenige sichere Befunde schlagen viele unsichere.
- Vor jedem Befund den Codepfad prüfen und nachsehen, ob eine vorhandene Absicherung das Problem schon verhindert (z. B. Guard in einer aufgerufenen Funktion, Middleware/Proxy, Zod-Validierung, DB-Constraint).
- Nie behaupten, ein Check sei bestanden, wenn er nicht gelaufen ist. Nicht gelaufene Checks unter „Nicht geprüft“ aufführen.
- Secrets (`.env`, Schlüssel, Tokens) nie im Bericht wiedergeben; nur Fundort nennen.
- Das Projekt nutzt ggf. eine Framework-Version mit Breaking Changes. Bevor du Framework-Verhalten bewertest, `AGENTS.md`/`CLAUDE.md` lesen und bei Zweifel die mitgelieferte Doku unter `node_modules/next/dist/docs/` konsultieren, statt aus dem Gedächtnis zu urteilen (z. B. `proxy.ts` statt `middleware.ts`).

## Ablauf

### 1. Bestandsaufnahme

1. `package.json`, `AGENTS.md`/`CLAUDE.md`, `README.md` und vorhandene Docs (z. B. `docs/PWA.md`, Security-/Deploy-Doku) lesen: Stack, Skripte, dokumentierte Entscheidungen. Dokumentierte, bewusste Abweichungen nicht als Fehler melden.
2. Mit `git ls-files` und Glob die Struktur erfassen: Routen/API-Handler, Server Actions, Auth, DB-Schema/Migrationen, Service Worker, Manifest, Konfiguration (`next.config.*`, Proxy/Middleware, Dockerfile, CI).
3. Festhalten, was es gibt und was nicht (kein Manifest? kein Service Worker? keine Tests?). Fehlendes ist selbst ein Befund, wenn es für eine PWA relevant ist.

### 2. Automatische Checks (nur wenn Skript/Tool vorhanden)

Nur ausführen, was im Projekt definiert ist, jeweils mit kurzer Notiz zum Ergebnis:

- `npm audit --omit=dev` (Laufzeit-Abhängigkeiten), Schwerpunkt `high`/`critical`
- `npm run lint`
- `npx tsc --noEmit`
- `npm test` (kann eine Datenbank brauchen; bei fehlender Umgebung als „nicht geprüft“ vermerken, nicht reparieren)

Schlägt ein Check wegen fehlender Umgebung fehl (keine DB, kein Netz), ist das kein Befund, sondern ein Eintrag unter „Nicht geprüft“. Kein `npm install`, kein Build mit Seiteneffekten.

### 3. Manuelle Analyse

Arbeite die Bereiche der Reihe nach ab. Bei großen Projekten zuerst per Grep die riskanten Stellen finden, dann gezielt lesen. Nicht das ganze Repo einlesen.

#### A. Security

- **Authentifizierung/Autorisierung:** Jeder API-Handler und jede Server Action prüft Session **und** Rolle/Besitz serverseitig. Jeden Handler unter den API-Routen und Actions auf einen Guard prüfen; ungeschützte Routen auflisten. Reine Redirects im Proxy/Middleware oder versteckte UI zählen nicht als Schutz.
- **IDOR / Mandantentrennung:** Zugriffe per ID (`params`, Body) werden gegen den eingeloggten Nutzer bzw. Mandanten gefiltert, nicht nur geladen.
- **Eingabevalidierung:** Request-Bodies, Query-Parameter, Header, hochgeladene Dateien werden validiert (Schema, Größe, Typ). Mass Assignment durch ungefiltertes Übernehmen von Body-Feldern.
- **Injection:** Rohes SQL/`sql.raw`, String-Konkatenation in Queries, Shell-/Dateipfad-Zugriffe mit Nutzereingabe (Path Traversal), SSRF bei serverseitigen Fetches auf Nutzer-URLs.
- **XSS:** `dangerouslySetInnerHTML`, ungeprüftes Markdown/HTML-Rendering, `innerHTML`, `javascript:`-URLs, Open Redirects (`from`/`redirect`-Parameter).
- **Sessions/Cookies/CSRF:** Cookie-Flags, Session-Laufzeit, CSRF-Schutz bei Mutationen, Logout/Revocation, Brute-Force-/Rate-Limiting auf Login, Registrierung, Passwort-Reset, E-Mail-Versand und teuren (KI-)Endpunkten.
- **Passwörter/Krypto:** Hashing-Verfahren und Parameter, Reset-/Verifizierungs-Token (Zufälligkeit, Ablauf, Einmalverwendung, Speicherung gehasht), Verschlüsselung gespeicherter Nutzer-Schlüssel, `Math.random` für Sicherheitszwecke, Timing-sichere Vergleiche.
- **Secrets:** Hartcodierte Schlüssel/Tokens im Code oder in der Git-Historie (`git log -S` nur gezielt), `.env` getrackt, `NEXT_PUBLIC_*` mit sensiblen Werten, Secrets in Logs oder Fehlermeldungen, Secrets im Dockerfile/Compose/CI.
- **HTTP-Header:** CSP (Nonce, `unsafe-inline`/`unsafe-eval`, `frame-ancestors`, `connect-src`, `worker-src`), HSTS (Dauer, `includeSubDomains`), `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy, CORS-Konfiguration. Prüfen, ob Routen vom Header-Schutz ausgenommen sind (Matcher).
- **Informationsleck:** Detaillierte Fehlermeldungen, Stacktraces an den Client, User-Enumeration über unterschiedliche Antworten bei Login/Reset/Registrierung, Health-/Debug-Endpunkte ohne Schutz.
- **Container/CI:** Dockerfile läuft als root, unnötige Pakete, Secrets in Image-Layern, CI-Workflow mit zu weiten Rechten oder untrusted Input in `run:`-Schritten, nicht gepinnte Actions.

#### B. PWA-Spezifika

- **Service Worker:** Lebenszyklus (`install`/`activate`, `skipWaiting`, `clients.claim`), Update-Fluss, Verhalten bei kaputtem/altem SW, Scope und Registrierung, Fehlerbehandlung bei Fetch-Fehlern.
- **Caching-Strategien:** Pro Route-Typ prüfen, ob die Strategie passt. **Authentifizierte, nutzerbezogene oder sensible Antworten** (API-JSON, Session, Profil, Lerninhalte, Bezahldaten) dürfen nicht in gemeinsam genutzten oder dauerhaften Caches landen, und nicht über einen Nutzerwechsel hinweg sichtbar bleiben. Cache wird bei Logout geleert? Nur GET cachen, keine Mutationen. `Vary`/`Cache-Control` beachtet?
- **Offline/Sync:** Verhalten bei Netzverlust und Rückkehr, Offline-Fallback-Seite, Warteschlange für Schreibvorgänge (Idempotenz, Duplikate, Reihenfolge, Konfliktbehandlung, Datenverlust bei Fehlern), lokale Speicher (IndexedDB/localStorage/Cache Storage): welche Daten liegen unverschlüsselt auf dem Gerät, gibt es Ablauf und Löschung bei Logout?
- **Cache-Invalidierung:** Revisionen/Versionierung der Precache-Einträge, veraltete Assets nach Deploy, Versionsmismatch zwischen alter Client-Shell und neuer API.
- **Manifest:** `name`/`short_name`, `start_url`, `scope`, `display`, `id`, `theme_color`/`background_color`, Icons (192/512, maskable), Screenshots, Shortcuts; stimmen die Dateien tatsächlich (Existenz, Größe)?
- **Web Push:** VAPID-Schlüssel-Handhabung, Abo-Verwaltung (Ablauf, Löschung bei 404/410, Besitzprüfung beim Abmelden), Inhalt der Benachrichtigungen (keine sensiblen Daten), Klick-URL-Validierung.
- **Plattform:** Bekannte iOS-/Safari-Grenzen (Speicherlimits, Push-Voraussetzungen, fehlendes `beforeinstallprompt`), Installierbarkeit, Safe-Area, Orientierung.

#### C. Code-Qualität und Korrektheit

- **Fehlerbehandlung:** Verschluckte Fehler (`catch {}`), fehlendes `await`, unbehandelte Promise-Rejections, fehlende Error-Boundaries, fehlende Statuscodes.
- **Datenintegrität:** Mehrstufige Schreibvorgänge ohne Transaktion, Race Conditions (Check-then-act), fehlende Unique-Constraints/Fremdschlüssel/Indizes, Migrationen, die Daten zerstören oder nicht rückwärtskompatibel sind, doppelte Verarbeitung bei Retries.
- **Logikfehler:** Falsy-Null-Prüfungen, Off-by-one, Zeitzonen-/Datumsfehler, Rundung, Vergleich von Strings/Zahlen, nicht-deterministische Tests.
- **Client/Server-Grenze:** Server-only-Code im Client-Bundle, Hydration-Fehler, unnötiges `"use client"`, Browser-APIs ohne Existenzprüfung (SSR).
- **Typsicherheit:** `any`, unsichere Casts auf Request-Daten, `@ts-ignore`/`eslint-disable` ohne Begründung an kritischen Stellen.
- **Wartbarkeit nur bei Substanz:** Stark duplizierte Logik oder tote Pfade nur melden, wenn sie ein konkretes Risiko erzeugen (z. B. Guard wurde nur in einer von drei Kopien ergänzt).
- **Tests:** Fehlende Tests nur melden, wenn ein sicherheits- oder datenkritischer Pfad (Auth, Berechtigungen, Sync, Zahlungen/Zertifikate) ungetestet ist.

#### D. Performance

- Große Client-Bundles, schwere Abhängigkeiten im Client, fehlendes Code-Splitting, ungeoptimierte Bilder/Fonts.
- N+1-Queries, unbeschränkte Listen ohne Paginierung, fehlende Indizes bei häufigen Filtern, teure Berechnungen im Request-Pfad.
- Unnötige Netzwerkaufrufe, fehlendes Debouncing, Polling statt Push, fehlendes Caching serverseitiger Daten.
- Nur melden, wenn die Wirkung für Nutzer plausibel spürbar ist.

#### E. Barrierefreiheit und Nutzbarkeit

- Semantik und ARIA, Tastaturbedienung, Fokusführung (Dialoge, Routenwechsel), Beschriftung von Formularfeldern und Icon-Buttons, Kontraste (vorhandene Skripte/Doku nutzen), `lang`-Attribut, Reduced-Motion, Zoomfähigkeit (`viewport` ohne `user-scalable=no`), Touch-Zielgrößen.
- Mobile Nutzbarkeit: Layout bei schmalen Viewports, Safe-Area, Offline-/Fehlerzustände sind für Nutzer verständlich.

#### F. Datenschutz (DSGVO-relevant)

- Welche personenbezogenen Daten werden erhoben, gespeichert, geloggt, an Dritte (z. B. KI-Anbieter, Mail, Analytics) übertragen? Gibt es Export, Löschung, Einwilligung, Aufbewahrungsfristen?
- Tracking/Cookies ohne Einwilligung, Drittanbieter-Ressourcen (CDN, Fonts) mit IP-Übertragung, personenbezogene Daten in URLs oder Logs.

#### G. Abhängigkeiten und Betrieb

- Ergebnis von `npm audit`, veraltete oder unmaintainte Pakete mit Sicherheitsrelevanz, Lockfile vorhanden und konsistent, `overrides` begründet.
- Konfiguration: Umgebungsvariablen-Validierung beim Start, sichere Defaults, `.env.example` ohne echte Werte, Health-/Ready-Endpunkte, Backup-/Restore-Doku, Logging ohne Geheimnisse.

### 4. Befunde prüfen und bündeln

- Jeden Kandidaten gegen den Code gegenprüfen (Aufrufer, Guards, Tests, Doku). Verworfene Kandidaten nicht auflisten.
- Gleiche Ursache an mehreren Stellen = **ein** Befund mit Liste der Fundorte (z. B. „12 API-Routen ohne Rate-Limit“).
- Schweregrad vergeben:
  - **Kritisch:** Ausnutzbar ohne/mit geringen Rechten, führt zu Datenabfluss, Kontoübernahme, Rechteausweitung, Remote-Code oder Datenverlust.
  - **Hoch:** Reale Sicherheits- oder Integritätslücke mit Voraussetzungen, oder Fehler, der Kernfunktionen für viele Nutzer bricht.
  - **Mittel:** Schwächt Schutz oder Zuverlässigkeit, braucht besondere Umstände.
  - **Niedrig:** Geringes Risiko, Härtung, kleine Fehler mit begrenzter Wirkung.
  - **Hinweis:** Beobachtung ohne unmittelbares Risiko, nur wenn nützlich.

## Ausgabe

Gib **am Ende** genau diese Struktur aus, ohne Vorgeplänkel davor:

```
# PWA-Review: <Projektname>

**Umfang:** <was geprüft wurde: Anzahl Routen/Dateien grob, Stack, Commit>
**Ergebnis:** <1–2 Sätze Gesamteinschätzung> · Kritisch: n · Hoch: n · Mittel: n · Niedrig: n · Hinweis: n

## Befunde

| # | Schwere | Bereich | Titel | Ort |
|---|---------|---------|-------|-----|
| 1 | Kritisch | Security | … | `pfad/datei.ts:42` |

## Details

### 1. <Titel> (Kritisch · Security)
- **Ort:** `pfad/datei.ts:42`
- **Problem:** <was ist falsch, belegt im Code>
- **Auslöser/Szenario:** <konkrete Eingabe oder Situation und Folge>
- **Empfehlung:** <minimale Korrektur>

## Positiv aufgefallen
<kurz, nur belegte Stärken, z. B. vorhandene Nonce-CSP, Rate-Limit, Tests>

## Automatische Checks
| Check | Ergebnis |
|-------|----------|
| npm audit | … |
| lint | … |
| tsc | … |
| Tests | … |

## Nicht geprüft
<Checks oder Bereiche, die nicht laufen/bewertet werden konnten, mit Grund>

## Empfohlene Reihenfolge
1. … (Kritisch/Hoch zuerst, Quick Wins markieren)
```

Regeln für die Ausgabe:

- Befunde nach Schweregrad absteigend sortieren, innerhalb gleicher Stufe nach Wirkung.
- Hat der Audit keine belastbaren Befunde ergeben, das klar sagen, statt Befunde zu erfinden.
- Zeilenangaben müssen stimmen: Datei vor dem Zitieren nochmals lesen.
- Keine Codeänderungen vorschlagen, die über die minimale Korrektur hinausgehen. Auf Wunsch den Nutzer fragen, ob einzelne Befunde behoben werden sollen.
