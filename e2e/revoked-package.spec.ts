import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test, waitForServiceWorkerReady } from "./fixtures";

async function packageCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("certstudy-offline");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const count = open.result.transaction("packages").objectStore("packages").count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        };
      }),
  );
}

/**
 * Datenintegrität über Zeit, Phase 4: Wird der Zugriff auf einen Kurs entzogen (hier: aus dem Katalog genommen, für
 * Lernende nicht mehr sichtbar - dieselbe 404-Antwort wie bei einem aus der Firma entfernten Mitglied), verschwindet das
 * lokale Paket beim nächsten Online-Start.
 */
test("entzogener Zugriff entfernt das lokale Paket beim nächsten Online-Start", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/offline`);
  await page.getByRole("button", { name: /Save for offline|Für offline speichern/ }).click();
  await expect(page.getByText(/Available offline|Für offline verfügbar/).first()).toBeVisible();
  await expect.poll(() => packageCount(page)).toBe(1);

  const db = getDb();
  await db.update(certifications).set({ catalogStatus: "draft" }).where(eq(certifications.slug, COURSE_SLUG));
  try {
    await page.goto(`${gateway.url}/offline`);
    await expect.poll(() => packageCount(page)).toBe(0);
    await expect(page.getByText(/no longer shared with you|nicht mehr für dich freigegeben/).first()).toBeVisible();
  } finally {
    await db.update(certifications).set({ catalogStatus: "approved" }).where(eq(certifications.slug, COURSE_SLUG));
  }
});

test("ohne Netz bleibt das Paket erhalten (Netzfehler löscht nie)", async ({ page, context, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/offline`);
  await page.getByRole("button", { name: /Save for offline|Für offline speichern/ }).click();
  await expect(page.getByText(/Available offline|Für offline verfügbar/).first()).toBeVisible();

  await waitForServiceWorkerReady(page);
  gateway.setOnline(false);
  await context.setOffline(true);
  await page.goto(`${gateway.url}/offline`);
  await expect(page.getByTestId("open-offline-course")).toBeVisible();
  await expect.poll(() => packageCount(page)).toBe(1);
});
