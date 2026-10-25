/** Lernprofil als verifizierter PDF-Nachweis gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
process.env.AUTH_SECRET ??= "test-secret";

import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { getDb } from "@/lib/server/db/client";
import { learningProfileExports, userCertificates, users } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { renderLearningProfilePdf, toWinAnsi } from "./pdf";
import { issueLearningProfile, listEligibleCourses, MissingNameError, NothingToExportError, revokeIssuedProfile, verifyIssuedProfile } from "./service";

const run = TEST_DB ? describe : describe.skip;

async function named(name: string | null) {
  const userId = await seedUser();
  await getDb().update(users).set({ name }).where(eq(users.id, userId));
  return userId;
}

describe("PDF-Text", () => {
  it("Sonderzeichen ohne Latin-1-Entsprechung brechen die Erzeugung nicht", () => {
    expect(toWinAnsi("Über „Anführungszeichen“ – Zeichen … ✓ 日本")).toBe('Über "Anführungszeichen" - Zeichen ... ? ??');
  });
});

run("Lernprofil-PDF (echte DB)", () => {
  it("nur Kurse mit hinterlegter, schon erworbener Zertifikatsprüfung; ohne Nachweis kein PDF", async () => {
    const course = await seedCourse(1);
    const other = await seedCourse(1);
    const userId = await named("Erika Beispiel");
    await seedLessons(course.objectiveId, ["Text"]);
    const db = getDb();
    await expect(issueLearningProfile(userId)).rejects.toBeInstanceOf(NothingToExportError);
    // ohne Kursverknüpfung und mit Datum in der Zukunft zählt nichts
    await db.insert(userCertificates).values({ userId, title: "Ohne Kurs", vendor: "X", earnedAt: new Date("2025-01-01") });
    await db.insert(userCertificates).values({ userId, certificationId: other.certId, title: "Noch nicht", vendor: "X", earnedAt: new Date(Date.now() + 30 * 86_400_000) });
    expect(await listEligibleCourses(userId)).toHaveLength(0);
    await db.insert(userCertificates).values({ userId, certificationId: course.certId, title: "Network+", vendor: "CompTIA", earnedAt: new Date("2026-03-01"), expiresAt: new Date("2029-03-01") });
    const courses = await listEligibleCourses(userId);
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ certificate: "Network+", vendor: "CompTIA", lessonsTotal: 1, lessonsDone: 0, chaptersTotal: 1 });
  });

  it("stellt aus, prüft, erkennt Veränderungen und Widerruf; das PDF ist gültig", async () => {
    const course = await seedCourse(1);
    const userId = await named("Max Muster");
    await getDb().insert(userCertificates).values({ userId, certificationId: course.certId, title: "Security+", vendor: "CompTIA", earnedAt: new Date("2026-02-01") });
    const issued = await issueLearningProfile(userId);

    const ok = await verifyIssuedProfile(issued.id);
    expect(ok).toMatchObject({ valid: true, revoked: false });
    expect(ok?.payload.holder).toBe("Max Muster");

    const pdf = await renderLearningProfilePdf({ ...issued, verifyUrl: `https://example.org/verify/${issued.id}` });
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(loaded.getTitle()).toContain("Lernprofil");

    // Nachträglich verändert (z. B. Kursname im Datenbankeintrag): die Signatur stimmt nicht mehr
    const db = getDb();
    const [row] = await db.select().from(learningProfileExports).where(eq(learningProfileExports.id, issued.id));
    await db.update(learningProfileExports).set({ payload: { ...row.payload, holder: "Jemand Anderes" } }).where(eq(learningProfileExports.id, issued.id));
    expect(await verifyIssuedProfile(issued.id)).toMatchObject({ valid: false, revoked: false });
    await db.update(learningProfileExports).set({ payload: row.payload }).where(eq(learningProfileExports.id, issued.id));
    expect((await verifyIssuedProfile(issued.id))?.valid).toBe(true);

    // Widerruf: nur durch die Person selbst
    expect(await revokeIssuedProfile(await seedUser(), issued.id)).toBe(false);
    expect(await revokeIssuedProfile(userId, issued.id)).toBe(true);
    expect(await verifyIssuedProfile(issued.id)).toMatchObject({ valid: false, revoked: true });
    expect(await verifyIssuedProfile("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("ohne Namen im Konto gibt es keinen Nachweis", async () => {
    const course = await seedCourse(1);
    const userId = await named(null);
    await getDb().insert(userCertificates).values({ userId, certificationId: course.certId, title: "A+", vendor: "CompTIA", earnedAt: new Date("2026-01-01") });
    await expect(issueLearningProfile(userId)).rejects.toBeInstanceOf(MissingNameError);
  });
});
