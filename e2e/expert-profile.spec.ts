import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { approveCourse } from "../lib/server/approvals/service";
import { certifications, domains, lessonCompletions, objectives, questions, reviewerCertifications, sections, reviewerExperience, reviewerProfiles, users } from "../lib/server/db/schema";
import { getOwnProfile, publishProfile, saveExperience, saveProfile, withdrawProfile } from "../lib/server/reviewers/profile-service";
import { FORMATS_SLUG, USERS } from "./global-setup";
import { expect, login, test } from "./fixtures";

test("Expertenprofil: nur Freigegebenes ist öffentlich, Nachweis erst nach Admin-Prüfung, Rückzug sofort", async ({ page, browser, gateway }) => {
  const db = getDb();
  const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.reviewer.email)).limit(1);
  // frischer Start
  await db.delete(reviewerCertifications).where(eq(reviewerCertifications.userId, me.id));
  await db.delete(reviewerExperience).where(eq(reviewerExperience.userId, me.id));
  await db.delete(reviewerProfiles).where(eq(reviewerProfiles.userId, me.id));

  await login(page, gateway.url, USERS.reviewer.email);
  await page.goto(`${gateway.url}/reviewer/profile`);

  // Profil anlegen: Name und Land öffentlich, Region und Kurzvorstellung nicht
  await page.getByTestId("profile-first-name").fill("Erika");
  await page.getByTestId("profile-last-name").fill("Prüfer");
  await page.getByTestId("profile-country").fill("Deutschland");
  await page.getByTestId("profile-region").fill("Geheimland");
  await page.getByTestId("profile-bio-de").fill("Nicht öffentliche Vorstellung");
  await page.getByTestId("consent-name").check();
  await page.getByTestId("consent-country").check();
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId("profile-message")).toContainText(/saved|gespeichert/i);

  // Veröffentlichen geht noch nicht: kein öffentlicher Eintrag
  await page.getByTestId("profile-publish").click();
  await expect(page.getByTestId("profile-message")).toContainText(/Zertifikat|certification/i);

  // Zertifikat mit Nachweis-Link (nur https)
  await page.getByTestId("cert-new").click();
  await page.getByTestId("cert-vendor").fill("CompTIA");
  await page.getByTestId("cert-name").fill("Security+");
  await page.getByTestId("cert-earned").fill("2024-01-10");
  await page.getByTestId("cert-url").fill("http://unsicher.example.com");
  await page.getByTestId("cert-save").click();
  await expect(page.getByTestId("profile-message")).toContainText(/https/);
  await page.getByTestId("cert-url").fill("https://verify.example.com/abc");
  await page.getByTestId("cert-save").click();
  await expect(page.getByTestId("cert-item")).toHaveCount(1);

  await page.getByTestId("profile-publish").click();
  await expect(page.getByTestId("public-link")).toBeVisible();
  const slug = (await page.getByTestId("public-link").textContent())!.replace("/experts/", "").trim();

  // Anonym: genau das Freigegebene
  const anon = await browser.newContext({ baseURL: gateway.url });
  const pub = await anon.newPage();
  await pub.goto(`${gateway.url}/experts/${slug}`);
  await expect(pub.getByTestId("expert-name")).toHaveText("Erika Prüfer");
  await expect(pub.getByTestId("expert-place")).toHaveText("Deutschland");
  await expect(pub.locator("body")).not.toContainText("Geheimland");
  await expect(pub.locator("body")).not.toContainText("Nicht öffentliche Vorstellung");
  await expect(pub.getByTestId("expert-cert")).toHaveCount(1);
  await expect(pub.getByTestId("expert-cert-unverified")).toBeVisible();
  await expect(pub.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // Admin prüft den Nachweis
  const adminPage = await (await browser.newContext({ baseURL: gateway.url })).newPage();
  await login(adminPage, gateway.url, USERS.admin.email);
  await adminPage.goto(`${gateway.url}/admin/reviewers`);
  const row = adminPage.getByTestId("cert-verify-row").filter({ hasText: "Erika Prüfer" }).first();
  await row.getByTestId("cert-verify-toggle").click();
  await expect(row.getByTestId("cert-verify-toggle")).toContainText(/Undo|zurücknehmen/);

  await pub.reload();
  await expect(pub.getByTestId("expert-cert-verified")).toBeVisible();

  // Rückzug: sofort weg
  await page.getByTestId("profile-withdraw").click();
  await expect(page.getByTestId("publish-state")).toContainText(/Nicht veröffentlicht|Not published/);
  const gone = await pub.goto(`${gateway.url}/experts/${slug}`);
  expect(gone?.status()).toBe(404);
  await anon.close();
});

test("Das Expertenprofil ist nur für die Prüfer-Rolle erreichbar", async ({ page, gateway }) => {
  await login(page, gateway.url, USERS.learnerA.email);
  const response = await page.goto(`${gateway.url}/reviewer/profile`);
  expect(response?.status()).toBe(403);
  const api = await page.request.get(`${gateway.url}/api/reviewer/profile`);
  expect(api.status()).toBe(403);
});

test("Siegel am Kurs: Name mit Link nur bei veröffentlichtem Profil, sonst neutral; Änderungen sichtbar; Katalog zeigt es", async ({ page, gateway }) => {
  const db = getDb();
  const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.reviewer.email)).limit(1);
  const [cert] = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.slug, FORMATS_SLUG)).limit(1);
  const [q] = await db.select({ id: questions.id }).from(questions).where(eq(questions.humanId, "E2E-FMT-SHORT")).limit(1);

  await db.delete(reviewerCertifications).where(eq(reviewerCertifications.userId, me.id));
  await db.delete(reviewerExperience).where(eq(reviewerExperience.userId, me.id));
  await db.delete(reviewerProfiles).where(eq(reviewerProfiles.userId, me.id));
  await saveProfile(me.id, { firstName: "Siegel", lastName: "Prüfer", country: "Deutschland", consent: { name: true, country: true } });
  await saveExperience(me.id, { kind: "job", title: "Admin", periodFrom: "2019", isPublic: true });
  await publishProfile(me.id);
  const slug = (await getOwnProfile(me.id)).profile!.slug;
  await approveCourse({ certificationId: cert.id, reviewer: { userId: me.id, displayName: "Siegel Prüfer" }, confirmed: true, recordedByUserId: null });
  const original = (await db.select({ e: questions.explanation }).from(questions).where(eq(questions.id, q.id)))[0].e;

  try {
    await login(page, gateway.url, USERS.learnerA.email);
    await page.goto(`${gateway.url}/cert/${FORMATS_SLUG}`);
    const seal = page.getByTestId("course-seal").first();
    await expect(seal).toContainText(/was technically reviewed by|wurde fachlich von/);
    await expect(seal.getByTestId("seal-reviewer")).toHaveText("Siegel Prüfer");
    await expect(seal.getByTestId("seal-reviewer")).toHaveAttribute("href", `/experts/${slug}`);
    await expect(seal).toHaveAttribute("data-changed", "false");

    // Dashboard: Kurse mit eigener Aktivität zeigen das Siegel kompakt
    const [learner] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.learnerA.email)).limit(1);
    const [sec] = await db.select({ id: sections.id }).from(sections).innerJoin(objectives, eq(objectives.id, sections.objectiveId)).innerJoin(domains, eq(domains.id, objectives.domainId)).where(eq(domains.certificationId, cert.id)).limit(1);
    await db.insert(lessonCompletions).values({ userId: learner.id, sectionId: sec.id }).onConflictDoNothing();
    await page.goto(`${gateway.url}/`);
    await expect(page.getByTestId(`cert-card-${FORMATS_SLUG}`).getByTestId("course-seal")).toContainText(/Expert reviewed|Fachlich geprüft/);

    await page.goto(`${gateway.url}/catalog`);
    await expect(page.getByTestId(`catalog-card-${FORMATS_SLUG}`).getByTestId("course-seal")).toContainText(/Expert reviewed|Fachlich geprüft/);

    // Änderung nach der Prüfung
    await db.update(questions).set({ explanation: { de: `Geändert ${Date.now()}`, en: `Changed ${Date.now()}` } }).where(eq(questions.id, q.id));
    await page.goto(`${gateway.url}/cert/${FORMATS_SLUG}`);
    await expect(page.getByTestId("seal-changes")).toContainText(/1 change since the review|1 Änderung seit der Prüfung/);

    // Rückzug des Profils: das Siegel bleibt, aber neutral
    await withdrawProfile(me.id);
    // Der Service Worker liefert eine Seite, die länger als 3 s braucht, kurz aus dem Cache: neu laden, bis die frische da ist.
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId("course-seal").first()).toContainText(/an external expert|einem externen Experten/, { timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    const neutral = page.getByTestId("course-seal").first();
    await expect(neutral).toContainText(/an external expert|einem externen Experten/);
    await expect(neutral).not.toContainText("Siegel Prüfer");
    await expect(neutral.getByTestId("seal-reviewer")).toHaveCount(0);
  } finally {
    await db.update(questions).set({ explanation: original }).where(eq(questions.id, q.id));
  }
});

// Kleinstes gültiges PNG (1×1 Pixel).
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("Expertenprofil: Foto nur mit Einwilligung öffentlich, Rückzug löscht es", async ({ page, browser, gateway }) => {
  const db = getDb();
  const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.reviewer.email)).limit(1);
  await db.delete(reviewerCertifications).where(eq(reviewerCertifications.userId, me.id));
  await db.delete(reviewerExperience).where(eq(reviewerExperience.userId, me.id));
  await db.delete(reviewerProfiles).where(eq(reviewerProfiles.userId, me.id));
  await saveProfile(me.id, { firstName: "Foto", lastName: "Prüfer", country: "Deutschland", consent: { name: true, country: true } });
  await saveExperience(me.id, { kind: "job", title: "Administrator", periodFrom: "2019", isPublic: true });
  await publishProfile(me.id);
  const slug = (await getOwnProfile(me.id)).profile!.slug;

  await login(page, gateway.url, USERS.reviewer.email);
  await page.goto(`${gateway.url}/reviewer/profile`);
  await page.getByTestId("photo-input").setInputFiles({ name: "ich.png", mimeType: "image/png", buffer: PNG_1X1 });
  await expect(page.getByTestId("photo-preview")).toBeVisible();

  // Ohne Einwilligung: weder auf der Seite noch über die Adresse
  const anon = await browser.newContext({ baseURL: gateway.url });
  const pub = await anon.newPage();
  await pub.goto(`${gateway.url}/experts/${slug}`);
  await expect(pub.getByTestId("expert-photo")).toHaveCount(0);
  expect((await pub.request.get(`${gateway.url}/api/experts/${slug}/photo`)).status()).toBe(404);

  // Mit Einwilligung: sichtbar und abrufbar
  await page.getByTestId("consent-photo").check();
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId("profile-message")).toContainText(/saved|gespeichert/i);
  await pub.reload();
  await expect(pub.getByTestId("expert-photo")).toBeVisible();
  const served = await pub.request.get(`${gateway.url}/api/experts/${slug}/photo`);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");

  // Falscher Inhalt unter .png wird abgelehnt
  await page.getByTestId("photo-input").setInputFiles({ name: "boese.png", mimeType: "image/png", buffer: Buffer.from("<html>kein Bild</html>") });
  await expect(page.getByTestId("profile-message")).toContainText(/Bildtyp|Inhalt|content/i);

  // Rückzug: Foto gelöscht
  await page.getByTestId("profile-withdraw").click();
  await expect(page.getByTestId("publish-state")).toContainText(/Nicht veröffentlicht|Not published/);
  expect((await pub.request.get(`${gateway.url}/api/experts/${slug}/photo`)).status()).toBe(404);
  await expect(page.getByTestId("photo-preview")).toHaveCount(0);
  await anon.close();
});
