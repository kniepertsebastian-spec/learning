/** Ausgangswerte speichern und vergleichen (echte DB, nur mit TEST_DATABASE_URL). */
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { metricSnapshots, studySessions, users } from "@/lib/server/db/schema";
import { compareSnapshots, getSnapshot, listSnapshots, saveSnapshot } from "./baseline-db";
import { seedCourse, seedUser } from "./test-db";

const run = TEST_DB ? describe : describe.skip;
const saved: string[] = [];

run("Ausgangswerte (echte DB)", () => {
  afterAll(async () => {
    for (const id of saved) await getDb().delete(metricSnapshots).where(eq(metricSnapshots.id, id));
  });

  it("speichert Kennzahlen mit Flag-Anteilen, findet sie wieder und vergleicht mit dem aktuellen Stand", async () => {
    const before = await saveSnapshot("  Vor dem Test  ", { env: { FEATURE_EXIT_WITH_WIN_ROLLOUT: "50" } });
    saved.push(before.id);
    expect(before.label).toBe("Vor dem Test");
    expect(before.flagConfig.exit_with_win).toBe(50);
    expect(before.flagConfig.reactivation).toBe(100);
    expect(before.figures["engagement.all.users"]).toBeDefined();
    expect((await getSnapshot("latest"))?.id).toBe(before.id);
    expect((await getSnapshot(before.id))?.label).toBe("Vor dem Test");
    expect(await getSnapshot("kein-id")).toBeNull();
    expect((await listSnapshots()).some((s) => s.id === before.id)).toBe(true);

    // Eine Person fängt an zu lernen: die Zahl aktiver Personen steigt im Vergleich
    const course = await seedCourse(1);
    const userId = await seedUser();
    await getDb().update(users).set({ evaluationGroup: "planning" }).where(eq(users.id, userId));
    await getDb().insert(studySessions).values({ userId, certificationId: course.certId, status: "completed", goalType: "minutes", goalValue: 10, plannedAt: new Date(), completedAt: new Date() });
    const { rows, basisBefore, basisAfter } = await compareSnapshots(before);
    // Andere Tests laufen parallel und legen ebenfalls Personen an oder löschen sie: geprüft wird nur, dass Vorher, Nachher und Delta zusammenpassen.
    const people = rows.find((r) => r.key === "engagement.all.users")!;
    expect(people.before).not.toBeNull();
    expect(people.after).not.toBeNull();
    expect(people.delta).toBe(people.after!.value! - people.before!.value!);
    expect(basisAfter).toBeDefined();
    expect(basisBefore).toEqual(before.basis);
  });

  it("verlangt eine Bezeichnung", async () => {
    await expect(saveSnapshot("   ")).rejects.toThrow();
  });
});
