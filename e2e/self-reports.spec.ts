import { and, eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications, domains, lessonCompletions, objectives, sections, selfReports, users } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

async function userId(email: string) {
  const [row] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return row.id;
}

/**
 * Aufgabe 18 (Review 12.11.2026): freiwillige Fragen. 5.4 (Grund fürs Lernen) einmal je Kurs auf der Kursseite, 5.1 (Anstrengung) nach
 * dem Lektionstest. Jede Frage lässt sich überspringen, und einmal gefragt kommt sie für denselben Bezug nicht wieder.
 */
test("Kursseite: Frage nach dem Grund fürs Lernen beantworten, danach nicht noch einmal", async ({ page, gateway }) => {
  // Der Test läuft auf einer Datenbank, die Läufe überdauert: frisch anfangen.
  await getDb().delete(selfReports).where(eq(selfReports.userId, await userId(USERS.selfReportCourse.email)));
  await login(page, gateway.url, USERS.selfReportCourse.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await expect(page.getByTestId("self-report-prompt")).toHaveAttribute("data-kind", "learning_reason");
  // Freiwillig und überspringbar.
  await expect(page.getByTestId("self-report-skip")).toBeVisible();
  await page.getByTestId("self-report-option-job").click();
  await expect(page.getByTestId("self-report-thanks")).toBeVisible();

  const id = await userId(USERS.selfReportCourse.email);
  const rows = await getDb().select().from(selfReports).where(and(eq(selfReports.userId, id), eq(selfReports.kind, "learning_reason")));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ value: "job", refType: "course" });

  // Einmal gefragt: beim Neuladen fragt der Server nach, bekommt „keine Frage“ und zeigt nichts.
  const next = page.waitForResponse((r) => /\/api\/self-reports\/next/.test(r.url()));
  await page.reload();
  expect(((await (await next).json()) as { question: unknown }).question).toBeNull();
  await expect(page.getByTestId("self-report-prompt")).toHaveCount(0);
});

test("Nach der Lektion: Frage zur Anstrengung, überspringbar und nur einmal je Lektion", async ({ page, gateway }) => {
  const db = getDb();
  const [section] = await db
    .select({ id: sections.id })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(certifications, eq(certifications.id, domains.certificationId))
    .where(eq(certifications.slug, COURSE_SLUG))
    .limit(1);
  const id = await userId(USERS.selfReportLesson.email);
  // Der Test läuft auf einer Datenbank, die Läufe überdauert: frisch anfangen (Lektion nicht abgeschlossen, nichts gefragt).
  await db.delete(selfReports).where(eq(selfReports.userId, id));
  await db.delete(lessonCompletions).where(and(eq(lessonCompletions.userId, id), eq(lessonCompletions.sectionId, section.id)));

  await login(page, gateway.url, USERS.selfReportLesson.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}/section/${section.id}`);
  // Vor dem Abschluss der Lektion wird nichts gefragt.
  await expect(page.getByTestId("lesson-complete-button")).toBeVisible();
  await expect(page.getByTestId("self-report-prompt")).toHaveCount(0);
  await page.getByTestId("lesson-complete-button").click();
  await expect(page.getByTestId("self-report-prompt")).toHaveAttribute("data-kind", "effort");
  await page.getByTestId("self-report-option-4").click();
  await expect(page.getByTestId("self-report-thanks")).toBeVisible();

  const rows = await db.select().from(selfReports).where(eq(selfReports.userId, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: "effort", value: "4", refType: "section", refId: section.id });

  // Dieselbe Lektion noch einmal: keine neue Frage (je Lektion einmal, je Tag eine).
  const next = page.waitForResponse((r) => /\/api\/self-reports\/next/.test(r.url()));
  await page.reload();
  expect(((await (await next).json()) as { question: unknown }).question).toBeNull();
  await expect(page.getByTestId("self-report-prompt")).toHaveCount(0);
});
