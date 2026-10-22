import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  ASSETS_CACHE,
  ASSETS_CACHE_MAX_AGE_SECONDS,
  ASSETS_CACHE_MAX_ENTRIES,
  isUncachedPagePath,
  LEGACY_CACHE,
  PAGES_CACHE,
  PAGES_CACHE_MAX_AGE_SECONDS,
  PAGES_CACHE_MAX_ENTRIES,
} from "../lib/pwa/cache-policy";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  {
    // API-Antworten niemals aus dem Cache bedienen - insbesondere das R4.1-
    // Offline-Paket (app/api/cert/[certId]/offline-package) muss bei jedem
    // Download frisch von der DB kommen; die eigentliche Offline-Speicherung
    // läuft über IndexedDB (lib/client/offline-db.ts), nicht über den
    // Service-Worker-Cache.
    matcher: ({ url }) => url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
  {
    // Admin- und Firmenbereich enthalten Daten anderer Personen: nie in einen Cache (roadmap_pwa Regel 3).
    matcher: ({ request, sameOrigin, url }) => sameOrigin && request.mode === "navigate" && isUncachedPagePath(url.pathname),
    handler: new NetworkOnly(),
  },
  {
    // Seitenaufrufe: erst Netzwerk, der Cache nur als Rückfall (Offline-Modus, sehr
    // langsames Netz nach 3 s). Früher Stale-While-Revalidate: nach einer Änderung
    // (z. B. neue Einladung im Firmenbereich) zeigte ein Neuladen die VERALTETE Seite.
    // Gecachte Seiten gehören genau einem Nutzer: sie werden beim Logout und beim
    // Nutzerwechsel gelöscht (lib/client/clear-local-data.ts, cache-owner.ts) und laufen ab.
    matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
    handler: new NetworkFirst({
      cacheName: PAGES_CACHE,
      networkTimeoutSeconds: 3,
      // Nur 200er landen im Cache - sonst würde z. B. ein 502 während eines
      // Deploy-Fensters im Cache hängen bleiben und bei Ausfall ausgeliefert.
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: PAGES_CACHE_MAX_ENTRIES, maxAgeSeconds: PAGES_CACHE_MAX_AGE_SECONDS, purgeOnQuotaError: true }),
      ],
    }),
  },
  {
    // Statische Dateien (Stil, Skript, Bild, Schrift): Stale-While-Revalidate, die
    // Dateinamen enthalten einen Hash, veraltete Treffer sind unkritisch.
    matcher: ({ request, sameOrigin }) =>
      sameOrigin && ["style", "script", "image", "font"].includes(request.destination),
    handler: new StaleWhileRevalidate({
      cacheName: ASSETS_CACHE,
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: ASSETS_CACHE_MAX_ENTRIES, maxAgeSeconds: ASSETS_CACHE_MAX_AGE_SECONDS, purgeOnQuotaError: true }),
      ],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Ein neuer Service Worker wartet, bis der Nutzer im Update-Hinweis „Neu laden“ wählt (SKIP_WAITING-Nachricht,
  // components/ServiceWorkerManager.tsx): ein Deploy beendet so keine laufende Session.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();

// Der frühere gemeinsame Cache (Seiten und Assets zusammen) wird nicht mehr genutzt.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete(LEGACY_CACHE));
});
