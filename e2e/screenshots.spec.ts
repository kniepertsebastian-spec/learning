import { mkdirSync } from "node:fs";
import { USERS } from "./global-setup";
import { login, test } from "./fixtures";

/**
 * Erzeugt die Bilder für den Installationsdialog (public/screenshots, siehe public/manifest.json). Läuft nur mit
 * GENERATE_SCREENSHOTS=1, damit die normale Testsuite keine Dateien verändert:
 *   npm run build && GENERATE_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 */
test.skip(!process.env.GENERATE_SCREENSHOTS, "nur auf Anforderung");
test.use({ locale: "de-DE", colorScheme: "dark" });

for (const shot of [
  { name: "dashboard-wide", width: 1280, height: 720 },
  { name: "dashboard-narrow", width: 540, height: 960 },
]) {
  test(`Screenshot ${shot.name}`, async ({ page, gateway }) => {
    mkdirSync("public/screenshots", { recursive: true });
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await login(page, gateway.url, USERS.learnerA.email);
    await page.goto(`${gateway.url}/`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `public/screenshots/${shot.name}.png` });
  });
}
