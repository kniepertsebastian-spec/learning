# Roadmap & Implementation Tracker: CertStudy AI (PWA)

> **Deployment Target:** `https://learning.pwa-tree.de`  
> **Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, Lucide-react, Dexie.js (IndexedDB), `@anthropic-ai/sdk`, Docker, Multi-Stage Build, Reverse Proxy (Caddy/Nginx)  
> **Status-Konvention:** `- [ ]` Offen | `- [/]` In Arbeit | `- [x]` Abgeschlossen

---

## Phase 1: Projekt-Setup & PWA-Basis
- [ ] **1.1 Next.js Initialisierung**
  - [ ] Next.js 14+ mit App Router, TypeScript & Tailwind CSS initialisieren
  - [ ] `lucide-react`, `clsx`, `tailwind-merge`, `canvas-confetti` installieren
  - [ ] `next.config.js` auf `output: 'standalone'` setzen
- [ ] **1.2 PWA & Manifest Konfiguration**
  - [ ] `@ducanh2912/next-pwa` (oder `@serwist/next`) installieren und konfigurieren
  - [ ] `public/manifest.json` erstellen (Name, Icons 192x192 / 512x512, standalone, theme_color `#0f172a`)
  - [ ] Service Worker Caching-Strategien (Stale-While-Revalidate für UI, Network-Only für KI-API) definieren
  - [ ] PWA Meta-Tags in `app/layout.tsx` hinterlegen (apple-touch-icon, viewport, theme-color)

---

## Phase 2: Lokale Datenbankschicht (IndexedDB / Dexie.js)
- [ ] **2.1 Schema & Typdefinitionen (`lib/db.ts`)**
  - [ ] `dexie` & `dexie-react-hooks` installieren
  - [ ] TypeScript Interfaces definieren: `Certificate`, `Module`, `QuizQuestion`, `MockExam`, `ExamResult`
  - [ ] Dexie DB-Instanz mit Tabellen aufsetzen:
    - `certificates`: `id, title, totalDays, targetDate, createdAt, progress`
    - `modules`: `id, certId, day, title, summary, isCompleted, contentMarkdown`
    - `quizzes`: `id, certId, moduleId, questions, score, completedAt`
    - `mockExams`: `id, certId, questions, score, passed, completedAt, durationSeconds`
- [ ] **2.2 Data-Access-Layer & Hooks (`lib/hooks/`)**
  - [ ] Helper: `createCertificateWithCurriculum(certData, modules)`
  - [ ] Helper: `saveModuleContent(moduleId, markdown, quizData)`
  - [ ] Helper: `markModuleCompleted(moduleId, score)`
  - [ ] Helper: `saveExamResult(certId, examData)`
  - [ ] Hook: `useCertificates()` & `useCertificateDetail(certId)`

---

## Phase 3: Claude API Integration (Backend Routes)
- [ ] **3.1 Anthropic Client & Environment**
  - [ ] `@anthropic-ai/sdk` & `zod` installieren
  - [ ] `.env.local` Vorlage anlegen (`ANTHROPIC_API_KEY=...`)
  - [ ] API-Client Singleton in `lib/claude.ts` erstellen
- [ ] **3.2 Route Handler & Validierung**
  - [ ] `POST /api/generate/curriculum`:
    - Eingabe: `{ certName: string, totalDays: number }`
    - Prompt: 30-Tage (bzw. n-Tage) Curriculum als striktes JSON
    - Zod Schema-Validierung & Fehlerbehandlung
  - [ ] `POST /api/generate/chapter`:
    - Eingabe: `{ certName: string, day: number, moduleTitle: string }`
    - Prompt: Didaktischer Markdown-Lerntext + 5 szenariobasierte Multiple-Choice-Fragen mit Erklärungen
    - JSON-Schema-Rückgabe
  - [ ] `POST /api/generate/mock-exam`:
    - Eingabe: `{ certName: string, questionCount: number, focusAreas?: string[] }`
    - Prompt: Prüfungsnahe PBQ-/Szenario-Fragen im Prüfungsformat
- [ ] **3.3 Fallback & Rate-Limit Handling**
  - [ ] JSON-Parsing Fallback & Reparatur bei fehlerhafter KI-Ausgabe
  - [ ] Fehler-Responses mit aussagekräftigen Statuscodes

---

## Phase 4: Frontend UI & User Flows
- [ ] **4.1 Layout & Theme**
  - [ ] Dark/Light Mode Switcher & Responsive Shell mit Navigation
  - [ ] Globaler Header mit App-Titel ("CertStudy AI") & Status-Badge
- [ ] **4.2 Dashboard (`app/page.tsx`)**
  - [ ] Übersichtskarten aller aktiven Zertifikate (Titel, Fortschritt in %, Nächste Lektion)
  - [ ] Button: `+ Neues Zertifikat hinzufügen`
  - [ ] Empty-State für Erstnutzer
- [ ] **4.3 Modal "Zertifikat anlegen" (`components/AddCertModal.tsx`)**
  - [ ] Eingabefelder: Zertifikatsname (z. B. "CompTIA Security+ SY0-701"), Zieldauer in Tagen
  - [ ] Loading-Screen mit animiertem Status während Claude den Lehrplan generiert
  - [ ] Speicherung in IndexedDB & Redirect zur Detailansicht
- [ ] **4.4 Zertifikats-Detailseite (`app/cert/[id]/page.tsx`)**
  - [ ] Roadmap-Timeline / Tagesübersicht (Tag 1 bis Tag N)
  - [ ] Status-Icons (Abgeschlossen, Aktiv, Gesperrt/Offen)
  - [ ] Schnellstart-Button: "Heutige Lektion fortsetzen"
  - [ ] Button: "Simulierte Probeprüfung starten"
- [ ] **4.5 Lektion & Tages-Quiz (`app/cert/[id]/day/[day]/page.tsx`)**
  - [ ] Markdown-Renderer mit `@tailwindcss/typography` (`react-markdown` + Prism/Highlighting)
  - [ ] Sticky Header mit Modultitel und Tag-Nummer
  - [ ] "Lektion als gelesen markieren" Trigger
  - [ ] 5-Fragen Multiple-Choice-Komponente mit direkter Validierung (Grün/Rot) & Erklärungs-Box
  - [ ] Konfetti-Animation bei bestandenem Tagesquiz
- [ ] **4.6 Prüfungssimulator (`app/cert/[id]/exam/page.tsx`)**
  - [ ] Countdown-Timer (z. B. 90 Minuten für 50 Fragen)
  - [ ] Fragen-Navigator (Flaggen, Unbeantwortet, Beantwortet)
  - [ ] Prüfungs-Auswertung: Score, Bestehensquote (z. B. >= 75%), Schwachstellenanalyse

---

## Phase 5: Dockerization & Container-Setup
- [ ] **5.1 Multi-Stage Dockerfile**
  - [ ] Stage 1 (`deps`): Alpine Node 20 + Clean Install
  - [ ] Stage 2 (`builder`): Build Next.js App (`output: 'standalone'`)
  - [ ] Stage 3 (`runner`): Minimal Alpine User, Copy `.next/standalone`, `.next/static`, `public`
  - [ ] Healthcheck Endpoint `/api/health` integrieren
- [ ] **5.2 `docker-compose.yml`**
  - [ ] Service `learning-pwa` definieren
  - [ ] Port-Mapping `3000:3000` (lokal für Reverse Proxy)
  - [ ] Environment Injection für `ANTHROPIC_API_KEY`
  - [ ] Restart Policy: `unless-stopped`
- [ ] **5.3 `.dockerignore`**
  - [ ] `node_modules`, `.next`, `.git`, `.env*.local` ausschließen

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