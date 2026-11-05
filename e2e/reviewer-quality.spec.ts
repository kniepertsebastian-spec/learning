import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications, courseApprovals, domains, objectives, questions, secondReviews, users } from "../lib/server/db/schema";
import { USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Zweitprüfung: der zugewiesene Prüfer urteilt, „stimmt nicht“ braucht eine Begründung, die Abweichung steht beim Admin", async ({ page, gateway }) => {
  const db = getDb();
  // Eigener Kurs für diesen Test: Freigaben lassen sich nicht einzeln löschen (append-only), nur zusammen mit dem Kurs.
  const [cert] = await db.insert(certifications).values({ slug: `e2e-second-${Date.now()}`, name: "E2E Zweitprüfung", provider: "E2E", examName: "E2E", examVersion: "1" }).returning();
  const [reviewer] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.reviewer.email));
  const [domain] = await db.insert(domains).values({ certificationId: cert.id, orderNum: 1, name: "Domain" }).returning();
  const [objective] = await db.insert(objectives).values({ domainId: domain.id, code: "1.1", title: "Ziel" }).returning();
  const [question] = await db
    .insert(questions)
    .values({ humanId: `E2E-ZP-${Date.now()}`, objectiveId: objective.id, difficulty: "easy", type: "single", question: { de: "Frage?", en: "Question?" }, explanation: { de: "Darum.", en: "Because." } })
    .returning({ id: questions.id, humanId: questions.humanId });
  const [approval] = await db
    .insert(courseApprovals)
    .values({ certificationId: cert.id, kind: "approval", reviewerUserId: null, reviewerDisplayName: "E2E Erstprüfer", contentHash: randomUUID(), fingerprints: { sections: {}, questions: { [question.id]: "h" } }, versionLabel: "e2e-1.0" })
    .returning();
  const [sample] = await db.insert(secondReviews).values({ approvalId: approval.id, questionId: question.id, reviewerUserId: reviewer.id }).returning();
  const comment = `E2E-Abweichung ${Date.now()}`;
  try {
    await login(page, gateway.url, USERS.reviewer.email);
    await page.goto(`${gateway.url}/reviewer`);
    await expect(page.getByTestId("reviewer-second-review-link")).toContainText(/open|offen/);
    await page.getByTestId("reviewer-second-review-link").click();
    await page.waitForURL(/\/reviewer\/second-review/);
    const card = page.getByTestId("second-review-card").filter({ hasText: question.humanId });
    await expect(card).toBeVisible();

    await card.getByTestId("second-review-disagree").click(); // ohne Begründung
    await expect(card.getByRole("alert")).toBeVisible();
    expect((await db.select().from(secondReviews).where(eq(secondReviews.id, sample.id)))[0].status).toBe("pending");

    await card.getByTestId("second-review-comment").fill(comment);
    await card.getByTestId("second-review-disagree").click();
    await expect(page.getByTestId("second-review-card").filter({ hasText: question.humanId })).toHaveCount(0);
    await expect.poll(async () => (await db.select().from(secondReviews).where(eq(secondReviews.id, sample.id)))[0].status).toBe("deviated");

    // Beim Admin; Prüfer und Lernende sehen die Kennzahlen nicht.
    await page.context().clearCookies();
    await login(page, gateway.url, USERS.admin.email);
    await page.goto(`${gateway.url}/admin/reviewers`);
    await expect(page.getByTestId("reviewer-quality")).toBeVisible();
    await expect(page.getByTestId("quality-deviation").filter({ hasText: comment })).toBeVisible();
  } finally {
    await db.delete(certifications).where(eq(certifications.id, cert.id)); // löscht Freigabe und Stichprobe mit (CASCADE)
  }
});

test("Zweitprüfung und Kennzahlen: nur für die dafür vorgesehenen Rollen", async ({ page, gateway }) => {
  expect((await page.request.post(`${gateway.url}/api/reviewer/second-review/${randomUUID()}`, { data: { verdict: "agree" } })).status()).toBe(401);

  await login(page, gateway.url, USERS.learnerA.email);
  expect((await page.request.post(`${gateway.url}/api/reviewer/second-review/${randomUUID()}`, { data: { verdict: "agree" } })).status()).toBe(403);
  const adminPage = await page.goto(`${gateway.url}/admin/reviewers`);
  expect(adminPage?.status()).toBe(403);
  await page.context().clearCookies();

  await login(page, gateway.url, USERS.reviewer.email);
  expect((await page.request.post(`${gateway.url}/api/reviewer/second-review/${randomUUID()}`, { data: { verdict: "agree" } })).status()).toBe(404); // fremde oder unbekannte Stichprobe
  expect((await page.request.post(`${gateway.url}/api/reviewer/second-review/kein-uuid`, { data: { verdict: "agree" } })).status()).toBe(400);
  const quality = await page.goto(`${gateway.url}/admin/reviewers`);
  expect(quality?.status()).toBe(403); // Prüfer sehen die Kennzahlen nicht
});
