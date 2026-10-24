import { sql } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { questions } from "../lib/server/db/schema";
import { FORMATS_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Werkstatt: Kurzantwort-Frage anlegen, Vorschau, Format bleibt in der Liste erkennbar", async ({ page, gateway }) => {
  const marker = `E2E-Werkstatt-${Date.now()}`;
  try {
    await login(page, gateway.url, USERS.admin.email);
    await page.goto(`${gateway.url}/admin/certifications/${FORMATS_SLUG}/workshop`);
    await page.getByTestId("tree-questions").first().click();
    await page.getByTestId("question-new").click();

    // Das Formular der neuen Frage steht vor den vorhandenen; „Beide Sprachen gleich“ ist dort schon angehakt.
    const form = page.getByTestId("question-form").first();
    await form.getByTestId("question-format").selectOption("short_answer");
    await form.getByTestId("question-text").fill(marker);
    await form.getByLabel(/Explanation \(Markdown\)|Erklärung \(Markdown\)/).fill("Weil.");
    await form.getByTestId("format-accepted").fill("netstat -an\nnetstat /an");

    // Vorschau zeigt die Aufgabe so, wie Lernende sie sehen (ohne Lösung)
    await form.getByTestId("format-preview").locator("summary").click();
    await expect(form.getByTestId("format-preview").getByTestId("short-answer-input")).toBeVisible();

    await form.getByTestId("question-save").click();
    const created = page.getByTestId("question-item").filter({ hasText: marker });
    await expect(created).toBeVisible();
    await expect(created).toContainText(/Short answer|Kurzantwort/);
  } finally {
    await getDb().delete(questions).where(sql`${questions.question}->>'de' = ${marker}`);
  }
});
