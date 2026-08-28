# Roadmap & Implementation Tracker: CertStudy AI (PWA)

> **Deployment Target:** `https://learning.pwa-tree.de`  
> **Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, Lucide-react, Dexie.js (IndexedDB), `@anthropic-ai/sdk`, Docker, Multi-Stage Build, Reverse Proxy (Caddy/Nginx)  
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

## Phase 3: Claude API Integration (Backend Routes)
- [x] **3.1 Anthropic Client & Environment**
  - [x] `@anthropic-ai/sdk` & `zod` installieren
  - [x] `.env.local` Vorlage anlegen (`ANTHROPIC_API_KEY=...`) (als `.env.example`, da `.env.local` bewusst nicht versioniert wird)
  - [x] API-Client Singleton in `lib/claude.ts` erstellen
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
  - [x] Loading-Screen mit animiertem Status während Claude den Lehrplan generiert
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
  - [x] Environment Injection für `ANTHROPIC_API_KEY`
  - [x] Restart Policy: `unless-stopped`
- [x] **5.3 `.dockerignore`**
  - [x] `node_modules`, `.next`, `.git`, `.env*.local` ausschließen

---

## Phase 6: Subdomain-Routing & Deployment (`learning.pwa-tree.de`)
- [ ] **6.1 DNS-Konfiguration**
  - [ ] Subdomain `learning.pwa-tree.de` (A/CNAME-Record) auf Server-IP bzw. Tunnel routen
- [ ] **6.2 Reverse Proxy Konfiguration (Caddy / Nginx)**
  - [ ] Reverse Proxy auf `localhost:3000` einrichten
  - [ ] Automatisches Let's Encrypt SSL-Zertifikat aktivieren (HTTPS-Zwang für PWA)
  - [ ] Websocket / Streaming Support Header setzen (falls Server-Sent Events genutzt werden)
- [ ] **6.3 Deployment & Start**
  - [ ] Container via `docker compose up -d --build` starten
  - [ ] Container-Logs prüfen (`docker logs -f learning-pwa`)

---

## Phase 7: Qualitätskontrolle & Offline-Test
- [ ] **7.1 PWA Audit**
  - [ ] Lighthouse Audit durchführen (PWA-Kriterien, Performance > 90)
  - [ ] Installation auf Smartphone / Desktop testen (A2HS - Add to Home Screen)
- [ ] **7.2 Offline-Fähigkeit prüfen**
  - [ ] Flugmodus aktivieren: Bereits generierte Lektionen & Prüfungen müssen aus IndexedDB abrufbar sein
- [ ] **7.3 End-to-End Testfall**
  - [ ] Zertifikat "CompTIA Security+ SY0-701" generieren -> Tag 1 durcharbeiten -> Quiz bestehen -> Probeprüfung durchführen