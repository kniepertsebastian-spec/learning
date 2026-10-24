import { eq, like } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { probeAttempts, probeSets, reviewerQualifications, users } from "../lib/server/db/schema";
import { createProbeSet, saveProbeSet } from "../lib/server/reviewers/probe-service";
import { USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

const TITLE = "E2E Probe-Satz";

async function freshSet(): Promise<void> {
  const db = getDb();
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.admin.email)).limit(1);
  await db.delete(probeSets).where(like(probeSets.title, `${TITLE}%`)); // Versuche fallen mit
  const id = await createProbeSet(admin.id, { title: TITLE, topic: "Netzwerk", language: "de" });
  const items = Array.from({ length: 16 }, (_, i) => ({
    question: `Probe-Frage ${i + 1}?`,
    options: [{ text: "Antwort A", isCorrect: true }, { text: "Antwort B", isCorrect: false }, { text: "Antwort C", isCorrect: false }, { text: "Antwort D", isCorrect: false }],
    explanation: "Weil.",
    plantedError: i < 5 ? { type: "wrong_key" as const, note: `Eingebauter Fehler ${i + 1}` } : null,
  }));
  await saveProbeSet(id, { title: TITLE, topic: "Netzwerk", language: "de", active: true, items });
}

test("Probe-Review: ohne Freischaltung kein Freigeben, Bestehen schaltet frei, Ergebnis nur beim Admin", async ({ page, browser, gateway }) => {
  const db = getDb();
  const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.reviewerNew.email)).limit(1);
  await db.delete(probeAttempts).where(eq(probeAttempts.userId, me.id));
  await db.delete(reviewerQualifications).where(eq(reviewerQualifications.userId, me.id));
  await freshSet();

  await login(page, gateway.url, USERS.reviewerNew.email);
  await page.goto(`${gateway.url}/reviewer`);
  await expect(page.getByTestId("reviewer-not-qualified")).toBeVisible();

  await page.getByTestId("reviewer-probe-link").click();
  await page.waitForURL(/\/reviewer\/probe/);
  await page.getByTestId("probe-begin").first().click();
  await expect(page.getByTestId("probe-attempt")).toBeVisible();
  // Der Kandidat sieht weder Fehlertyp noch Notiz der eingebauten Fehler
  await expect(page.locator("body")).not.toContainText("Eingebauter Fehler");

  // Die ersten vier der fünf eingebauten Fehler melden
  for (let i = 0; i < 4; i++) {
    const item = page.getByTestId("probe-item").nth(i);
    await item.getByTestId("probe-report-open").click();
    await item.getByTestId("probe-report-text").fill(`Der Schlüssel ist bei Frage ${i + 1} falsch.`);
    await item.getByTestId("probe-report-save").click();
    await expect(item).toHaveAttribute("data-reported", "true");
  }
  await expect(page.getByTestId("probe-count")).toContainText(/4/);

  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("probe-submit").click();
  await expect(page.getByTestId("probe-result")).toHaveAttribute("data-passed", "true");

  // Freigeschaltet: Hinweis auf der Startseite weg
  await page.goto(`${gateway.url}/reviewer`);
  await expect(page.getByTestId("reviewer-not-qualified")).toHaveCount(0);
  await page.goto(`${gateway.url}/reviewer/probe`);
  await expect(page.getByTestId("probe-qualified")).toBeVisible();

  // Der Admin sieht die Einzelheiten
  const adminPage = await (await browser.newContext({ baseURL: gateway.url })).newPage();
  await login(adminPage, gateway.url, USERS.admin.email);
  await adminPage.goto(`${gateway.url}/admin/reviewers/probe`);
  const row = adminPage.getByTestId("probe-result-row").filter({ hasText: USERS.reviewerNew.email }).first();
  await expect(row).toContainText(/4 von 5|4 of 5/);
  await expect(adminPage.getByTestId("probe-qualification-row").filter({ hasText: USERS.reviewerNew.email })).toContainText(/Probe bestanden|passed trial/);
});

test("Probe-Review: Admin legt einen Satz an; Kandidaten und Lernende kommen nicht an die Verwaltung", async ({ page, browser, gateway }) => {
  const db = getDb();
  const marker = `E2E Satz ${Date.now()}`;
  try {
    await login(page, gateway.url, USERS.admin.email);
    await page.goto(`${gateway.url}/admin/reviewers/probe`);
    await page.getByTestId("probe-new-title").fill(marker);
    await page.getByTestId("probe-new-topic").fill("Sicherheit");
    await page.getByTestId("probe-new-create").click();
    await expect(page.getByTestId("probe-editor")).toBeVisible();
    // Aktivieren geht erst mit einem gültigen Satz
    await page.getByTestId("probe-active").check();
    await page.getByTestId("probe-save").click();
    await expect(page.getByTestId("probe-admin-message")).toContainText(/aktivieren|activate/i);

    const learner = await (await browser.newContext({ baseURL: gateway.url })).newPage();
    await login(learner, gateway.url, USERS.learnerA.email);
    expect((await learner.goto(`${gateway.url}/admin/reviewers/probe`))?.status()).toBe(403);
    expect((await learner.request.post(`${gateway.url}/api/admin/reviewers/probe/sets`, { data: { title: "x", topic: "y", language: "de" } })).status()).toBe(403);
    expect((await learner.goto(`${gateway.url}/reviewer/probe`))?.status()).toBe(403);
  } finally {
    await db.delete(probeSets).where(eq(probeSets.title, marker));
  }
});
