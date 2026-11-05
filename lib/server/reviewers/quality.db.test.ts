/** Prüfer-Qualität gegen eine ECHTE Postgres-Datenbank: Kennzahlen je Freigabe und Prüfer, Hinweis über dem Durchschnitt, Wiedervorlage. */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certificationSources, certifications, contentReports, courseApprovals, users } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { getQualityReport, listRecheckRecommended } from "./quality";

const run = TEST_DB ? describe : describe.skip;
const DAY = 86_400_000;
const T0 = new Date("2026-06-01T10:00:00Z");
const T1 = new Date("2026-08-01T10:00:00Z");

run("Prüfer-Qualität (echte DB)", () => {
  const userIds: string[] = [];
  const certIds: string[] = [];

  async function course(questions = 30) {
    const c = await seedCourse(questions);
    certIds.push(c.certId);
    return c;
  }
  async function approve(certId: string, questionIds: string[], reviewer: { userId: string | null; name: string }, at: Date, version: string) {
    const fingerprints = { sections: {}, questions: Object.fromEntries(questionIds.map((id) => [id, "h"])) };
    const [row] = await getDb()
      .insert(courseApprovals)
      .values({ certificationId: certId, kind: "approval", reviewerUserId: reviewer.userId, reviewerDisplayName: reviewer.name, contentHash: randomUUID(), fingerprints, versionLabel: version, approvedAt: at })
      .returning();
    return row;
  }
  async function report(questionId: string, reason: typeof contentReports.$inferInsert.reason, at: Date, n = 1) {
    for (let i = 0; i < n; i++) await getDb().insert(contentReports).values({ targetType: "question", targetId: questionId, reason, createdAt: at });
  }

  afterAll(async () => {
    const db = getDb();
    if (certIds.length) await db.delete(certifications).where(inArray(certifications.id, certIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  });

  it("zählt Meldungen je Freigabe im Zeitfenster bis zur nächsten Freigabe und vergleicht mit dem Durchschnitt", async () => {
    const a = await seedUser();
    userIds.push(a);
    const [c1, c2, c3, c4] = [await course(), await course(), await course(), await course()];
    await approve(c1.certId, c1.questionIds, { userId: a, name: "Prüferin A" }, T0, "1.0");
    await approve(c1.certId, c1.questionIds, { userId: a, name: "Prüferin A" }, T1, "2.0");
    await approve(c2.certId, c2.questionIds, { userId: null, name: "Prüfer B" }, T0, "1.0");
    await approve(c3.certId, c3.questionIds, { userId: null, name: "Prüfer C" }, T0, "1.0");
    await approve(c4.certId, c4.questionIds, { userId: null, name: "Prüfer D" }, T0, "1.0");

    // Kurs 1: eine Meldung VOR der ersten Freigabe zählt nicht; 17 im ersten Fenster, 3 im zweiten; dazu auffällige Varianten.
    await report(c1.questionIds[0], "incorrect", new Date(T0.getTime() - DAY), 4);
    await report(c1.questionIds[1], "incorrect", new Date(T0.getTime() + DAY), 9);
    await report(c1.questionIds[2], "unclear", new Date(T0.getTime() + 2 * DAY), 8);
    await report(c1.questionIds[3], "outdated", new Date(T1.getTime() + DAY), 3);
    await report(c1.questionIds[4], "variant_outlier", new Date(T0.getTime() + 3 * DAY), 2);
    await report(c1.questionIds[5], "concept_struggle", new Date(T0.getTime() + 3 * DAY), 1);
    await report(c2.questionIds[0], "incorrect", new Date(T0.getTime() + DAY), 1);
    await report(c3.questionIds[0], "incorrect", new Date(T0.getTime() + DAY), 1);

    const report_ = await getQualityReport(2, { certificationIds: [c1.certId, c2.certId, c3.certId, c4.certId] });
    const first = report_.approvals.find((x) => x.certificationId === c1.certId && x.versionLabel === "1.0")!;
    const second = report_.approvals.find((x) => x.certificationId === c1.certId && x.versionLabel === "2.0")!;
    expect(first.counts).toEqual({ reports: 17, variantOutliers: 2, conceptStruggles: 1 });
    expect(first.until?.getTime()).toBe(T1.getTime());
    expect(second.counts).toEqual({ reports: 3, variantOutliers: 0, conceptStruggles: 0 });
    expect(second.until).toBeNull();
    expect(first.questions).toBe(30);

    expect(report_.totals).toEqual({ approvals: 5, questions: 150 });
    expect(report_.averages.reports).toBeCloseTo((22 / 150) * 100, 6);

    const reviewerA = report_.reviewers.find((r) => r.key === a)!;
    expect(reviewerA).toMatchObject({ approvals: 2, questions: 60, counts: { reports: 20, variantOutliers: 2, conceptStruggles: 1 } });
    expect(reviewerA.rates.reports).toBeCloseTo((20 / 60) * 100, 6);
    expect(reviewerA.ratios.reports).toBeCloseTo((20 / 60) / (22 / 150), 6);
    expect(reviewerA.noticeable).toEqual(["reports"]); // 2,27-fach ≥ Faktor 2; die anderen Kennzahlen haben zu wenige Ereignisse
    // Prüfer ohne Konto werden nach Namen zusammengefasst; kleine Zahlen lösen nie einen Hinweis aus.
    for (const name of ["Prüfer B", "Prüfer C", "Prüfer D"]) expect(report_.reviewers.find((r) => r.name === name)?.noticeable).toEqual([]);
    expect(report_.reviewers[0].key).toBe(a); // Auffällige zuerst

    // Mit niedrigerer Schwelle bleibt es bei A; mit höherer entfällt der Hinweis.
    expect((await getQualityReport(1.5, { certificationIds: certIds })).reviewers.find((r) => r.key === a)?.noticeable).toEqual(["reports"]);
    expect((await getQualityReport(3, { certificationIds: certIds })).reviewers.find((r) => r.key === a)?.noticeable).toEqual([]);
  });

  it("ohne Freigaben und ohne Meldungen: leere Zahlen statt Fehler", async () => {
    const empty = await getQualityReport(2, { certificationIds: [randomUUID()] });
    expect(empty).toMatchObject({ totals: { approvals: 0, questions: 0 }, reviewers: [], recheck: [] });
    expect(empty.averages).toEqual({ reports: 0, variantOutliers: 0, conceptStruggles: 0 });
  });

  it("Wiedervorlage: neue Ausgabe einer Quelle nach der letzten Freigabe → „Prüfung empfohlen“", async () => {
    const c = await course(3);
    const other = await course(3);
    await approve(c.certId, c.questionIds, { userId: null, name: "Prüfer E" }, T0, "1.0");
    await approve(other.certId, other.questionIds, { userId: null, name: "Prüfer F" }, T0, "1.0");
    const src = (certId: string, extra: Partial<typeof certificationSources.$inferInsert>) =>
      getDb()
        .insert(certificationSources)
        .values({ certificationId: certId, sourceType: "url", title: "Prüfungsziele", provider: "T", storageKey: randomUUID(), mimeType: "text/html", fileSizeBytes: 1, checksum: randomUUID(), ...extra })
        .returning();
    const [old] = await src(c.certId, { retrievedAt: new Date(T0.getTime() - 30 * DAY) });
    // Eine neue Ausgabe VOR der Freigabe (schon geprüft) und eine fehlgeschlagene danach lösen nichts aus.
    await src(c.certId, { supersedesSourceId: old.id, retrievedAt: new Date(T0.getTime() - DAY) });
    await src(c.certId, { supersedesSourceId: old.id, retrievedAt: new Date(T0.getTime() + DAY), status: "failed", title: "kaputt" });
    expect(await listRecheckRecommended([c.certId, other.certId])).toEqual([]);

    await src(c.certId, { supersedesSourceId: old.id, retrievedAt: new Date(T0.getTime() + 10 * DAY), title: "Prüfungsziele 2027" });
    await src(other.certId, { retrievedAt: new Date(T0.getTime() + 10 * DAY), title: "Nur ein weiteres Dokument" }); // keine neue Ausgabe
    const recheck = await listRecheckRecommended([c.certId, other.certId]);
    expect(recheck).toHaveLength(1);
    expect(recheck[0]).toMatchObject({ certificationId: c.certId, sourceTitle: "Prüfungsziele 2027" });
    expect(recheck[0].approvedAt.getTime()).toBe(T0.getTime());

    // Eine neue Freigabe nach der neuen Ausgabe hebt die Empfehlung auf.
    await approve(c.certId, c.questionIds, { userId: null, name: "Prüfer E" }, new Date(T0.getTime() + 20 * DAY), "2.0");
    expect(await listRecheckRecommended([c.certId])).toEqual([]);
  });
});
