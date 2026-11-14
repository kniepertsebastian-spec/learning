import { and, eq, gte, isNotNull } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { reviewLog, users } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, pendingSyncEvents, test, waitForServiceWorkerReady } from "./fixtures";

/** Stellt die Sichtbarkeit der Seite wie bei einem Tab-Wechsel um (siehe leave-flush.spec.ts). */
async function setVisibility(page: import("@playwright/test").Page, state: "hidden" | "visible") {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

/** Die Antwortzeiten aller Antworten, die in der Warteschlange liegen (so, wie sie nach dem Sync an den Server gehen). */
async function queuedResponseTimes(page: import("@playwright/test").Page): Promise<number[]> {
  return page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const request = indexedDB.open("certstudy-offline", 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction("pendingSyncEvents").objectStore("pendingSyncEvents").getAll();
          all.onsuccess = () => {
            db.close();
            const events = all.result as Array<{ payload: { answers?: Array<{ responseTimeMs?: number }> } }>;
            resolve(events.flatMap((e) => (e.payload.answers ?? []).flatMap((a) => (typeof a.responseTimeMs === "number" ? [a.responseTimeMs] : []))));
          };
        };
      }),
  );
}

/**
 * Aufgabe 06c (Review 12.11.2026): Der Offline-Leser misst die Antwortzeit wie der Online-Pfad. Zeit im Hintergrund zählt auch
 * offline nicht, und nach dem Sync steht dieselbe Zeit in `review_log.response_time_ms`.
 */
test("offline beantwortete Frage: Zeit ohne Hintergrund in der Warteschlange und nach dem Sync in review_log", async ({ page, context, gateway }) => {
  const startedAt = new Date();
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

  // Erste Frage: kurz nachdenken, fünf Sekunden im Hintergrund, zurück und antworten. Die übrigen gleich.
  await expect(page.getByText(/Question \d\?|Frage \d\?/).first()).toBeVisible();
  await page.waitForTimeout(1000);
  await setVisibility(page, "hidden");
  await page.waitForTimeout(5000);
  await setVisibility(page, "visible");
  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(/Question \d\?|Frage \d\?/).first()).toBeVisible();
    // Die übrigen Fragen lässt der Test je eine Sekunde stehen, damit ihre Zeit über der Untergrenze des Servers liegt.
    if (i > 0) await page.waitForTimeout(1000);
    await page.getByText(/^(Right|Richtig)$/).first().click();
    await page.getByRole("button", { name: /^(Sure|Sicher)$/ }).first().click();
    await page.getByRole("button", { name: i === 2 ? /Finish|Abschließen/ : /Next question|Nächste Frage/ }).first().click();
  }
  await expect.poll(async () => (await pendingSyncEvents(page)).length).toBeGreaterThan(0);

  // Offline gespeichert: eine Zeit je Antwort, die erste ohne die fünf Sekunden im Hintergrund.
  const queued = await queuedResponseTimes(page);
  expect(queued).toHaveLength(3);
  expect(queued[0]).toBeGreaterThanOrEqual(900);
  expect(queued[0]).toBeLessThan(4000);

  // Wieder online: nach dem Sync stehen dieselben Zeiten in review_log.
  gateway.setOnline(true);
  await context.setOffline(false);
  await page.goto(`${gateway.url}/offline`);
  await expect.poll(async () => (await pendingSyncEvents(page)).length, { timeout: 30_000 }).toBe(0);

  const db = getDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.learnerA.email)).limit(1);
  const stored = (
    await db.select({ ms: reviewLog.responseTimeMs }).from(reviewLog).where(and(eq(reviewLog.userId, user.id), isNotNull(reviewLog.responseTimeMs), gte(reviewLog.timestampUtc, new Date(startedAt.getTime() - 2000))))
  ).map((r) => r.ms as number);
  expect(stored.sort((a, b) => a - b)).toEqual([...queued].sort((a, b) => a - b));
});
