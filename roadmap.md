# PWA Hardening & Senior Engineering Review Roadmap (`roadmap.md`)

Based on the Senior PWA, Performance, Accessibility, and Security Review of the **Knowvia** repository (`Next.js 16` + `@serwist/next` + `Drizzle ORM` + `NextAuth`).

---

## Status Overview

- **Completed in Code (`[x]`)**: 8 core engineering fixes across 16 source & unit-test files.
- **Open / Runtime Verification (`[ ]`)**: Optional Phase 6 Web Push & real-device/CI runtime checks.

---

## Phase 1 – Sync Queue Concurrency & Offline Data Integrity (Priority: Critical)

- [x] **Cross-Tab & Service Worker Sync Serialization (`PWA-01`)**
  - **Files:** `lib/client/sync-core.ts`, `lib/client/sync-core.test.ts`
  - **Fix:** Added `withUserSyncLock(userId, fn)` using the Web Locks API (`navigator.locks.request("certstudy-sync:" + userId, fn)`) around `transferPendingEvents` so simultaneous sync triggers from the main thread (`online`, `visibilitychange`) and the Service Worker (`sync` event in `app/sw.ts`) cannot send duplicate `POST /api/sync` batches or race on IndexedDB attempt counters.
- [x] **Offline Package Clock-Rollback Tamper Protection (`SEC-01`)**
  - **Files:** `lib/pwa/package-expiry.ts`, `lib/pwa/package-expiry.test.ts`
  - **Fix:** Hardened `isPackageLocked()` with a 5-minute NTP drift tolerance (`CLOCK_DRIFT_TOLERANCE_MS`) and a high-water mark comparison across `downloadedAt` and `lastVerifiedAt` so rolling back the device clock while offline immediately locks expired company course packages.
- [x] **Preserve Active Learning Time While Offline (`PERF-03`)**
  - **Files:** `lib/client/learning-time.ts`, `components/LearningTimeTracker.tsx`
  - **Fix:** Updated `sendLearningTime()` to check `navigator.onLine !== false` before firing network requests and return a boolean success indicator; `LearningTimeTracker` now retains `state.pending` seconds while offline instead of discarding them every 60 seconds, and flushes automatically on the `online` event.

---

## Phase 2 – App Router Offline Navigation & Service Worker Caching (Priority: High)

- [x] **Explicit `NetworkOnly` Rule for Next.js RSC Requests (`PWA-02`, `PWA-03`)**
  - **Files:** `lib/pwa/cache-policy.ts`, `lib/pwa/cache-policy.test.ts`, `app/sw.ts`
  - **Fix:** Added `isRscRequest(request, url)` to detect `RSC: 1` headers and `?_rsc=` query parameters, and registered a dedicated `NetworkOnly` runtime caching rule in `app/sw.ts` so Next.js flight payloads are never erroneously served from or stored in document/asset caches.
- [x] **Offline Exit Navigation in `FocusFrame` (`PWA-02`)**
  - **Files:** `components/quiz/FocusFrame.tsx`
  - **Fix:** Added `navigateOut(target)` in `FocusFrame.tsx` so closing or leaving a quiz/study session while offline (`!navigator.onLine`) performs a hard navigation (`window.location.assign(target)`) that hits the Service Worker's `pages-cache` / `/~offline` fallback instead of failing on a soft `router.push()` RSC fetch.
- [x] **Chunk-Error Recovery with Service Worker & Cache Reset (`ARCH-01`)**
  - **Files:** `lib/client/chunk-error.ts`, `app/error.tsx`
  - **Fix:** Added `prepareServiceWorkerForChunkReload()` to purge `pages-cache`, trigger `registration.update()`, and send `SKIP_WAITING` to any waiting Service Worker before executing the one-time reload on `ChunkLoadError`.

---

## Phase 3 – Core Web Vitals (INP), Mobile Standalone UX & Accessibility (Priority: Medium)

- [x] **Memoize `RichText` Markdown / KaTeX / Highlight.js Rendering (`PERF-01`)**
  - **Files:** `components/RichText.tsx`
  - **Fix:** Wrapped `RichText` in `React.memo` and memoized `normalizeMath(text)` and the component map so timer ticks and option selections in `StudySession` and `ExamSession` do not re-parse Markdown, KaTeX, and syntax highlighting on every render.
- [x] **iOS Standalone Safe-Area Insets in `FocusFrame` (`PWA-04`)**
  - **Files:** `components/quiz/FocusFrame.tsx`
  - **Fix:** Applied `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, `env(safe-area-inset-left)`, and `env(safe-area-inset-right)` to the full-screen `FocusFrame` portal header and scroll container so iPhone notches/Dynamic Islands and Home Indicators never clip quiz controls in standalone display mode.
- [x] **Quiz Hotkey IME Composition & Interactive Element Guards (`A11Y-01`)**
  - **Files:** `lib/quiz/keys.ts`, `lib/quiz/keys.test.ts`, `components/quiz/useQuizHotkeys.ts`
  - **Fix:** Ignored key events during IME composition (`e.isComposing`) in `quizKeyAction()` and expanded `useQuizHotkeys` `Enter` suppression to cover `summary`, `[role=button]`, `[role=tab]`, and `[role=checkbox]` so keyboard users can toggle collapsible details/tabs inside questions without accidentally submitting their quiz answer.

---

## Phase 4 – Remaining / Optional Tasks & Runtime Verification

- [ ] **Run Vitest & Playwright Suites in CI**
  - Execute `npm test` (Vitest) and `npx playwright test` against a production build (`npm run build && npm run start`) to verify the new unit tests and existing E2E specs (`e2e/offline-flow.spec.ts`, `e2e/background-sync.spec.ts`, `e2e/cache-privacy.spec.ts`, `e2e/update-flow.spec.ts`).
- [ ] **Real-Device iOS Safari & Android Chromium Audit**
  - Validate standalone safe-area insets during an active exam/study session on iOS Safari and verify `beforeinstallprompt` / Background Sync on Android Chrome.
- [ ] **Optional Web Push Notifications (`roadmap_pwa.md` Phase 6)**
  - Implement optional VAPID Web Push subscriptions for exam and spaced-repetition reminders with opt-in in account settings and automatic unsubscribe on sign-out.
