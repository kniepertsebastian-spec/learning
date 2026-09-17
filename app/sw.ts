import { CacheableResponsePlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";
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
    // UI-Assets & Seiten: Stale-While-Revalidate. Nur 200er landen im Cache -
    // sonst würde z. B. ein 502 während eines Deploy-Fensters im ui-cache
    // hängen bleiben und Nutzern bei jeder Navigation erneut ausgeliefert,
    // bis der Cache manuell geleert wird.
    matcher: ({ request, sameOrigin }) =>
      sameOrigin &&
      (request.mode === "navigate" ||
        ["style", "script", "image", "font"].includes(request.destination)),
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
