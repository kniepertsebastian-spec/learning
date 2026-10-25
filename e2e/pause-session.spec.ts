import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

/**
 * „Pause für heute“: Die Tages-Session sagt, was sie ist (kein Einstiegstest), speichert beim Pausieren die Antworten und
 * geht später bei der nächsten offenen Frage weiter.
 */
test("Session pausieren und später genau dort weitermachen", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.pauser.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/session`);

  // Die Session sagt, was sie ist.
  await expect(page.getByTestId("session-intro")).toContainText(/kein Einstiegstest|not an entry test/);

  // Eine Frage beantworten (Sofort-Feedback), dann pausieren.
  await page.getByText(/^(Right|Richtig)$/).first().click();
  await expect(page.getByTestId("feedback-panel")).toBeVisible();
  const pause = page.waitForResponse((r) => /\/pause$/.test(r.url()));
  await page.getByTestId("pause-today").click();
  expect((await pause).ok()).toBe(true);
  await page.waitForURL(new RegExp(`/cert/${COURSE_SLUG}$`));

  // Die Kursseite bietet das Weitermachen an.
  await expect(page.getByRole("link", { name: /Continue \(1|Weitermachen \(1/ })).toBeVisible();

  // Später: dieselbe Session, die erste Antwort ist da, es geht bei der nächsten Frage weiter.
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/session`);
  await expect(page.getByTestId("resume-note")).toBeVisible();
  await expect(page.getByTestId("session-intro")).toHaveCount(0);
  await expect(page.getByRole("radio").first()).toBeVisible();
});
