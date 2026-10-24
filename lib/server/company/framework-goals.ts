import { and, asc, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, frameworkGoals, objectives } from "@/lib/server/db/schema";
import { listAssignableLearningPaths } from "./assignments";

/**
 * Ausbildungsrahmenplan der Firma (roadmap_motivation Phase 5): Mentor oder Firmen-Admin ordnen Lernzielen eines Lernpfads der Firma
 * Einträge ihres Plans zu. Die Lektion zeigt sie der lernenden Person unter „Warum lerne ich das?“. Jede Funktion filtert nach
 * `organizationId` aus der Mitgliedschaft.
 */

export const MAX_GOAL_TITLE = 200;
export const MAX_GOAL_CODE = 20;

export class InvalidGoalError extends Error {}
export class UnknownObjectiveError extends Error {}

const clean = (value: string | null | undefined, max: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function createFrameworkGoal(input: { organizationId: string; userId: string; objectiveId: string; code?: string | null; title: string }): Promise<{ id: string }> {
  const title = clean(input.title, MAX_GOAL_TITLE);
  if (title.length < 3) throw new InvalidGoalError();
  const code = clean(input.code, MAX_GOAL_CODE) || null;
  // Nur Lernziele von Lernpfaden, die die Firma auch zuweisen darf.
  const paths = await listAssignableLearningPaths(input.organizationId);
  const [objective] = await getDb()
    .select({ id: objectives.id, certificationId: domains.certificationId })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(objectives.id, input.objectiveId))
    .limit(1);
  if (!objective || !paths.some((p) => p.id === objective.certificationId)) throw new UnknownObjectiveError();
  const [row] = await getDb()
    .insert(frameworkGoals)
    .values({ organizationId: input.organizationId, objectiveId: objective.id, code, title, createdByUserId: input.userId })
    .returning({ id: frameworkGoals.id });
  await recordAuditEvent({ actorUserId: input.userId, action: "framework_goal.created", targetType: "framework_goal", targetId: row.id, metadata: { organizationId: input.organizationId } }).catch(() => {});
  return row;
}

export async function deleteFrameworkGoal(organizationId: string, goalId: string, userId: string): Promise<boolean> {
  const [row] = await getDb()
    .delete(frameworkGoals)
    .where(and(eq(frameworkGoals.id, goalId), eq(frameworkGoals.organizationId, organizationId)))
    .returning({ id: frameworkGoals.id });
  if (!row) return false;
  await recordAuditEvent({ actorUserId: userId, action: "framework_goal.deleted", targetType: "framework_goal", targetId: goalId, metadata: { organizationId } }).catch(() => {});
  return true;
}

export type FrameworkGoalView = { id: string; code: string | null; title: string; objectiveCode: string; objectiveTitle: string; learningPath: string };

export async function listFrameworkGoalsForOrg(organizationId: string): Promise<FrameworkGoalView[]> {
  const rows = await getDb()
    .select({ id: frameworkGoals.id, code: frameworkGoals.code, title: frameworkGoals.title, objectiveCode: objectives.code, objectiveTitle: objectives.title, learningPath: certifications.name })
    .from(frameworkGoals)
    .innerJoin(objectives, eq(objectives.id, frameworkGoals.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(certifications, eq(certifications.id, domains.certificationId))
    .where(eq(frameworkGoals.organizationId, organizationId))
    .orderBy(asc(certifications.name), asc(frameworkGoals.code), asc(frameworkGoals.createdAt));
  return rows;
}

/** Einträge des Plans der Firma zu einem Lernziel (für die Lektion der Person). */
export async function frameworkGoalsForObjective(organizationId: string, objectiveId: string): Promise<Array<{ code: string | null; title: string }>> {
  return getDb()
    .select({ code: frameworkGoals.code, title: frameworkGoals.title })
    .from(frameworkGoals)
    .where(and(eq(frameworkGoals.organizationId, organizationId), eq(frameworkGoals.objectiveId, objectiveId)))
    .orderBy(asc(frameworkGoals.code), asc(frameworkGoals.createdAt));
}
