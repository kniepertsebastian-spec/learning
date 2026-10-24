/** Ausbildungsrahmenplan der Firma (echte DB, nur mit TEST_DATABASE_URL). */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { certifications, companyCourseEntitlements, organizations, users } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { createFrameworkGoal, deleteFrameworkGoal, frameworkGoalsForObjective, InvalidGoalError, listFrameworkGoalsForOrg, UnknownObjectiveError } from "./framework-goals";

const run = TEST_DB ? describe : describe.skip;

run("Ausbildungsrahmenplan (echte DB)", () => {
  let userId = "";
  let orgId = "";
  let otherOrgId = "";
  let objectiveId = "";
  let foreignObjectiveId = "";

  beforeAll(async () => {
    userId = await seedUser();
    const course = await seedCourse(0);
    const foreign = await seedCourse(0);
    objectiveId = course.objectiveId;
    foreignObjectiveId = foreign.objectiveId;
    const db = getDb();
    await db.update(certifications).set({ catalogStatus: "approved", kind: "general" }).where(eq(certifications.id, course.certId));
    const [org] = await db.insert(organizations).values({ name: "Testfirma" }).returning();
    const [other] = await db.insert(organizations).values({ name: "Andere Firma" }).returning();
    orgId = org.id;
    otherOrgId = other.id;
    await db.insert(companyCourseEntitlements).values({ organizationId: orgId, certificationId: course.certId });
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
    await getDb().delete(organizations).where(eq(organizations.id, orgId));
    await getDb().delete(organizations).where(eq(organizations.id, otherOrgId));
  });

  it("legt Einträge an, zeigt sie nur der eigenen Firma und entfernt sie", async () => {
    const created = await createFrameworkGoal({ organizationId: orgId, userId, objectiveId, code: " 2.3 ", title: "  Betriebssysteme   installieren " });
    expect(await frameworkGoalsForObjective(orgId, objectiveId)).toEqual([{ code: "2.3", title: "Betriebssysteme installieren" }]);
    expect(await frameworkGoalsForObjective(otherOrgId, objectiveId)).toEqual([]);
    expect((await listFrameworkGoalsForOrg(orgId)).map((g) => g.id)).toEqual([created.id]);

    expect(await deleteFrameworkGoal(otherOrgId, created.id, userId)).toBe(false); // fremde Firma
    expect(await deleteFrameworkGoal(orgId, created.id, userId)).toBe(true);
    expect(await frameworkGoalsForObjective(orgId, objectiveId)).toEqual([]);
  });

  it("lehnt zu kurze Titel und Lernziele fremder Lernpfade ab", async () => {
    await expect(createFrameworkGoal({ organizationId: orgId, userId, objectiveId, title: "ab" })).rejects.toBeInstanceOf(InvalidGoalError);
    await expect(createFrameworkGoal({ organizationId: orgId, userId, objectiveId: foreignObjectiveId, title: "Nicht zugewiesen" })).rejects.toBeInstanceOf(UnknownObjectiveError);
  });
});
