import { COURSE_NAME, COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, pendingSyncEvents, test, waitForServiceWorkerReady } from "./fixtures";

test("Kurs herunterladen → offline → /offline → Lektion + Quiz → online → Sync", async ({ page, context, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);

  // Download (online)
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/offline`);
  await page.getByRole("button", { name: /Save for offline|Für offline speichern/ }).click();
  await expect(page.getByText(/Available offline|Für offline verfügbar/).first()).toBeVisible();
  await waitForServiceWorkerReady(page);

  // Flugmodus: Browser offline UND Gateway tot (der Service Worker ginge sonst weiter ins Netz)
  gateway.setOnline(false);
  await context.setOffline(true);

  // Harte Navigation zum Offline-Einstieg - kommt aus dem Precache
  await page.goto(`${gateway.url}/offline`);
  await expect(page.getByTestId("offline-home")).toBeVisible();
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  await expect(page.getByText(COURSE_NAME)).toBeVisible();
  expect(await page.content()).not.toContain(USERS.learnerA.email);

  // Lektion lesen
  await page.getByTestId("open-offline-course").click();
  await page.getByRole("button", { name: /First lesson|Erste Lektion/ }).click();
  await expect(page.getByText(/Hello offline|Hallo Offline/).first()).toBeVisible();

  // Lektionstest abschließen
  await page.getByRole("button", { name: /Start quick check|Schnelltest starten/i }).first().click();
  for (const n of [1, 2]) {
    await expect(page.getByText(new RegExp(`Question ${n}\\?|Frage ${n}\\?`)).first()).toBeVisible();
    await page.getByText(/^(Right|Richtig)$/).first().click();
    await page.getByRole("button", { name: /^(Sure|Sicher)$/ }).first().click();
    await page.getByRole("button", { name: n === 2 ? /Finish|Abschließen/ : /Next question|Nächste Frage|Next|Weiter/ }).first().click();
  }
  await expect.poll(async () => (await pendingSyncEvents(page)).map((e) => `${e.type}:${e.status}`)).toContain("section_quiz:pending");

  // Seite, die nicht im Cache liegt: Offline-Seite statt Browserfehler
  await page.goto(`${gateway.url}/admin`);
  await expect(page.getByTestId("offline-fallback")).toBeVisible();

  // Wieder online: Ergebnis wird übertragen
  gateway.setOnline(true);
  await context.setOffline(false);
  await page.goto(`${gateway.url}/offline`);
  await expect(page.getByTestId("offline-pending")).toBeVisible();
  await page.getByRole("button", { name: /Upload now|Jetzt übertragen/ }).click();
  await expect.poll(async () => (await pendingSyncEvents(page)).length, { timeout: 30_000 }).toBe(0);
});
