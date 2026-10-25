import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

/** Tablet-Breite: Kurstitel und die Links daneben (Merkzettel, Simulationen, …) dürfen sich nicht überlagern. */
test("Kursseite auf dem Tablet: Titel und Links überlappen nicht", async ({ page, gateway }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  // Langer Kursname wie „Zabbix Certified Specialist“: dort brach der Titel früher in eine schmale Spalte um.
  const db = getDb();
  const [original] = await db.select({ name: certifications.name }).from(certifications).where(eq(certifications.slug, COURSE_SLUG));
  await db.update(certifications).set({ name: "Zabbix Certified Specialist Vorbereitung Monitoring" }).where(eq(certifications.slug, COURSE_SLUG));
  try {
    await checkNoOverlap(page, gateway.url);
  } finally {
    await db.update(certifications).set({ name: original.name }).where(eq(certifications.slug, COURSE_SLUG));
  }
});

async function checkNoOverlap(page: import("@playwright/test").Page, baseUrl: string) {
  await login(page, baseUrl, USERS.learnerA.email);
  await page.goto(`${baseUrl}/cert/${COURSE_SLUG}`);
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toBeVisible();
  const links = page.getByTestId("simulations-link").or(page.getByTestId("cheatsheets-link")).or(page.getByRole("link", { name: /Available offline|Offline verfügbar/ }));
  await expect(links.first()).toBeVisible();
  const t = (await title.boundingBox())!;
  for (const link of await links.all()) {
    const l = (await link.boundingBox())!;
    const overlap = !(l.y >= t.y + t.height || l.y + l.height <= t.y || l.x >= t.x + t.width || l.x + l.width <= t.x);
    expect(overlap).toBe(false);
  }
}
