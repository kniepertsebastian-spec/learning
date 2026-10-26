import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certificationSources, certifications, feedbackReports } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Prüfungstermin: Hinweis als unverbindlicher Richtwert, Termin direkt im Kurs-Dashboard änderbar", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await expect(page.getByTestId("exam-date-hint")).toContainText(/unverbindlicher Richtwert|non-binding guide/);
  await expect(page.getByTestId("exam-date-hint-panel")).toBeVisible(); // auch im Lernziel-Formular
  await page.getByTestId("exam-date-edit").click();
  await page.getByTestId("exam-date-input").fill("2031-05-17");
  await page.getByTestId("exam-date-save").click();
  await expect(page.getByTestId("exam-date-current")).toContainText(/17\.05\.2031|17\/05\/2031/);
  await page.reload();
  await expect(page.getByTestId("exam-date-current")).toContainText(/17\.05\.2031|17\/05\/2031/);
});

test("Problem melden: mit Kurs- und Lektionsbezug, der Admin sieht es und schließt es ab", async ({ page, gateway }) => {
  const message = `E2E-Meldung ${Date.now()}`;
  await login(page, gateway.url, USERS.learnerB.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await expect(page.getByTestId("feedback-open")).toBeVisible();
  await page.getByRole("link", { name: /First lesson|Erste Lektion/ }).first().click();
  await page.waitForURL(/\/section\//);
  await page.getByTestId("feedback-open").click();
  await page.getByTestId("feedback-category-typo").check({ force: true });
  await page.getByTestId("feedback-message").fill(message);
  await page.getByTestId("feedback-send").click();
  await expect(page.getByTestId("feedback-sent")).toBeVisible();

  const [row] = await getDb().select().from(feedbackReports).where(eq(feedbackReports.message, message));
  expect(row).toMatchObject({ category: "typo", status: "open" });
  expect(row.certificationId).toBeTruthy();
  expect(row.domainId).toBeTruthy();
  expect(row.sectionId).toBeTruthy();

  await page.context().clearCookies();
  await login(page, gateway.url, USERS.admin.email);
  await page.goto(`${gateway.url}/admin/certifications/${COURSE_SLUG}`);
  const item = page.getByTestId("feedback-item").filter({ hasText: message });
  await expect(item).toBeVisible();
  await item.getByTestId("feedback-resolve").click();
  await expect(page.getByTestId("feedback-item").filter({ hasText: message })).toHaveCount(0);
});

test("Quellen & Fachliteratur: einklappbar am Kursende für Lernende", async ({ page, gateway }) => {
  const db = getDb();
  const [course] = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.slug, COURSE_SLUG));
  const [source] = await db
    .insert(certificationSources)
    .values({ certificationId: course.id, sourceType: "url", title: `E2E Prüfungsleitfaden ${Date.now()}`, provider: "E2E Verlag", sourceUrl: "https://example.org/leitfaden", storageKey: "e2e/none", mimeType: "text/html", fileSizeBytes: 1, checksum: `e2e-${Date.now()}`, status: "approved", versionLabel: "7.0" })
    .returning();
  try {
    await login(page, gateway.url, USERS.learnerA.email);
    await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
    const box = page.getByTestId("course-sources");
    await expect(box).toBeVisible();
    await expect(box.getByTestId("course-source").first()).toBeHidden(); // eingeklappt: Einträge nicht sichtbar
    await box.locator("summary").click();
    const entry = box.getByTestId("course-source").filter({ hasText: source.title });
    await expect(entry).toBeVisible();
    await expect(entry.getByRole("link")).toHaveAttribute("href", "https://example.org/leitfaden");
    await expect(entry).toContainText("E2E Verlag");
  } finally {
    await db.delete(certificationSources).where(eq(certificationSources.id, source.id));
  }
});

test("Schwächen-Radar: nach falschen Antworten im Kapitel-Quiz zeigt er das Thema, mit Sprung zur Wiederholung", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.radar.email);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await expect(page.getByTestId("weakness-radar")).toHaveCount(0); // ohne Antworten gibt es ihn nicht
  await page.getByTestId("chapter-quiz-entry").first().click();
  await page.waitForURL(/\/chapter\/.+\/quiz/);
  const attempt = page.waitForResponse((r) => /\/api\/chapters\/.+\/attempt/.test(r.url()) && r.request().method() === "POST");
  for (let i = 0; i < 3; i++) {
    await page.getByText(/^(Wrong|Falsch)$/).first().click();
    await expect(page.getByTestId("feedback-panel")).toBeVisible();
    await page.getByTestId("next-question").click();
  }
  expect((await attempt).ok()).toBe(true);
  await page.goto(`${gateway.url}/cert/${COURSE_SLUG}`);
  await expect(page.getByTestId("weakness-radar-count")).toHaveText("1");
  await page.getByTestId("weakness-radar-toggle").click();
  const topic = page.getByTestId("weakness-radar-topic").first();
  await expect(topic).toContainText(/3 von 3|3 of 3/);
  await expect(topic.getByRole("link")).toHaveAttribute("href", new RegExp(`/cert/${COURSE_SLUG}/remediation/`));
});

test("Lernprofil-PDF: nur mit hinterlegter Zertifikatsprüfung, mit Prüfseite und Widerruf; Zielrolle im Profil", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.profileUser.email);
  await page.goto(`${gateway.url}/profile`);
  await expect(page.getByTestId("profile-export-courses")).toContainText("E2E Demo Course");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("profile-export-create").click()]);
  const path = await download.path();
  const { readFileSync } = await import("node:fs");
  expect(readFileSync(path!).subarray(0, 5).toString()).toBe("%PDF-");

  // Prüfseite: echt, mit Namen und Kurs; nach dem Widerruf ungültig
  const link = page.getByTestId("profile-export-issued").getByRole("link").first();
  await expect(link).toBeVisible();
  const verifyUrl = await link.getAttribute("href");
  await page.context().clearCookies(); // die Prüfseite braucht keine Anmeldung
  await page.goto(`${gateway.url}${verifyUrl}`);
  await expect(page.getByTestId("verify-status")).toHaveAttribute("data-valid", "true");
  await expect(page.getByTestId("verify-holder")).toHaveText("Erika Beispiel");
  await expect(page.getByTestId("verify-course")).toContainText("E2E Demo Course");
  expect((await page.goto(`${gateway.url}/verify/00000000-0000-4000-8000-000000000000`))?.status()).toBe(200);
  await expect(page.getByTestId("verify-unknown")).toBeVisible();

  await login(page, gateway.url, USERS.profileUser.email);
  await page.goto(`${gateway.url}/profile`);
  page.once("dialog", (d) => void d.accept());
  const revoked = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/api/profile/export/"));
  await page.getByTestId("profile-export-revoke").first().click();
  expect((await revoked).ok()).toBe(true);
  await page.goto(`${gateway.url}${verifyUrl}`);
  await expect(page.getByTestId("verify-status")).toHaveAttribute("data-valid", "false");

  // Zielrolle
  await page.goto(`${gateway.url}/profile`);
  await page.getByTestId("profile-job-title").fill("Cloud Engineer");
  await page.getByTestId("profile-target-role").fill("Site Reliability Engineer");
  await page.getByTestId("profile-save").click();
  await page.goto(`${gateway.url}/career`);
  await expect(page.getByTestId("career-roles")).toContainText("Cloud Engineer");
  await expect(page.getByTestId("career-roles")).toContainText("Site Reliability Engineer");
});
