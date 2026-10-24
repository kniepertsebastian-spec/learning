import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { questions } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Werkstatt: Änderung nach der Freigabe zeigt „Änderung seit Prüfung“, Neufreigabe mit Bestätigung räumt sie weg", async ({ page, gateway }) => {
  const db = getDb();
  // Eine Frage des E2E-Kurses ändern (jedes Mal anders), damit der Stand sicher von der letzten Freigabe abweicht.
  const [target] = await db.select({ id: questions.id }).from(questions).where(eq(questions.humanId, "E2E-1.1-Q001")).limit(1);
  await db.update(questions).set({ explanation: { de: `Erklärung ${Date.now()}`, en: `Explanation ${Date.now()}` } }).where(eq(questions.id, target.id));

  await login(page, gateway.url, USERS.admin.email);
  await page.goto(`${gateway.url}/admin/certifications/${COURSE_SLUG}/workshop`);
  const panel = page.getByTestId("course-approval");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("approval-open")).toBeVisible();

  await page.getByTestId("approval-open").click();
  await page.getByLabel(/Name der prüfenden Person|Reviewer name/).fill("Dr. E2E Prüfer");
  await expect(page.getByTestId("approval-submit")).toBeDisabled(); // erst mit Bestätigung
  await page.getByTestId("approval-confirm").check();
  await page.getByTestId("approval-submit").click();

  await expect(panel).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("approval-line")).toContainText("Dr. E2E Prüfer");
  await expect(page.getByTestId("approval-current")).toBeVisible();

  // Wieder eine Änderung: der Hinweis erscheint
  await db.update(questions).set({ explanation: { de: `Noch einmal ${Date.now()}`, en: `Again ${Date.now()}` } }).where(eq(questions.id, target.id));
  await page.reload();
  await expect(page.getByTestId("approval-changed")).toContainText(/1 Änderung seit Prüfung|1 change since review/);
});
