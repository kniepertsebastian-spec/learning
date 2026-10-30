import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { contentRevisions, sections } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Prüfer: bearbeitet den zugewiesenen Kurs von Hand (Lektion anlegen, ändern, löschen), ohne KI und Kursverwaltung", async ({ page, gateway }) => {
  const title = `E2E-Prüfer-Lektion-${Date.now()}`;
  await login(page, gateway.url, USERS.reviewer.email);

  // Der Weg führt von „Mein Kurs“ über die Kursansicht in die Bearbeitung
  await page.goto(`${gateway.url}/reviewer`);
  await page.getByTestId("reviewer-course").getByRole("link").first().click();
  await page.getByTestId("reviewer-edit-link").click();
  await page.waitForURL(new RegExp(`/reviewer/${COURSE_SLUG}/workshop`));
  await expect(page.getByTestId("reviewer-workshop-page")).toBeVisible();
  // Nur Lektionen und Fragen: keine Kursbeschreibung, kein Qualitätsbericht, keine gemerkten Stände
  await expect(page.getByTestId("open-overview")).toHaveCount(0);
  await expect(page.getByTestId("open-report")).toHaveCount(0);

  // Neue Lektion im ersten Lernziel anlegen
  await page.getByRole("button", { name: /^(Lektion|Lesson)$/ }).first().click();
  const editor = page.getByTestId("section-editor");
  await editor.getByTestId("section-title").fill(title);
  await editor.getByTestId("section-content").fill("## Neu\n\nVon Hand geschrieben.");
  await editor.getByTestId("section-save").click();
  await expect(page.getByTestId("tree-section").filter({ hasText: title })).toBeVisible();

  // Ändern: der alte Stand bleibt als Version erhalten, KI-Vorschläge gibt es nicht
  await expect(page.getByTestId("section-editor").getByTestId("ai-open")).toHaveCount(0);
  await page.getByTestId("section-editor").getByTestId("section-content").fill("## Neu\n\nGeändert.");
  await page.getByTestId("section-save").click();
  await expect(page.getByText(/Gespeichert|Saved/).first()).toBeVisible();

  // Löschen
  await page.getByTestId("section-delete").click();
  await page.getByTestId("confirm-accept").click();
  await expect(page.getByTestId("tree-section").filter({ hasText: title })).toHaveCount(0);
  expect(await getDb().select({ id: sections.id }).from(sections).where(eq(sections.orderNum, 1))).not.toHaveLength(0); // der Demo-Kurs behält seine Lektion
  const revisions = await getDb().select({ note: contentRevisions.note }).from(contentRevisions).where(eq(contentRevisions.origin, "manual"));
  expect(revisions.some((r) => r.note?.includes("Löschen"))).toBe(true);

  // Verwaltung der Kurse bleibt Admins vorbehalten
  expect((await page.goto(`${gateway.url}/admin/certifications/${COURSE_SLUG}/workshop`))?.status()).toBe(403);
});
