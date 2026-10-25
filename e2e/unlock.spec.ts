import type { Page } from "@playwright/test";
import { UNLOCK_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

/** Lektion öffnen, abschließen und das Kapitel-Quiz (zwei Fragen) richtig beantworten. */
async function completeChapter(page: Page, baseUrl: string, lesson: RegExp) {
  await page.goto(`${baseUrl}/cert/${UNLOCK_SLUG}`);
  await page.getByRole("link", { name: lesson }).first().click();
  await page.waitForURL(/\/section\//);
  await page.getByTestId("lesson-complete-button").click();
  await expect(page.getByText(/Lesson completed|Lektion durchgearbeitet/)).toBeVisible();
  await page.getByTestId("start-chapter-quiz").click();
  await page.waitForURL(/\/chapter\/.+\/quiz/);
  const attempt = page.waitForResponse((r) => /\/api\/chapters\/.+\/attempt/.test(r.url()) && r.request().method() === "POST");
  for (let i = 0; i < 2; i++) {
    await page.getByText(/^(Right|Richtig)$/).first().click();
    await expect(page.getByTestId("feedback-panel")).toBeVisible();
    await page.getByTestId("next-question").click();
  }
  expect((await attempt).ok()).toBe(true);
  await expect(page.getByTestId("result-summary")).toBeVisible();
}

test("Merkzettel und Simulationen wachsen mit den abgeschlossenen Kapiteln", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.unlock.email);

  // Zu Beginn: Merkzettel nur mit den Grundlagen des ersten Kapitels, keine Simulation freigeschaltet.
  await page.goto(`${gateway.url}/cert/${UNLOCK_SLUG}/cheatsheets`);
  await expect(page.getByTestId("cheatsheet-entry")).toHaveCount(1);
  await expect(page.getByTestId("cheatsheet-entry")).toContainText(/Merksatz 1|Key point 1/);
  await expect(page.getByTestId("cheatsheets-locked")).toContainText("Kapitel 2");
  await page.goto(`${gateway.url}/cert/${UNLOCK_SLUG}/simulations`);
  await expect(page.getByTestId("simulations-none-unlocked")).toBeVisible();
  await expect(page.getByTestId("simulation-entry")).toHaveCount(0);
  await expect(page.getByTestId("simulation-locked-entry")).toHaveCount(2);

  // Kapitel 1 abgeschlossen: seine Simulation ist frei, Kapitel 2 bleibt gesperrt.
  await completeChapter(page, gateway.url, /Lesson 1|Lektion 1/);
  await page.goto(`${gateway.url}/cert/${UNLOCK_SLUG}/simulations`);
  await expect(page.getByTestId("simulation-entry")).toHaveCount(1);
  await expect(page.getByTestId("simulation-locked-entry")).toHaveCount(1);
  await page.goto(`${gateway.url}/cert/${UNLOCK_SLUG}/cheatsheets`);
  await expect(page.getByTestId("cheatsheet-entry")).toHaveCount(1);

  // Kapitel 2 abgeschlossen: der Merkzettel wird um dessen Merksätze ergänzt, nichts ist mehr gesperrt.
  await completeChapter(page, gateway.url, /Lesson 2|Lektion 2/);
  await page.goto(`${gateway.url}/cert/${UNLOCK_SLUG}/cheatsheets`);
  await expect(page.getByTestId("cheatsheet-entry")).toHaveCount(2);
  await expect(page.getByTestId("cheatsheets-locked")).toHaveCount(0);
  await page.goto(`${gateway.url}/cert/${UNLOCK_SLUG}/simulations`);
  await expect(page.getByTestId("simulation-entry")).toHaveCount(2);
  await expect(page.getByTestId("simulations-locked")).toHaveCount(0);
});
