import {
  CacheableResponsePlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";

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
    // Seitenaufrufe: erst Netzwerk, der Cache nur als Rückfall (Offline-Modus, sehr
    // langsames Netz nach 3 s). Früher Stale-While-Revalidate: nach einer Änderung
    // (z. B. neue Einladung im Firmenbereich) zeigte ein Neuladen die VERALTETE Seite.
    // Die zuletzt geladenen Seiten bleiben für den Offline-Modus im ui-cache und
    // werden beim Logout gelöscht (components/SignOutButton.tsx).
    matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
    handler: new NetworkFirst({
      cacheName: "ui-cache",
      networkTimeoutSeconds: 3,
      // Nur 200er landen im Cache - sonst würde z. B. ein 502 während eines
      // Deploy-Fensters im ui-cache hängen bleiben und bei Ausfall ausgeliefert.
      plugins: [new CacheableResponsePlugin({ statuses: [200] })],
    }),
  },
  {
    // Statische Dateien (Stil, Skript, Bild, Schrift): Stale-While-Revalidate, die
    // Dateinamen enthalten einen Hash, veraltete Treffer sind unkritisch.
    matcher: ({ request, sameOrigin }) =>
      sameOrigin && ["style", "script", "image", "font"].includes(request.destination),
    handler: new StaleWhileRevalidate({
      cacheName: "ui-cache",
      plugins: [new CacheableResponsePlugin({ statuses: [200] })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();
