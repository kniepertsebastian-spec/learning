import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { lessons, questions, reviewItems, sections, simulationResults } from "@/lib/server/db/schema";
import { extractSimulationSources } from "@/lib/markdown/simulation";

/** Ab so vielen Hilfen (Tipp, Lösung, Fehlversuche) gilt eine Simulation als „mit Mühe gelöst“ und kommt in die Wiederholung. */
export const STRUGGLE_HELPS = 2;

export type SimulationProgress = { simIndex: number; bestHelps: number; solves: number };

export async function listSimulationProgress(userId: string, sectionId: string): Promise<SimulationProgress[]> {
  return getDb()
    .select({ simIndex: simulationResults.simIndex, bestHelps: simulationResults.bestHelps, solves: simulationResults.solves })
    .from(simulationResults)
    .where(and(eq(simulationResults.userId, userId), eq(simulationResults.sectionId, sectionId)));
}

export class SimulationNotFoundError extends Error {}

/**
 * Hält eine gelöste Simulation fest (jede Runde zählt als Lösung, die beste Runde als Bestwert). Löst jemand sie nur mit
 * viel Hilfe, werden die Wiederholungsfragen des Lernziels schon jetzt fällig: was sich nicht von selbst gelöst hat,
 * soll bald wieder auf den Tisch (roadmap3.md, Schritt 5). Es entstehen keine neuen Wiederholungseinträge, nur
 * bestehende werden vorgezogen.
 */
export async function recordSimulationSolved(userId: string, sectionId: string, simIndex: number, helps: number): Promise<{ struggled: boolean; pulledForward: number }> {
  const db = getDb();
  const [row] = await db
    .select({ objectiveId: sections.objectiveId, content: lessons.content })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (!row) throw new SimulationNotFoundError("Lektion nicht gefunden.");
  const count = Math.max(extractSimulationSources(row.content.de).length, extractSimulationSources(row.content.en).length);
  if (simIndex < 0 || simIndex >= count) throw new SimulationNotFoundError("Simulation nicht gefunden.");

  const h = Math.max(0, Math.min(99, Math.floor(helps)));
  const now = new Date();
  await db
    .insert(simulationResults)
    .values({ userId, sectionId, simIndex, bestHelps: h, lastHelps: h })
    .onConflictDoUpdate({
      target: [simulationResults.userId, simulationResults.sectionId, simulationResults.simIndex],
      set: {
        solves: sql`${simulationResults.solves} + 1`,
        bestHelps: sql`least(${simulationResults.bestHelps}, ${h})`,
        lastHelps: h,
        lastSolvedAt: now,
      },
    });

  const struggled = h >= STRUGGLE_HELPS;
  let pulledForward = 0;
  if (struggled) {
    const questionIds = (await db.select({ id: questions.id }).from(questions).where(and(eq(questions.objectiveId, row.objectiveId), eq(questions.stale, false)))).map((q) => q.id);
    if (questionIds.length) {
      const moved = await db
        .update(reviewItems)
        .set({ dueAt: now })
        .where(and(eq(reviewItems.userId, userId), inArray(reviewItems.questionId, questionIds), gt(reviewItems.dueAt, now)))
        .returning({ id: reviewItems.id });
      pulledForward = moved.length;
    }
  }
  return { struggled, pulledForward };
}
