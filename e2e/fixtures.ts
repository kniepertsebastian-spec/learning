import { expect, test as base, type Page } from "@playwright/test";
import { Gateway } from "./gateway";
import { PASSWORD } from "./global-setup";

export const APP_PORT = 3100;

export const test = base.extend<{ gateway: Gateway }>({
  // Pro Test ein eigenes Gateway (eigener Origin, damit Service Worker und Caches nicht zwischen Tests geteilt werden).
  gateway: async ({}, provide) => {
    const gateway = new Gateway({ host: "127.0.0.1", port: APP_PORT });
    await gateway.start();
    await provide(gateway);
    await gateway.stop();
  },
});
export { expect };

export async function login(page: Page, baseUrl: string, email: string): Promise<void> {
  await page.goto(`${baseUrl}/login`);
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }), page.click('button[type="submit"]')]);
}

/** Wartet, bis der Service Worker die Seite steuert und der Offline-Einstieg im Precache liegt. */
export async function waitForServiceWorkerReady(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
  await page.evaluate(async () => {
    for (let i = 0; i < 120; i++) {
      const name = (await caches.keys()).find((n) => n.startsWith("serwist-precache"));
      if (name) {
        const paths = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
        if (paths.includes("/offline") && paths.includes("/~offline")) return;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("Precache enthält /offline nicht");
  });
}

/** Pfade je Cache (ohne Precache), zum Prüfen, was im Browser liegt. */
export async function runtimeCachePaths(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      if (name.startsWith("serwist-precache")) continue;
      out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    }
    return out;
  });
}

export async function pendingSyncEvents(page: Page): Promise<Array<{ type: string; status: string }>> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("certstudy-offline", 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction("pendingSyncEvents").objectStore("pendingSyncEvents").getAll();
          all.onsuccess = () => {
            db.close();
            resolve((all.result as Array<{ type: string; status: string }>).map((e) => ({ type: e.type, status: e.status })));
          };
        };
      }),
  );
}
