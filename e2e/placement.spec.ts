import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

async function openPlacement(page: import("@playwright/test").Page, baseUrl: string) {
  await page.goto(`${baseUrl}/cert/${COURSE_SLUG}`);
  await page.getByTestId("placement-entry").first().click();
  await page.waitForURL(/\/placement\//);
}

async function answer(page: import("@playwright/test").Page, option: RegExp) {
  await page.getByText(option).first().click();
  await page.getByRole("button", { name: /^(Sure|Sicher)$/ }).click();
  await page.getByTestId("placement-submit").click();
  await expect(page.getByTestId("placement-result")).toBeVisible();
}

test("Einstiegstest: nicht bestanden zeigt das schwache Lernziel, nichts wird übersprungen", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.placement.email);
  await openPlacement(page, gateway.url);
  await answer(page, /^(Wrong|Falsch)$/);
  await expect(page.getByTestId("placement-result")).toHaveAttribute("data-passed", "false");
  await expect(page.getByTestId("placement-open")).toBeVisible();
  await expect(page.getByRole("link", { name: /Start here|Hier starten/ })).toBeVisible();
});

test("Einstiegstest: bestanden überspringt die Lektionen (als 'übersprungen' markiert)", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.placement.email);
  await openPlacement(page, gateway.url);
  await answer(page, /^(Right|Richtig)$/);
  await expect(page.getByTestId("placement-result")).toHaveAttribute("data-passed", "true");
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await expect(page.getByTestId("skipped-badge").first()).toBeVisible();
});
