/** Praxisaufgabe wird durch eine Lektion freigeschaltet (echte DB, nur mit TEST_DATABASE_URL). */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { companyAssignments, lessonCompletions, organizationMemberships, organizations, practiceTasks, users } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { listMyPracticeTasks, listTasksUnlockedBySection, submitPracticeTask, TaskNotFoundError } from "./practice-tasks";

const run = TEST_DB ? describe : describe.skip;

run("Praxisaufgabe nach Lektion (echte DB)", () => {
  let userId = "";
  let orgId = "";
  let certId = "";
  let sectionId = "";

  beforeAll(async () => {
    userId = await seedUser();
    const course = await seedCourse(1);
    certId = course.certId;
    [sectionId] = await seedLessons(course.objectiveId, ["Inhalt"]);
    const [org] = await getDb().insert(organizations).values({ name: "Testfirma" }).returning();
    orgId = org.id;
    await getDb().insert(organizationMemberships).values({ organizationId: orgId, userId, role: "learner" });
    await getDb().insert(companyAssignments).values({ organizationId: orgId, userId, certificationId: certId });
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
    await getDb().delete(organizations).where(eq(organizations.id, orgId));
  });

  it("bleibt verborgen und nicht abgebbar, bis die Lektion abgeschlossen ist; danach erscheint sie", async () => {
    const [task] = await getDb().insert(practiceTasks).values({ organizationId: orgId, certificationId: certId, title: "VM partitionieren", unlockSectionId: sectionId }).returning();
    const [free] = await getDb().insert(practiceTasks).values({ organizationId: orgId, certificationId: certId, title: "Ohne Bedingung" }).returning();

    expect((await listMyPracticeTasks(orgId, userId)).map((t) => t.taskId)).toEqual([free.id]);
    expect(await listTasksUnlockedBySection(orgId, userId, sectionId)).toEqual([{ taskId: task.id, title: "VM partitionieren", unlocked: false }]);
    await expect(submitPracticeTask({ organizationId: orgId, userId, taskId: task.id })).rejects.toBeInstanceOf(TaskNotFoundError);

    await getDb().insert(lessonCompletions).values({ userId, sectionId });
    expect((await listMyPracticeTasks(orgId, userId)).map((t) => t.taskId).sort()).toEqual([task.id, free.id].sort());
    expect((await listTasksUnlockedBySection(orgId, userId, sectionId))[0].unlocked).toBe(true);
    await submitPracticeTask({ organizationId: orgId, userId, taskId: task.id });
  });
});
