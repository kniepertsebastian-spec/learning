import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Prüfer: sieht den zugewiesenen Kurs, meldet eine Frage, gibt frei; Admin-Bereich bleibt verschlossen", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.reviewer.email);
  await page.goto(`${gateway.url}/reviewer`);
  await expect(page.getByTestId("reviewer-course")).toHaveCount(1);

  // Kein Zugriff auf Admin- und Firmenbereich, unbekannte Kurse sind nicht auffindbar
  expect((await page.goto(`${gateway.url}/admin`))?.status()).toBe(403);
  expect((await page.goto(`${gateway.url}/reviewer/gibt-es-nicht`))?.status()).toBe(404);

  await page.goto(`${gateway.url}/reviewer/${COURSE_SLUG}`);
  await expect(page.getByTestId("reviewer-course-page")).toBeVisible();
  const question = page.getByTestId("reviewer-question").first();
  await question.getByTestId("reviewer-comment-open").click();
  const text = `Lösung prüfen ${Date.now()}`;
  await question.getByTestId("reviewer-comment-text").fill(text);
  await question.getByTestId("reviewer-faulty-send").click();
  await expect(question.getByTestId("reviewer-item-comment")).toContainText(text);

  // Freigabe nur mit Bestätigung
  await expect(page.getByTestId("reviewer-approve")).toBeDisabled();
  await page.getByLabel(/Name, der bei der Freigabe angezeigt wird|Name shown with the approval/).fill("E2E Prüfer");
  await page.getByTestId("reviewer-confirm").check();
  await page.getByTestId("reviewer-approve").click();
  await expect(page.getByTestId("reviewer-approval-line")).toContainText("E2E Prüfer");

  // Der Admin sieht den Kommentar und erledigt ihn
  await page.context().clearCookies();
  await login(page, gateway.url, USERS.admin.email);
  await page.goto(`${gateway.url}/admin/reviewers`);
  const row = page.getByTestId("reviewer-comments").getByText(text);
  await expect(row).toBeVisible();
  await row.locator("xpath=..").getByRole("button", { name: /Erledigt|Resolve/ }).click();
  await expect(page.getByTestId("reviewer-comments").getByText(text)).toHaveCount(0);
});
