import { USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

// iPhone-Safari: keine Installationsschaltfläche des Browsers, stattdessen die Anleitung „Teilen → Zum Home-Bildschirm“.
test.use({
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});

test("iOS-Anleitung erscheint im Dashboard und bleibt nach „Nicht jetzt“ 30 Tage weg", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerB.email);
  await page.goto(`${gateway.url}/`);
  await expect(page.getByTestId("install-ios-steps")).toBeVisible();
  await page.getByTestId("install-dismiss").click();
  await expect(page.getByTestId("install-banner")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await expect(page.getByTestId("install-banner")).toHaveCount(0);
});
