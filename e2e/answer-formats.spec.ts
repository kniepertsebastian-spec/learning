import { FORMATS_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

/** Löst die drei Formate der Reihe nach richtig: Reihenfolge (Lösung kennt der Test), Kurzantwort, Zuordnung. */
async function answerAll(page: import("@playwright/test").Page, finishLabel: RegExp) {
  // Reihenfolge: nach oben schieben, bis die Schritte stimmen (Erkennen, Eingrenzen, Beheben).
  await expect(page.getByTestId("answer-ordering")).toBeVisible();
  const wanted = [/Erkennen|Identify/, /Eingrenzen|Narrow down/, /Beheben|Fix/];
  for (let target = 0; target < 3; target++) {
    for (let guard = 0; guard < 5; guard++) {
      const steps = page.getByTestId("ordering-step");
      if (await steps.nth(target).filter({ hasText: wanted[target] }).count()) break;
      const at = await steps.evaluateAll((els, re) => els.findIndex((e) => new RegExp(re).test(e.textContent ?? "")), wanted[target].source);
      await steps.nth(at).getByTestId("ordering-up").click();
    }
  }
  await page.getByTestId("check-answer").click();
  await expect(page.getByTestId("feedback-panel")).toHaveAttribute("data-correct", "true");
  await page.getByTestId("next-question").click();

  await page.getByTestId("short-answer-input").fill("  IPConfig /ALL ");
  await page.getByTestId("check-answer").click();
  await expect(page.getByTestId("feedback-panel")).toHaveAttribute("data-correct", "true");
  await page.getByTestId("next-question").click();

  const rows = page.getByTestId("matching-row");
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i);
    const label = (await row.textContent()) ?? "";
    await row.getByTestId("matching-select").selectOption({ label: /DNS/.test(label) ? (await row.locator("option", { hasText: /Namen auflösen|Resolve names/ }).textContent())! : (await row.locator("option", { hasText: /Adressen vergeben|Assign addresses/ }).textContent())! });
  }
  await page.getByTestId("check-answer").click();
  await expect(page.getByTestId("feedback-panel")).toHaveAttribute("data-correct", "true");
  await page.getByTestId("next-question").click();
  void finishLabel;
}

test("Lektionstest mit allen neuen Antwortformaten", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.formats.email);
  await page.goto(`${gateway.url}/cert/${FORMATS_SLUG}`);
  await page.getByRole("link", { name: /Formats lesson|Formate-Lektion/ }).first().click();
  await page.waitForURL(/\/section\//);
  await page.getByRole("button", { name: /Start quick check|Schnelltest starten/i }).first().click();
  const attempt = page.waitForResponse((r) => /\/api\/sections\/.+\/attempt/.test(r.url()) && r.request().method() === "POST");
  await answerAll(page, /Finish|Abschließen/);
  const response = await attempt;
  expect(response.ok()).toBe(true);
  expect((response.request().postDataJSON() as { answers: Array<{ answer?: { kind: string } }> }).answers.map((a) => a.answer?.kind)).toEqual(["ordering", "short_answer", "matching"]);
});

test("falsche Antwort zeigt die Lösung, nicht vorher", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.formats.email);
  await page.goto(`${gateway.url}/cert/${FORMATS_SLUG}`);
  await page.getByRole("link", { name: /Formats lesson|Formate-Lektion/ }).first().click();
  await page.waitForURL(/\/section\//);
  await page.getByRole("button", { name: /Start quick check|Schnelltest starten/i }).first().click();
  await expect(page.getByTestId("answer-solution")).toHaveCount(0);
  await page.getByTestId("check-answer").click(); // Startreihenfolge ist nie die Lösung
  await expect(page.getByTestId("feedback-panel")).toHaveAttribute("data-correct", "false");
  await expect(page.getByTestId("answer-solution")).toBeVisible();
});

test("Tages-Session mit neuen Formaten: Aufgabe ohne Lösung, Auswertung vom Server", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.formatsSession.email);
  await page.goto(`${gateway.url}/cert/${FORMATS_SLUG}/session`);
  await expect(page.getByTestId("format-question").first()).toBeVisible();
  // Die Lösung steht nicht im ausgelieferten HTML.
  expect(await page.content()).not.toContain("ipconfig /all");
  const reveal = page.waitForResponse((r) => /\/reveal$/.test(r.url()));
  await page.getByTestId("check-answer").click();
  expect((await reveal).ok()).toBe(true);
  await expect(page.getByTestId("feedback-panel")).toBeVisible();
});
