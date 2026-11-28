import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

/** Der Weg zurück ist überall sichtbar: Leiste oben in der App, beschriftete Knöpfe im Fokusmodus. */
test("Unterseite eines Kurses: Zurück zum Kurs und Dashboard sind sichtbar", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/history`);
  await expect(page.getByTestId("back-link")).toContainText(/Back to the course|Zurück zum Kurs/);
  await expect(page.getByTestId("home-link")).toContainText(/dashboard|Dashboard/);
  await page.getByTestId("back-link").click();
  await page.waitForURL(new RegExp(`/cert/${COURSE_SLUG}$`));

  // Der Kurs selbst führt mit „Zurück“ zum Dashboard; ein zweiter Dashboard-Knopf wäre doppelt.
  await expect(page.getByTestId("back-link")).toContainText(/Back to the dashboard|Zurück zum Dashboard/);
  await expect(page.getByTestId("home-link")).toHaveCount(0);
  await page.getByTestId("back-link").click();
  await page.waitForURL(`${gateway.url}/`);
  await expect(page.getByTestId("back-bar")).toHaveCount(0); // auf dem Dashboard selbst gibt es keinen Weg zurück
});

test("Fokusmodus: beschriftete Knöpfe zum Kurs und zum Dashboard", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerB.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await page.getByTestId("chapter-quiz-entry").first().click();
  await page.waitForURL(/\/chapter\/.+\/quiz/);
  await expect(page.getByTestId("focus-close")).toContainText(/Back to (the )?course|Zurück zum Kurs/);
  await page.getByTestId("focus-dashboard").click();
  await page.waitForURL(`${gateway.url}/`);
});

/**
 * PWA-Review 28.11.2026 (AP-2.1): Auch ohne Anmeldung ist der erste Tab-Stop der Skip-Link; er wird sichtbar und führt zum
 * Inhalt (WCAG 2.4.1). Vorher gab es ihn nur im angemeldeten Layout.
 */
for (const path of ["/login", "/offline", "/catalog"]) {
  test(`${path}: erster Tab-Stop ist der sichtbare Skip-Link`, async ({ page, gateway }) => {
    await page.goto(`${gateway.url}${path}`);
    await expect(page.locator("main#main")).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByTestId("skip-link");
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await expect(skip).toHaveAttribute("href", "#main");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
}
