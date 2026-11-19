import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";
import { OFFLINE_FALLBACK_PATH } from "../lib/pwa/offline-routes";
import { parsePush, safeAppPath } from "../lib/pwa/push-payload";
import { userIdFromSyncTag } from "../lib/pwa/sync-tag";
import { deletePendingSyncEvent, listPendingSyncEvents, savePendingSyncEvent } from "../lib/client/offline-db";
import { transferPendingEvents } from "../lib/client/sync-core";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  ASSETS_CACHE,
  ASSETS_CACHE_MAX_AGE_SECONDS,
  ASSETS_CACHE_MAX_ENTRIES,
  isRscRequest,
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
    // Next.js RSC-Payloads nie cachen, damit Soft-Navigationen keine veralteten oder nutzerfremden Fragmente liefern.
    matcher: ({ request, sameOrigin, url }) => sameOrigin && isRscRequest(request, url),
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
  // Next.js hängt die Build-Kennung (?dpl=, deploymentId in next.config.ts) an Skripte und Stile; der Precache kennt die
  // Adressen ohne sie. Ohne diese Regel fände der Service Worker offline keinen Chunk mehr.
  precacheOptions: { ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^dpl$/] },
  // Ein neuer Service Worker wartet, bis der Nutzer im Update-Hinweis „Neu laden“ wählt (SKIP_WAITING-Nachricht,
  // components/ServiceWorkerManager.tsx): ein Deploy beendet so keine laufende Session.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  // Seite weder im Cache noch erreichbar (z. B. Admin-Seite im Flugmodus): statt der Browser-Fehlerseite die Offline-Seite.
  fallbacks: {
    entries: [{ url: OFFLINE_FALLBACK_PATH, matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();

// Der frühere gemeinsame Cache (Seiten und Assets zusammen) wird nicht mehr genutzt.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete(LEGACY_CACHE));
});

// Background Sync (Chrome/Android): die Warteschlange aus IndexedDB übertragen, auch wenn die App geschlossen ist. Die
// Anfrage läuft mit den Cookies der Person (gleicher Ursprung). Bei 401/403 bleiben die Ereignisse liegen; die Seite
// zeigt dann „Anmeldung nötig“ und überträgt beim nächsten Öffnen. Ohne Netz schlägt der Auftrag fehl und der Browser
// wiederholt ihn. Wo es Background Sync nicht gibt, übernehmen `online`, App-Start und manueller Sync.
type SyncLikeEvent = ExtendableEvent & { tag: string };
self.addEventListener("sync", ((event: SyncLikeEvent) => {
  const userId = userIdFromSyncTag(event.tag);
  if (!userId) return;
  event.waitUntil(
    (async () => {
      const { networkFailed } = await transferPendingEvents(
        userId,
        {
          list: listPendingSyncEvents,
          save: savePendingSyncEvent,
          remove: deletePendingSyncEvent,
          post: (body) => fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }),
          onTransferred: async (id, at) => {
            for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage({ type: "SYNC_TRANSFERRED", userId: id, at });
          },
        },
        () => null,
      );
      if (networkFailed) throw new Error("Netzwerk nicht erreichbar, Wiederholung durch den Browser.");
    })(),
  );
}) as EventListener);

// Web Push (docs/roadmaps/archiv/roadmap_pwa.md, Phase 6): Nachrichten des Servers anzeigen und beim Antippen die App öffnen. Ein Abo gibt es
// nur, wenn die Person es in den Einstellungen selbst eingeschaltet hat (components/PushSettings.tsx). Der Inhalt wird geprüft
// (lib/pwa/push-payload.ts); das Ziel ist immer ein Pfad der eigenen App.
self.addEventListener("push", (event) => {
  const shown = parsePush(event.data ? event.data.text() : null);
  event.waitUntil(
    self.registration.showNotification(shown.title, {
      body: shown.body,
      tag: shown.tag,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: { url: shown.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safeAppPath((event.notification.data as { url?: unknown } | null)?.url), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        await existing.navigate(target).catch(() => undefined);
      } else {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
