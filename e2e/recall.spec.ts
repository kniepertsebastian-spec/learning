import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Rückblick: Varianten am Session-Anfang, freundliche Rückmeldung am Ende", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.recallAnswer.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/session`);
  await expect(page.getByTestId("recall-intro")).toBeVisible();
  await expect(page.getByText(/Quick recap of|Kurzer Rückblick auf/)).toBeVisible();

  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(/^Variant\?$|^Variante\?$/)).toBeVisible(); // immer eine Variante, nie das Original
    await page.getByText(/^(Right|Richtig)$/).first().click();
    await page.getByRole("button", { name: /^(Sure|Sicher)$/ }).click();
    await page.getByRole("button", { name: i === 2 ? /Finish|Abschließen/ : /^(Next|Weiter)$/ }).first().click();
  }
  await expect(page.getByTestId("recall-result")).toContainText(/3 of 3|3 von 3/);
});

test("Rückblick überspringen: Fragen entfallen, der Rückblick kommt nicht erneut", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.recallSkip.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/session`);
  await expect(page.getByTestId("recall-intro")).toBeVisible();
  await page.getByTestId("recall-skip").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("recall-intro")).toHaveCount(0);
});
