import { inArray } from "drizzle-orm";
import type { Page } from "@playwright/test";
import { getDb } from "../lib/server/db/client";
import { questions } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

const HUMAN_IDS = ["E2E-1.1-Q001", "E2E-1.1-Q002", "E2E-1.1-Q003"];

async function openQuickCheck(page: Page, baseUrl: string) {
  await login(page, baseUrl, USERS.learnerB.email);
  await page.goto(`${baseUrl}/cert/${COURSE_SLUG}`);
  // „Sitzt das?“ gibt es am Kapitelende: der Kurs führt je Kapitel zum Kapitel-Quiz.
  await page.getByTestId("chapter-quiz-entry").first().click();
  await page.waitForURL(/\/chapter\/.+\/quiz/);
}

test("Antwort zuerst überlegen: Optionen bleiben verdeckt, bis man sie zeigt", async ({ page, gateway }) => {
  await page.addInitScript(() => window.localStorage.setItem("proofpath-think-first", "1"));
  await openQuickCheck(page, gateway.url);
  await expect(page.getByTestId("options-hidden")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.getByTestId("show-options").click();
  await expect(page.getByTestId("options-hidden")).toHaveCount(0);
  await expect(page.getByRole("radio").first()).toBeVisible();
  await page.getByText(/^(Right|Richtig)$/).first().click();
  await expect(page.getByTestId("feedback-panel")).toBeVisible();
});

test("Ohne den Modus sind die Optionen sofort sichtbar", async ({ page, gateway }) => {
  await openQuickCheck(page, gateway.url);
  await expect(page.getByTestId("options-hidden")).toHaveCount(0);
  await expect(page.getByRole("radio").first()).toBeVisible();
});

test("Selbsterklärung nach falscher Szenario-Antwort: freiwillig, Vergleich mit der Musterantwort, Text bleibt lokal", async ({ page, gateway }) => {
  const db = getDb();
  await db.update(questions).set({ type: "scenario" }).where(inArray(questions.humanId, HUMAN_IDS));
  try {
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST") posts.push(r.url());
    });
    await openQuickCheck(page, gateway.url);
    await page.getByText(/^(Wrong|Falsch)$/).first().click();
    await expect(page.getByTestId("feedback-panel")).toHaveAttribute("data-correct", "false");

    await page.getByTestId("self-explain-open").click();
    await page.getByTestId("self-explain-input").fill("Weil es hier um die Ursache ging.");
    posts.length = 0;
    await page.getByTestId("self-explain-compare").click();
    await expect(page.getByTestId("self-explain-own")).toHaveText("Weil es hier um die Ursache ging.");
    // Musterantwort = die Erklärung der Frage (die steht im Feedback ebenfalls)
    const model = (await page.getByTestId("self-explain-model").textContent())?.trim() ?? "";
    expect(model.length).toBeGreaterThan(0);
    await expect(page.getByTestId("feedback-panel")).toContainText(model);
    // Nichts davon geht an den Server
    expect(posts).toEqual([]);
    const stored = await page.evaluate(() => window.localStorage.getItem("proofpath-self-explanations"));
    expect(stored).toContain("Weil es hier um die Ursache ging.");
  } finally {
    await db.update(questions).set({ type: "knowledge" }).where(inArray(questions.humanId, HUMAN_IDS));
  }
});

test("Bei richtiger Antwort oder Wissensfrage wird keine Selbsterklärung angeboten", async ({ page, gateway }) => {
  await openQuickCheck(page, gateway.url);
  await page.getByText(/^(Wrong|Falsch)$/).first().click();
  await expect(page.getByTestId("feedback-panel")).toBeVisible();
  await expect(page.getByTestId("self-explain-open")).toHaveCount(0);
});
