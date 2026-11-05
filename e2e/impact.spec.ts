import { USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Wirkungsbericht: Admin sieht ihn über die Statistik, Lernende nicht", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  expect((await page.goto(`${gateway.url}/admin/impact`))?.status()).toBe(403);
  await page.context().clearCookies();

  await login(page, gateway.url, USERS.admin.email);
  await page.goto(`${gateway.url}/admin/stats`);
  await page.getByTestId("admin-impact-link").click();
  await page.waitForURL(/\/admin\/impact/);
  await expect(page.getByTestId("impact-report")).toBeVisible();
  for (const id of ["impact-calibration", "impact-recall", "impact-flags", "impact-understanding"]) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId("impact-pass-rate")).toBeVisible();
  expect(await page.getByTestId("impact-flag-row").count()).toBeGreaterThan(3);
});
