import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

/** Stellt die Sichtbarkeit der Seite wie bei einem Tab-Wechsel um (siehe leave-flush.spec.ts). */
async function setVisibility(page: import("@playwright/test").Page, state: "hidden" | "visible") {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

/**
 * Aufgabe 06a (Review 12.11.2026): Die Antwortzeit einer Frage zählt von der Anzeige bis zur Antwort, ohne Zeit im Hintergrund.
 * Gelesen wird sie aus der Anfrage, die die Session beim Pausieren sendet.
 */
test("ein Tab-Wechsel während der Frage erhöht die gemessene Antwortzeit nicht", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.responseTimer.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/session`);
  await expect(page.getByTestId("session-intro")).toBeVisible();

  // Kurz nachdenken, dann fünf Sekunden im Hintergrund, zurück und antworten.
  await page.waitForTimeout(800);
  await setVisibility(page, "hidden");
  await page.waitForTimeout(5000);
  await setVisibility(page, "visible");
  await page.waitForTimeout(200);
  await page.getByText(/^(Right|Richtig)$/).first().click();
  await expect(page.getByTestId("feedback-panel")).toBeVisible();

  const request = page.waitForRequest((r) => /\/pause$/.test(r.url()));
  await page.getByTestId("pause-today").click();
  const answers = (await request).postDataJSON().answers as Array<{ responseTimeMs?: number }>;

  expect(answers).toHaveLength(1);
  const ms = answers[0].responseTimeMs;
  expect(ms).toBeDefined();
  // Etwa eine Sekunde: die fünf Sekunden im Hintergrund zählen nicht (großzügig nach oben wegen langsamer Rechner).
  expect(ms!).toBeGreaterThanOrEqual(900);
  expect(ms!).toBeLessThan(4000);
});
