/** Sammelläufe gegen echte DB, mit gefälschter KI (nur mit TEST_DATABASE_URL). */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { aiBatchRuns, certifications, contentRevisions, courseCheckpoints, lessons, users } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { awaitBatch, BatchAlreadyRunningError, BatchNothingToDoError, cancelBatch, getBatchStatus, startBatch } from "./batch";
import type { Generate } from "./ai";

const run = TEST_DB ? describe : describe.skip;

const SIM = (t: string) => JSON.stringify({ type: "terminal", title: t, scenario: "Zeig die Dateien.", steps: [{ goal: "Alle", accept: ["ls -la"], output: "total 0", hint: "-a" }], success: "ok" });

run("Sammelläufe (echte DB, gefälschte KI)", () => {
  let userId = "";
  let certId = "";
  let sectionIds: string[] = [];

  beforeAll(async () => {
    userId = await seedUser();
    const course = await seedCourse(1);
    certId = course.certId;
    await getDb().update(certifications).set({ kind: "general" }).where(eq(certifications.id, certId));
    sectionIds = await seedLessons(course.objectiveId, ["## Eins\n\nKurzer Text.", "## Zwei\n\nNoch ein Text über Dateien."]);
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("Simulationen: ergänzt, wo es passt, überspringt Ungeeignetes, zählt mit", async () => {
    let calls = 0;
    const { runId } = await startBatch(
      { kind: "simulations", certificationId: certId, userId },
      { simulationGenerator: async () => (++calls === 1 ? { afterHeading: "", de: SIM("Dateien"), en: SIM("Files") } : null) },
    );
    await awaitBatch(runId);
    const status = await getBatchStatus("simulations", certId);
    expect(status).toMatchObject({ status: "done", total: 2, processed: 2, applied: 1, skipped: 1, failed: 0 });
    const rows = await getDb().select({ content: lessons.content }).from(lessons);
    expect(rows.filter((r) => r.content.de.includes("```simulation") || r.content.de.includes("````simulation")).length).toBeGreaterThanOrEqual(1);
    // Version mit Herkunft „Nachtrag“
    const revs = await getDb().select().from(contentRevisions).where(eq(contentRevisions.certificationId, certId));
    expect(revs.some((r) => r.origin === "backfill")).toBe(true);
  });

  it("zweiter Start: nur noch, was ungeeignet war; läuft einer, gibt es 409", async () => {
    const { runId } = await startBatch({ kind: "simulations", certificationId: certId, userId }, { simulationGenerator: async () => (await new Promise((r) => setTimeout(r, 150)), null) });
    await expect(startBatch({ kind: "simulations", certificationId: certId, userId }, { simulationGenerator: async () => null })).rejects.toBeInstanceOf(BatchAlreadyRunningError);
    await awaitBatch(runId);
    expect((await getBatchStatus("simulations", certId))?.status).toBe("done");
  });

  it("Qualitätsbericht: bearbeitet die Punkte, übernimmt, merkt vorher den Kursstand", async () => {
    const generate: Generate = async (_system, _user, schema) => {
      const candidate = {
        title: "Lektion neu", content: `## Eins\n\n${"Ausführlicher Text. ".repeat(40)}\n\n> [!EXAM]\n> Das wird geprüft.`,
        keyTakeaways: ["Merke"], examFocusPoints: ["Fokus"], cheatSheet: null, changes: "erweitert",
      };
      return schema.parse(candidate);
    };
    const { runId } = await startBatch({ kind: "quality", certificationId: certId, userId, params: { kinds: ["thin_lesson", "no_exam_callout"], maxItems: 10 } }, { generate });
    await awaitBatch(runId);
    const status = await getBatchStatus("quality", certId);
    expect(status?.status).toBe("done");
    expect(status!.applied).toBeGreaterThan(0);
    const rows = await getDb().select({ content: lessons.content }).from(lessons);
    expect(rows.some((r) => r.content.de.includes("Ausführlicher Text"))).toBe(true);
    const revs = await getDb().select().from(contentRevisions).where(eq(contentRevisions.certificationId, certId));
    expect(revs.some((r) => r.origin === "ai")).toBe(true);
    const cps = await getDb().select().from(courseCheckpoints).where(eq(courseCheckpoints.certificationId, certId));
    expect(cps.some((c) => c.name.startsWith("Automatisch vor KI-Überarbeitung"))).toBe(true);
    expect(sectionIds.length).toBe(2);
  });

  it("nichts zu tun → 422-Fall; Abbrechen eines nicht laufenden Laufs ist wirkungslos", async () => {
    await expect(startBatch({ kind: "quality", certificationId: certId, userId, params: { kinds: ["missing_objective"] } }, { generate: async (_s, _u, schema) => schema.parse({}) })).rejects.toBeInstanceOf(BatchNothingToDoError);
    expect(await cancelBatch("simulations", certId)).toBe(false);
  });

  it("Lauf ohne aktiven Prozess gilt nach Neustart als abgebrochen", async () => {
    const [ghost] = await getDb().insert(aiBatchRuns).values({ kind: "concepts", certificationId: certId, total: 3 }).returning();
    const status = await getBatchStatus("concepts", certId);
    expect(status).toMatchObject({ id: ghost.id, status: "failed" });
    expect(status?.message).toContain("neu gestartet");
  });
});
