/** Freigabe je Inhaltsstand gegen echte DB (Akzeptanzkriterium Phase 2). Nur mit TEST_DATABASE_URL. */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { certifications, courseApprovals, itemVariants, lessons, questionOptions, questions } from "@/lib/server/db/schema";
import { InvalidApprovalError, setCatalogStatus } from "@/lib/server/admin/course-requests";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { ApprovalInvalidError, approveCourse, computeCourseFingerprints, describeChanges, ensureLegacyApproval, getApprovalStatus, listApprovals, markEditorial } from "./service";

const run = TEST_DB ? describe : describe.skip;

async function course() {
  const c = await seedCourse(2);
  const [sectionId] = await seedLessons(c.objectiveId, ["Inhalt der Lektion"]);
  for (const q of c.questionIds) {
    await getDb().insert(questionOptions).values([
      { questionId: q, orderNum: 1, text: { de: "Richtig", en: "Right" } as never, isCorrect: true },
      { questionId: q, orderNum: 2, text: { de: "Falsch", en: "Wrong" } as never, isCorrect: false },
    ]);
  }
  const admin = await seedUser();
  return { ...c, sectionId, admin };
}

const approve = (certId: string, admin: string, name = "Dr. Prüfer") =>
  setCatalogStatus({ certificationId: certId, status: "approved", approvedByName: name, confirmed: true, actorUserId: admin });

run("Freigabe je Inhaltsstand (echte DB)", () => {
  it("ohne Bestätigung oder Namen keine Freigabe", async () => {
    const c = await course();
    await expect(setCatalogStatus({ certificationId: c.certId, status: "approved", approvedByName: "Dr. Prüfer", actorUserId: c.admin })).rejects.toBeInstanceOf(InvalidApprovalError);
    await expect(approveCourse({ certificationId: c.certId, reviewer: { userId: null, displayName: "X" }, confirmed: true, recordedByUserId: c.admin })).rejects.toBeInstanceOf(ApprovalInvalidError);
    expect(await listApprovals(c.certId)).toHaveLength(0);
    expect((await getApprovalStatus(c.certId)).state).toBe("none");
  });

  it("Freigabe, Änderung → „1 Änderung seit Prüfung“, Neufreigabe → Hinweis weg; derselbe Inhalt ergibt denselben Hash", async () => {
    const c = await course();
    await approve(c.certId, c.admin);
    const first = await getApprovalStatus(c.certId);
    expect(first).toMatchObject({ state: "current", changeCount: 0, approval: { reviewerDisplayName: "Dr. Prüfer", versionLabel: "1.0", kind: "approval" } });
    const [cert] = await getDb().select().from(certifications).where(eq(certifications.id, c.certId));
    expect(cert).toMatchObject({ catalogStatus: "approved", approvedByName: "Dr. Prüfer" });
    expect(await computeCourseFingerprints(c.certId)).toEqual(await computeCourseFingerprints(c.certId));

    await getDb().update(questions).set({ question: { de: "Geändert?", en: "Changed?" } as never }).where(eq(questions.id, c.questionIds[0]));
    const changed = await getApprovalStatus(c.certId);
    expect(changed.state).toBe("changed");
    expect(changed.changeCount).toBe(1);
    expect(changed.diff?.questions.changed).toEqual([c.questionIds[0]]);
    expect((await describeChanges(changed.diff!)).questions[0]).toMatchObject({ change: "changed", label: "Geändert?" });

    await approve(c.certId, c.admin, "Prof. Zweitprüfer");
    expect(await getApprovalStatus(c.certId)).toMatchObject({ state: "current", changeCount: 0, approval: { reviewerDisplayName: "Prof. Zweitprüfer", versionLabel: "2.0" } });
    expect(await listApprovals(c.certId)).toHaveLength(2);
  });

  it("Änderungen an Lektion und neue aktive Variante zählen", async () => {
    const c = await course();
    await approve(c.certId, c.admin);
    await getDb().update(lessons).set({ content: { de: "Neuer Text", en: "New text" } as never }).where(eq(lessons.sectionId, c.sectionId));
    expect((await getApprovalStatus(c.certId)).diff?.sections.changed).toEqual([c.sectionId]);

    const [variant] = await getDb().insert(questions).values({ humanId: `V-${c.tag}`, objectiveId: c.objectiveId, difficulty: "easy", type: "single", question: { de: "V", en: "V" } as never, explanation: { de: "E", en: "E" } as never, probeOnly: true }).returning();
    await getDb().insert(itemVariants).values({ itemId: c.questionIds[0], questionId: variant.id, source: "generated" });
    const status = await getApprovalStatus(c.certId);
    expect(status.diff?.questions.added).toEqual([variant.id]); // neue Variante aus der Generierung zählt als Änderung
    expect(status.changeCount).toBe(2);
    // eine deaktivierte Variante zählt nicht
    await getDb().update(itemVariants).set({ active: false }).where(eq(itemVariants.questionId, variant.id));
    expect((await getApprovalStatus(c.certId)).diff?.questions.added).toEqual([]);
  });

  it("redaktionell: Notiz Pflicht, Prüfer und Freigabedatum bleiben, Nebenversion zählt hoch, im Protokoll sichtbar", async () => {
    const c = await course();
    await approve(c.certId, c.admin);
    await expect(markEditorial({ certificationId: c.certId, adminUserId: c.admin, note: "Tippfehler" })).rejects.toBeInstanceOf(ApprovalInvalidError); // nichts geändert

    await getDb().update(lessons).set({ content: { de: "Inhalt der Lektion.", en: "Inhalt der Lektion." } as never }).where(eq(lessons.sectionId, c.sectionId));
    await expect(markEditorial({ certificationId: c.certId, adminUserId: c.admin, note: " " })).rejects.toBeInstanceOf(ApprovalInvalidError);
    const entry = await markEditorial({ certificationId: c.certId, adminUserId: c.admin, note: "Punkt am Satzende" });
    expect(entry.versionLabel).toBe("1.1");
    const status = await getApprovalStatus(c.certId);
    expect(status).toMatchObject({ state: "current", approval: { kind: "approval", reviewerDisplayName: "Dr. Prüfer", versionLabel: "1.0" } });
    const history = await listApprovals(c.certId);
    expect(history.map((h) => h.kind)).toEqual(["editorial", "approval"]);
    expect(history[0].note).toContain("Punkt am Satzende");
  });

  it("Altbestand: Name und Datum werden einmal als legacy-Eintrag übernommen", async () => {
    const c = await course();
    const at = new Date("2026-03-01T10:00:00Z");
    await getDb().update(certifications).set({ catalogStatus: "approved", approvedByName: "Frühere Prüferin", approvedAt: at }).where(eq(certifications.id, c.certId));
    expect(await listApprovals(c.certId)).toHaveLength(0);
    expect(await getApprovalStatus(c.certId)).toMatchObject({ state: "current", approval: { kind: "legacy", reviewerDisplayName: "Frühere Prüferin", versionLabel: "1.0", approvedAt: at } });
    expect(await ensureLegacyApproval(c.certId)).toBe(false); // idempotent
    expect(await listApprovals(c.certId)).toHaveLength(1);
    await getDb().update(questions).set({ explanation: { de: "Neu", en: "New" } as never }).where(eq(questions.id, c.questionIds[1]));
    expect((await getApprovalStatus(c.certId)).state).toBe("changed");
  });

  it("Entzug der Freigabe: kein Siegel, Protokoll bleibt; das Protokoll ist nicht änderbar", async () => {
    const c = await course();
    await approve(c.certId, c.admin);
    await setCatalogStatus({ certificationId: c.certId, status: "in_review", actorUserId: c.admin });
    expect((await getApprovalStatus(c.certId)).state).toBe("none");
    expect(await listApprovals(c.certId)).toHaveLength(1);
    const [row] = await getDb().select().from(courseApprovals).where(eq(courseApprovals.certificationId, c.certId));
    await expect(getDb().update(courseApprovals).set({ reviewerDisplayName: "Fälschung" }).where(eq(courseApprovals.id, row.id))).rejects.toThrow();
    await expect(getDb().delete(courseApprovals).where(eq(courseApprovals.id, row.id))).rejects.toThrow();
    // Löschen des Kurses räumt das Protokoll mit auf
    await getDb().delete(certifications).where(eq(certifications.id, c.certId));
    expect(await getDb().select().from(courseApprovals).where(eq(courseApprovals.certificationId, c.certId))).toHaveLength(0);
  });
});
