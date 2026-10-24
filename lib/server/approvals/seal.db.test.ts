/** Siegel am Kurs gegen echte DB (nur mit TEST_DATABASE_URL): Namen nur bei veröffentlichtem Profil, sonst neutral; keine Freigabe, kein Siegel. */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, organizations, questions, reviewerQualifications, sections, users } from "@/lib/server/db/schema";
import { seedUser } from "@/lib/server/psrp/test-db";
import { publishProfile, saveExperience, saveProfile, withdrawProfile } from "@/lib/server/reviewers/profile-service";
import { getOfflinePackage } from "@/lib/server/offline/manifest";
import { approveCourse } from "./service";
import { getCourseSeal, getSealSummaries } from "./seal";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 6);
const bi = (v: string) => ({ de: v, en: v });

run("Siegel (echte DB)", () => {
  const certIds: string[] = [];
  const orgIds: string[] = [];
  afterAll(async () => {
    if (certIds.length) await getDb().delete(certifications).where(inArray(certifications.id, certIds));
    if (orgIds.length) await getDb().delete(organizations).where(inArray(organizations.id, orgIds));
  });

  async function course(over: { kind?: "general" | "internal"; status?: "draft" | "approved" } = {}) {
    const d = getDb();
    let ownerOrganizationId: string | null = null;
    if (over.kind === "internal") {
      const [org] = await d.insert(organizations).values({ name: `Firma ${tag}-${certIds.length}` }).returning({ id: organizations.id });
      orgIds.push(org.id);
      ownerOrganizationId = org.id;
    }
    const [c] = await d
      .insert(certifications)
      .values({ slug: `seal-${certIds.length}-${tag}`, name: "Kurs", provider: "T", examName: "T", examVersion: "1", kind: over.kind ?? "general", ownerOrganizationId, catalogStatus: over.status ?? "approved" })
      .returning({ id: certifications.id });
    certIds.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: "1.1", title: "O" }).returning();
    const [sec] = await d.insert(sections).values({ objectiveId: obj.id, orderNum: 1, title: bi("L") }).returning();
    await d.insert(lessons).values({ sectionId: sec.id, content: bi("Text") });
    const [q] = await d.insert(questions).values({ humanId: `SEAL-${tag}-${certIds.length}`, objectiveId: obj.id, difficulty: "beginner", type: "knowledge", question: bi("Frage?"), explanation: bi("Weil.") }).returning();
    return { certId: c.id, questionId: q.id };
  }
  async function reviewer(withProfile: boolean) {
    const id = await seedUser();
    await getDb().update(users).set({ role: "reviewer" }).where(eq(users.id, id));
    await getDb().insert(reviewerQualifications).values({ userId: id, source: "admin" });
    if (withProfile) {
      await saveProfile(id, { firstName: "Eva", lastName: `Prüfer${tag}`, country: "Deutschland", consent: { name: true, country: true } });
      await saveExperience(id, { kind: "job", title: "Admin", periodFrom: "2019", isPublic: true });
      await publishProfile(id);
    }
    return id;
  }
  const approve = (certificationId: string, userId: string | null, name = "Eva Prüfer") => approveCourse({ certificationId, reviewer: { userId, displayName: name }, confirmed: true, recordedByUserId: null });

  it("ohne Freigabe kein Siegel; interne Lernpfade und Entwürfe nie", async () => {
    const open = await course();
    expect(await getCourseSeal(open.certId)).toBeNull();
    const internal = await course({ kind: "internal" });
    expect(await getCourseSeal(internal.certId)).toBeNull();
    expect((await getSealSummaries([internal.certId, open.certId])).size).toBe(0);
  });

  it("Name und Profil-Link nur bei veröffentlichtem Profil; nach Rückzug und Löschung neutral", async () => {
    const c = await course();
    const eva = await reviewer(true);
    await approve(c.certId, eva);
    let seal = (await getCourseSeal(c.certId))!;
    expect(seal.reviewers).toHaveLength(1);
    expect(seal.reviewers[0].name).toBe(`Eva Prüfer${tag}`);
    expect(seal).toMatchObject({ anonymousCount: 0, versionLabel: "1.0", changeCount: 0, changes: null });
    expect([...(await getSealSummaries([c.certId])).values()][0].reviewers).toHaveLength(1);

    await withdrawProfile(eva);
    seal = (await getCourseSeal(c.certId))!;
    expect(seal.reviewers).toEqual([]);
    expect(seal.anonymousCount).toBe(1);
    expect(JSON.stringify(seal)).not.toContain("Prüfer");

    // Profil wieder veröffentlicht, danach Konto gelöscht: die Freigabe bleibt, der Name nicht
    await saveProfile(eva, { firstName: "Eva", lastName: "Prüfer", country: "Deutschland", consent: { name: true, country: true } });
    await publishProfile(eva).catch(() => undefined); // Einträge wurden mit dem Rückzug nicht öffentlich: ohne öffentlichen Eintrag geht das nicht
    await getDb().delete(users).where(eq(users.id, eva));
    seal = (await getCourseSeal(c.certId))!;
    expect(seal.reviewers).toEqual([]);
    expect(seal.anonymousCount).toBe(1);
  });

  it("Prüfer ohne Konto (Altbestand/Admin-Eintrag) erscheinen nur neutral; mehrere Prüfer desselben Stands werden gemeinsam genannt", async () => {
    const c = await course();
    const named = await reviewer(true);
    await approve(c.certId, named);
    await approve(c.certId, null, "Dr. Ohne Konto");
    const seal = (await getCourseSeal(c.certId))!;
    expect(seal.reviewers).toHaveLength(1);
    expect(seal.anonymousCount).toBe(1);
    expect(seal.versionLabel).toBe("2.0");
  });

  it("Änderung seit der Prüfung: Zähler und Aufteilung; der Katalog zeigt nur den Stand der Prüfung", async () => {
    const c = await course();
    await approve(c.certId, await reviewer(true));
    await getDb().update(questions).set({ explanation: bi("Neu formuliert.") }).where(eq(questions.id, c.questionId));
    const seal = (await getCourseSeal(c.certId))!;
    expect(seal.changeCount).toBe(1);
    expect(seal.changes).toEqual({ sections: 0, questions: 1 });
    const summary = (await getSealSummaries([c.certId])).get(c.certId)!;
    expect(summary.changeCount).toBeNull();
    expect(summary.changes).toBeNull();
  });

  it("Offline-Paket enthält das Siegel (nur mit Freigabe)", async () => {
    const c = await course();
    const learner = await seedUser();
    expect((await getOfflinePackage(c.certId, learner))!.seal).toBeNull();
    await approve(c.certId, await reviewer(true));
    const pkg = (await getOfflinePackage(c.certId, learner))!;
    expect(pkg.seal).toMatchObject({ versionLabel: "1.0", anonymousCount: 0, changeCount: 0 });
    expect(pkg.seal!.reviewers).toHaveLength(1);
  });
});
