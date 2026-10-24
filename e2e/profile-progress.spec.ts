import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications, objectiveSnapshots, users } from "../lib/server/db/schema";
import { COURSE_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Profil: Rückblick „Vor 3 Wochen … Heute …“ mit echten Ständen, nur für die Person selbst", async ({ page, gateway }) => {
  const db = getDb();
  const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.learnerB.email)).limit(1);
  const [cert] = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.slug, COURSE_SLUG)).limit(1);
  await db.delete(objectiveSnapshots).where(eq(objectiveSnapshots.userId, me.id));
  const day = new Date(Date.now() - 22 * 86_400_000).toISOString().slice(0, 10);
  await db.insert(objectiveSnapshots).values({ userId: me.id, certificationId: cert.id, day, secureObjectives: 0, totalObjectives: 1 });

  await login(page, gateway.url, USERS.learnerB.email);
  await page.goto(`${gateway.url}/profile`);
  const section = page.getByTestId("profile-progress");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("progress-review-text")).toContainText(/0 (von|of) 1/);
  await expect(section).toContainText("E2E Demo Course");
  await expect(section).toContainText(/Nur für dich sichtbar|Visible to you only/);
});
