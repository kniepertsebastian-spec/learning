import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { syncEvents, users } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, pendingSyncEvents, test, waitForServiceWorkerReady } from "./fixtures";

/**
 * Datenintegrität über Zeit, Phase 2: Ein offline entstandenes Ergebnis wird beim Wechsel in den Hintergrund übertragen
 * (`fetch` mit `keepalive`), sobald Netz da ist - ohne dass die App erneut geöffnet oder manuell synchronisiert wird.
 */
test("Wechsel in den Hintergrund überträgt ein offline entstandenes Ergebnis", async ({ page, context, gateway }) => {
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

  const db = getDb();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.learnerA.email)).limit(1);
  const before = (await db.select().from(syncEvents).where(eq(syncEvents.userId, user.id))).length;

  // Netz wieder da; die Seite bleibt, wird aber in den Hintergrund gelegt (kein `online`-Ereignis, kein Klick).
  gateway.setOnline(true);
  await context.setOffline(false);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(async () => (await db.select().from(syncEvents).where(eq(syncEvents.userId, user.id))).length, { timeout: 30_000 }).toBeGreaterThan(before);
});
