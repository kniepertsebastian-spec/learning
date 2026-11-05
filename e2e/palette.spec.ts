import { COURSE_NAME, COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Command-Palette: ⌘K bzw. Strg+K öffnet sie, Kurse und Abschnitte werden gefunden, Enter springt hin", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/`);

  await page.keyboard.press("Control+K");
  const input = page.getByTestId("command-palette-input");
  await expect(input).toBeFocused();
  // Ohne Eingabe stehen die Seiten der Navigation da.
  await expect(page.getByTestId("command-palette-option").first()).toBeVisible();

  await input.fill("E2E Demo");
  const course = page.getByTestId("command-palette-option").filter({ hasText: COURSE_NAME });
  await expect(course.first()).toBeVisible();

  await input.fill(/^de/.test((await page.locator("html").getAttribute("lang")) ?? "") ? "Erste Lektion" : "First lesson");
  const section = page.getByTestId("command-palette-option").filter({ hasText: /Erste Lektion|First lesson/ });
  await expect(section.first()).toBeVisible();
  await expect(section.first()).toContainText(COURSE_NAME);

  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/cert/${COURSE_SLUG}/section/`));
  await expect(page.getByTestId("command-palette")).toHaveCount(0);
});

test("Command-Palette: Escape schließt sie, zu kurze Eingaben suchen nicht, Seiten springen ohne Server", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/`);

  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/palette")) requests.push(r.url());
  });
  await page.getByTestId("command-palette-trigger").click();
  const input = page.getByTestId("command-palette-input");
  await input.fill("e");
  await page.waitForTimeout(500);
  expect(requests).toEqual([]); // ein Zeichen reicht nicht für eine Suche

  await input.fill("catalog");
  await expect(page.getByTestId("command-palette-option").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("command-palette")).toHaveCount(0);

  await page.keyboard.press("Control+K");
  await page.getByTestId("command-palette-input").fill("catalog");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/catalog/);
});

test("Command-Palette: die Schnittstelle verlangt eine Anmeldung", async ({ page, gateway }) => {
  const response = await page.request.get(`${gateway.url}/api/palette?q=demo`);
  expect(response.status()).toBe(401);
});

test("Meine Schwachstellen: Seite für den Kurs erreichbar, ohne Quiz-Antworten ein leerer Zustand", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerB.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/weaknesses`);
  await expect(page.getByTestId("weaknesses-title")).toBeVisible();
  await expect(page.getByTestId("weaknesses-topic")).toHaveCount(0);
  await expect(page.getByText(/No quiz answers yet|Noch keine Quiz-Antworten|No weak spots found|Keine Schwachstellen erkannt/)).toBeVisible();
});
