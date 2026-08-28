# Roadmap & Implementation Tracker: CertStudy AI (PWA)

> **Deployment Target:** `https://learning.pwa-tree.de`  
> **Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, Lucide-react, Dexie.js (IndexedDB), `@google/genai` (Gemini API), Docker, Multi-Stage Build, Reverse Proxy (Caddy/Nginx)  
> **Status-Konvention:** `- [ ]` Offen | `- [/]` In Arbeit | `- [x]` Abgeschlossen

---

## Phase 1: Projekt-Setup & PWA-Basis
- [x] **1.1 Next.js Initialisierung**
  - [x] Next.js 14+ mit App Router, TypeScript & Tailwind CSS initialisieren
  - [x] `lucide-react`, `clsx`, `tailwind-merge`, `canvas-confetti` installieren
  - [x] `next.config.js` auf `output: 'standalone'` setzen
- [x] **1.2 PWA & Manifest Konfiguration**
  - [x] `@ducanh2912/next-pwa` (oder `@serwist/next`) installieren und konfigurieren
  - [x] `public/manifest.json` erstellen (Name, Icons 192x192 / 512x512, standalone, theme_color `#0f172a`)
  - [x] Service Worker Caching-Strategien (Stale-While-Revalidate für UI, Network-Only für KI-API) definieren
  - [x] PWA Meta-Tags in `app/layout.tsx` hinterlegen (apple-touch-icon, viewport, theme-color)

---

## Phase 2: Lokale Datenbankschicht (IndexedDB / Dexie.js)
- [x] **2.1 Schema & Typdefinitionen (`lib/db.ts`)**
  - [x] `dexie` & `dexie-react-hooks` installieren
  - [x] TypeScript Interfaces definieren: `Certificate`, `Module`, `QuizQuestion`, `MockExam`, `ExamResult`
  - [x] Dexie DB-Instanz mit Tabellen aufsetzen:
    - `certificates`: `id, title, totalDays, targetDate, createdAt, progress`
    - `modules`: `id, certId, day, title, summary, isCompleted, contentMarkdown`
    - `quizzes`: `id, certId, moduleId, questions, score, completedAt`
    - `mockExams`: `id, certId, questions, score, passed, completedAt, durationSeconds`
- [x] **2.2 Data-Access-Layer & Hooks (`lib/hooks/`)**
  - [x] Helper: `createCertificateWithCurriculum(certData, modules)`
  - [x] Helper: `saveModuleContent(moduleId, markdown, quizData)`
  - [x] Helper: `markModuleCompleted(moduleId, score)`
  - [x] Helper: `saveExamResult(certId, examData)`
  - [x] Hook: `useCertificates()` & `useCertificateDetail(certId)`

---

## Phase 3: KI-API-Integration (Backend Routes)
> **Update-Historie:** Ursprünglich mit `@anthropic-ai/sdk` (Claude) umgesetzt,
> dann auf OpenAI (`openai`-Package, `gpt-5.4-mini` über die Chat Completions API)
> migriert, dann auf **Google Gemini** (`@google/genai`-Package, `gemini-3.6-flash`)
> migriert — Grund: OpenAI's API hat keine kostenlose Stufe (`insufficient_quota`
> ohne Guthaben), Geminis Free-Tier (kostenlos, keine Kreditkarte, siehe
> roadmap2.md Dev-Order Schritt 3) passte besser. Aktuell: `lib/gemini.ts`
> (vormals `lib/claude.ts` -> `lib/openai.ts`), `lib/ai/generate.ts`,
> `lib/ai/http.ts` sowie alle `GEMINI_API_KEY`-Referenzen in
> `.env.example`/`.env.local`/`docker-compose.yml`.
- [x] **3.1 Gemini Client & Environment**
  - [x] `@google/genai` & `zod` installieren
  - [x] `.env.local` Vorlage anlegen (`GEMINI_API_KEY=...`) (als `.env.example`, da `.env.local` bewusst nicht versioniert wird)
  - [x] API-Client Singleton in `lib/gemini.ts` erstellen
- [x] **3.2 Route Handler & Validierung**
  - [x] `POST /api/generate/curriculum`:
    - Eingabe: `{ certName: string, totalDays: number }`
    - Prompt: n-Tage-Curriculum als striktes JSON, Titel/Zusammenfassung bilingual (DE+EN)
    - Zod Schema-Validierung & Fehlerbehandlung
  - [x] `POST /api/generate/chapter`:
    - Eingabe: `{ certName: string, day: number, moduleTitle: { de: string, en: string } }` (bilingual statt reinem `string`, siehe Bilingual-Anforderung oben)
    - Prompt: Didaktischer Markdown-Lerntext + 5 szenariobasierte Multiple-Choice-Fragen mit Erklärungen, jeweils bilingual (DE+EN)
    - JSON-Schema-Rückgabe
  - [x] `POST /api/generate/mock-exam`:
    - Eingabe: `{ certName: string, questionCount: number, focusAreas?: string[] }`
    - Prompt: Prüfungsnahe Szenario-Fragen im Prüfungsformat, bilingual (DE+EN)
- [x] **3.3 Fallback & Rate-Limit Handling**
  - [x] JSON-Parsing Fallback & Reparatur bei fehlerhafter KI-Ausgabe
  - [x] Fehler-Responses mit aussagekräftigen Statuscodes

---

## Phase 4: Frontend UI & User Flows
- [x] **4.1 Layout & Theme**
  - [x] Dark/Light Mode Switcher & Responsive Shell mit Navigation
  - [x] Globaler Header mit App-Titel ("CertStudy AI") & Status-Badge
  - [x] Sprachumschalter DE/EN (persistiert, wirkt auf alle bilingualen Inhalte)
- [x] **4.2 Dashboard (`app/page.tsx`)**
  - [x] Übersichtskarten aller aktiven Zertifikate (Titel, Fortschritt in %, Nächste Lektion)
  - [x] Button: `+ Neues Zertifikat hinzufügen`
  - [x] Empty-State für Erstnutzer
- [x] **4.3 Modal "Zertifikat anlegen" (`components/AddCertModal.tsx`)**
  - [x] Eingabefelder: Zertifikatsname (z. B. "CompTIA Security+ SY0-701"), Zieldauer in Tagen
  - [x] Loading-Screen mit animiertem Status während Gemini den Lehrplan generiert
  - [x] Speicherung in IndexedDB & Redirect zur Detailansicht
- [x] **4.4 Zertifikats-Detailseite (`app/cert/[id]/page.tsx`)**
  - [x] Roadmap-Timeline / Tagesübersicht (Tag 1 bis Tag N)
  - [x] Status-Icons (Abgeschlossen, Aktiv, Gesperrt/Offen)
  - [x] Schnellstart-Button: "Heutige Lektion fortsetzen"
  - [x] Button: "Simulierte Probeprüfung starten"
- [x] **4.5 Lektion & Tages-Quiz (`app/cert/[id]/day/[day]/page.tsx`)**
  - [x] Markdown-Renderer mit `@tailwindcss/typography` (`react-markdown` + Highlighting via `rehype-highlight`)
  - [x] Sticky Header mit Modultitel und Tag-Nummer
  - [x] "Lektion als gelesen markieren" Trigger
  - [x] 5-Fragen Multiple-Choice-Komponente mit direkter Validierung (Grün/Rot) & Erklärungs-Box
  - [x] Konfetti-Animation bei bestandenem Tagesquiz
- [x] **4.6 Prüfungssimulator (`app/cert/[id]/exam/page.tsx`)**
  - [x] Countdown-Timer (90 Minuten für 50 Fragen, proportional skaliert zur gewählten Fragenanzahl)
  - [x] Fragen-Navigator (Flaggen, Unbeantwortet, Beantwortet)
  - [x] Prüfungs-Auswertung: Score, Bestehensquote (>= 75%), Schwachstellenanalyse (Review der falsch beantworteten Fragen)

---

## Phase 5: Dockerization & Container-Setup
- [x] **5.1 Multi-Stage Dockerfile**
  - [x] Stage 1 (`deps`): Alpine Node 20 + Clean Install
  - [x] Stage 2 (`builder`): Build Next.js App (`output: 'standalone'`)
  - [x] Stage 3 (`runner`): Minimal Alpine User, Copy `.next/standalone`, `.next/static`, `public`
  - [x] Healthcheck Endpoint `/api/health` integrieren
- [x] **5.2 `docker-compose.yml`**
  - [x] Service `learning-pwa` definieren
  - [x] Port-Mapping `3000:3000` (lokal für Reverse Proxy)
  - [x] Environment Injection für `GEMINI_API_KEY`
  - [x] Restart Policy: `unless-stopped`
- [x] **5.3 `.dockerignore`**
  - [x] `node_modules`, `.next`, `.git`, `.env*.local` ausschließen

---

## Phase 6: Subdomain-Routing & Deployment (`learning.pwa-tree.de`)
> Diese Phase erfordert Zugriff auf den echten Zielserver/Cloudflare-Account und kann
> nicht aus der Sandbox-Umgebung heraus ausgeführt werden.
>
> **Entscheidung:** Deployment über Cloudflare Tunnel + Zero Trust (nicht über
> öffentlichen Port + klassischen Reverse Proxy). `docker-compose.yml` enthält dafür
> bereits einen `cloudflared`-Sidecar-Service im internen Docker-Netzwerk. TLS,
> Routing und Zugriff laufen komplett über Cloudflare — Port 3000 muss auf dem Server
> nicht mehr öffentlich exponiert werden.
>
> `deploy/Caddyfile` und `deploy/nginx.conf.example` bleiben als Alternative erhalten,
> falls stattdessen klassisch (öffentlicher Port + eigener Reverse Proxy + Let's
> Encrypt) deployt werden soll — für den Tunnel-Weg werden sie nicht gebraucht.
>
> **Wichtig:** Es muss ein **eigener, dedizierter Tunnel** für `learning.pwa-tree.de`
> sein, nicht der bestehende gemeinsame Tunnel mit den 2 anderen Subdomains. Der
> bestehende Tunnel ist *remotely-managed* — jeder Connector, der sich mit dessen
> Token authentifiziert, bekommt die komplette Ingress-Liste (alle Hostnames) und
> muss alle zugehörigen Origins erreichen können. Unser `cloudflared`-Container läuft
> im internen Docker-Netzwerk dieses Repos und kann nur `learning-pwa:3000`
> erreichen — als zusätzliche Replica am bestehenden Tunnel würde er gelegentlich
> auch für die beiden anderen (produktiven) Subdomains angefragt und dort mit 502
> fehlschlagen. Ein separater Tunnel mit eigenem Token vermeidet das komplett.
- [x] **6.1 Cloudflare Tunnel anlegen (Zero Trust Dashboard)**
  - [x] `learning.pwa-tree.de` Public Hostname vom bestehenden/geteilten Tunnel wieder entfernen
  - [x] Neuen, dedizierten Tunnel erstellen (Name `learning`, ID `6b19995b-f8a8-4524-95d3-441ed47fbddf`), Connector-Typ „Cloudflared"
  - [x] Tunnel-Token als `TUNNEL_TOKEN` in `.env.local` auf dem Server eingetragen
  - [x] Public Hostname auf dem neuen Tunnel hinzugefügt: `learning.pwa-tree.de`
  - [x] Service eingetragen: Type `HTTP`, URL `learning-pwa:3000`
  - [x] DNS-Eintrag automatisch von Cloudflare gesetzt
- [ ] **6.2 Zero Trust Access Policy (optional, falls Login-Schutz gewünscht)**
  - [ ] Access -> Applications -> Self-hosted Application für `learning.pwa-tree.de` anlegen, falls die App nicht öffentlich ohne Login erreichbar sein soll
- [x] **6.3 Deployment & Start**
  - [x] `.env.local` auf dem Server mit `GEMINI_API_KEY` und `TUNNEL_TOKEN` befüllt
  - [x] Container via `docker compose up -d --build` gestartet (`learning-pwa` + `cloudflared`, beide healthy)
  - [x] Container-Logs geprüft
  - [x] Tunnel-Status im Zero Trust Dashboard geprüft (Connector „Connected")
  - [x] `https://learning.pwa-tree.de/api/health` und `/` liefern konsistent `200`

> **Troubleshooting-Notiz:** Nach dem ersten Start gab es zwei Probleme, die beide
> gelöst wurden:
> 1. `docker compose up` liest standardmäßig nur eine Datei namens `.env`, nicht
>    `.env.local` -> `${VAR}`-Substitution im Compose-File blieb leer. Fix: beide
>    Services nutzen jetzt `env_file: .env.local` statt `environment: - X=${X}`.
> 2. Ein zweiter `cloudflared`-Connector lief zusätzlich auf `pwa01` (dem Mini-PC,
>    der die anderen 2 PWAs hostet) mit demselben Tunnel-Token -> Cloudflare hat
>    Traffic abwechselnd an beide Connectors verteilt, `pwa01` konnte
>    `learning-pwa:3000` aber nicht erreichen (502 bei ca. der Hälfte der
>    Requests). Fix: `cloudflared`-Service auf `pwa01` gestoppt, sodass nur noch
>    der Connector in diesem `docker-compose.yml` (hier auf `adnb0441`) läuft.
>    **Entscheidung:** `learning.pwa-tree.de` bleibt dauerhaft auf diesem Server
>    (`adnb0441`), nicht auf `pwa01` — Updates per `git pull` + `docker compose up
>    -d --build` auf diesem Server zum Testen.

---

## Phase 7: Qualitätskontrolle & Offline-Test
> 7.2/7.3 (Flugmodus-Test auf echtem Gerät, End-to-End mit echtem GEMINI_API_KEY)
> erfordern eine reale Umgebung/Gerät und konnten nicht aus der Sandbox heraus
> durchgeführt werden.
- [x] **7.1 PWA Audit**
  - [x] Lighthouse Audit durchführen (Performance > 90) - Ergebnis gegen lokalen Production-Build (`node .next/standalone/server.js`): Performance 100, Accessibility 100, Best Practices 100, SEO 100. Im Zuge dessen zwei A11y-Findings behoben (`maximumScale` entfernt, das Sprachumschalter-Label enthielt den sichtbaren Text nicht)
  - [ ] Installation auf Smartphone / Desktop testen (A2HS - Add to Home Screen) - benötigt echtes Gerät/Deployment
- [ ] **7.2 Offline-Fähigkeit prüfen**
  - [ ] Flugmodus aktivieren: Bereits generierte Lektionen & Prüfungen müssen aus IndexedDB abrufbar sein
- [ ] **7.3 End-to-End Testfall**
  - [ ] Zertifikat "CompTIA Security+ SY0-701" generieren -> Tag 1 durcharbeiten -> Quiz bestehen -> Probeprüfung durchführen