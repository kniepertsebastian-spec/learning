/**
 * PSRP-HR Phase 6: Praxisaufgaben als implizite Reviews. Die Firma entscheidet nur über „bestätigt“ oder „Nacharbeit“
 * (lib/server/company/practice-tasks.ts); in die persönliche Wiederholungsplanung fließt das erst hier ein, auf der
 * Lernseite. So bleibt der Firmenbereich frei von Lern-Modulen (company-architecture.test.ts).
 *
 * Bestätigt zählt als „gelöst“, Nacharbeit als „nicht gelöst“ (Rating-Mapping in der Konfiguration). Betroffen sind nur
 * Fragen des Lernziels, die die Person schon kennt (es gibt einen FSRS-Zustand): Eine Aufgabe macht aus ungesehenen
 * Fragen keine gelernten.
 */
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, itemStates, objectives, practiceTaskSubmissions, practiceTasks, questions } from "@/lib/server/db/schema";
import { implicitRating } from "./implicit";
import { recordRatedReviews } from "./service";

/** Verarbeitet neue Entscheidungen zu Praxisaufgaben einer Person; gibt die Anzahl erzeugter Reviews zurück. */
export async function applyReviewedPracticeTasks(userId: string, now = new Date()): Promise<number> {
  const db = getDb();
  const open = await db
    .select({
      id: practiceTaskSubmissions.id,
      status: practiceTaskSubmissions.status,
      objectiveId: practiceTasks.objectiveId,
      taskCertificationId: practiceTasks.certificationId,
    })
    .from(practiceTaskSubmissions)
    .innerJoin(practiceTasks, eq(practiceTasks.id, practiceTaskSubmissions.taskId))
    .where(
      and(
        eq(practiceTaskSubmissions.userId, userId),
        inArray(practiceTaskSubmissions.status, ["confirmed", "rework"]),
        isNull(practiceTaskSubmissions.learnedAt),
        isNotNull(practiceTasks.objectiveId),
      ),
    );
  let created = 0;
  for (const submission of open) {
    const [objective] = await db
      .select({ id: objectives.id })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(and(eq(objectives.id, submission.objectiveId as string), eq(domains.certificationId, submission.taskCertificationId)))
      .limit(1);
    if (objective) {
      const known = await db
        .select({ itemId: itemStates.itemId })
        .from(itemStates)
        .innerJoin(questions, eq(questions.id, itemStates.itemId))
        .where(
          and(
            eq(itemStates.userId, userId),
            eq(questions.objectiveId, objective.id),
            eq(questions.stale, false),
            eq(questions.probeOnly, false),
          ),
        );
      if (known.length > 0) {
        const rating = implicitRating(submission.status === "confirmed");
        await recordRatedReviews(
          userId,
          known.map((k) => ({ itemId: k.itemId, rawRating: rating, reviewType: "interleaved" as const })),
          { now },
        );
        created += known.length;
      }
    }
    // Auch ohne passende Fragen als verarbeitet markieren, damit es nicht bei jeder Session erneut geprüft wird.
    await db.update(practiceTaskSubmissions).set({ learnedAt: now }).where(eq(practiceTaskSubmissions.id, submission.id));
  }
  return created;
}
