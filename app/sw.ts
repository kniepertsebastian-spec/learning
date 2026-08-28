import { NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  {
    // Claude-API-Aufrufe niemals aus dem Cache bedienen.
    matcher: ({ url }) => url.pathname.startsWith("/api/generate"),
    handler: new NetworkOnly(),
  },
  {
    // UI-Assets & Seiten: Stale-While-Revalidate.
    matcher: ({ request, sameOrigin }) =>
      sameOrigin &&
      (request.mode === "navigate" ||
        ["style", "script", "image", "font"].includes(request.destination)),
    handler: new StaleWhileRevalidate({ cacheName: "ui-cache" }),
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
