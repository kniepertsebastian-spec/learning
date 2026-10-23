import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, pendingSyncEvents, test, waitForServiceWorkerReady } from "./fixtures";

/**
 * Background Sync (Chrome/Android): Lektionstest offline abschließen, die Seite schließen, Netz an. Der Service Worker
 * überträgt das Ergebnis ohne erneutes Öffnen der App. Gelesen wird die Warteschlange direkt im Service Worker.
 */
test("Background Sync überträgt das Ergebnis bei geschlossener Seite", async ({ page, context, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/offline`);
  await page.getByRole("button", { name: /Save for offline|Für offline speichern/ }).click();
  await expect(page.getByText(/Available offline|Für offline verfügbar/).first()).toBeVisible();
  await waitForServiceWorkerReady(page);

  gateway.setOnline(false);
  await context.setOffline(true);
  await page.goto(`${gateway.url}/offline`);
  await page.getByTestId("open-offline-course").click();
  await page.getByRole("button", { name: /First lesson|Erste Lektion/ }).click();
  await page.getByRole("button", { name: /Start quick check|Schnelltest starten/i }).first().click();
  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(/Question \d\?|Frage \d\?/).first()).toBeVisible();
    await page.getByText(/^(Right|Richtig)$/).first().click();
    await page.getByRole("button", { name: /^(Sure|Sicher)$/ }).first().click();
    await page.getByRole("button", { name: i === 2 ? /Finish|Abschließen/ : /Next question|Nächste Frage/ }).first().click();
  }
  await expect.poll(async () => (await pendingSyncEvents(page)).length).toBeGreaterThan(0);

  // Headless-Chromium meldet Background Sync als abgeschaltet: der Browser löst den Auftrag deshalb nicht selbst aus. Der
  // Handler im Service Worker wird stattdessen über das DevTools-Protokoll mit demselben Auftragsnamen angestoßen.
  const [queued] = await pendingSyncEvents(page);
  const userId = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("certstudy-offline");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("pendingSyncEvents").objectStore("pendingSyncEvents").getAll();
          all.onsuccess = () => resolve((all.result[0] as { userId: string }).userId);
        };
      }),
  );
  expect(queued).toBeTruthy();
  const sender = await context.newPage();
  await sender.goto("about:blank");
  const cdp = await context.newCDPSession(sender);
  const registrations: Array<{ registrationId: string; scopeURL: string }> = [];
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => registrations.push(...e.registrations));
  await cdp.send("ServiceWorker.enable");
  await expect.poll(() => registrations.length).toBeGreaterThan(0);
  const registration = registrations.find((r) => r.scopeURL.startsWith(gateway.url)) ?? registrations[0];

  // Seite zu, Netz wieder da: der Service Worker überträgt
  await page.close();
  gateway.setOnline(true);
  await context.setOffline(false);
  await cdp.send("ServiceWorker.dispatchSyncEvent", { origin: new URL(gateway.url).origin, registrationId: registration.registrationId, tag: `sync-queue:${userId}`, lastChance: false });
  const worker = context.serviceWorkers()[0];
  await expect
    .poll(
      async () =>
        worker.evaluate(
          () =>
            new Promise<number>((resolve, reject) => {
              const open = indexedDB.open("certstudy-offline");
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const count = open.result.transaction("pendingSyncEvents").objectStore("pendingSyncEvents").count();
                count.onsuccess = () => resolve(count.result);
                count.onerror = () => reject(count.error);
              };
            }),
        ),
      { timeout: 60_000 },
    )
    .toBe(0);
});
