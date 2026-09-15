import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, objectives, questions, reviewItems } from "@/lib/server/db/schema";
import type { ReviewOutcome } from "@/lib/server/db/schema";
import { computeNextReview, type ReviewState } from "./scheduler";

export interface ReviewOutcomeInput {
  questionId: string;
  isCorrect: boolean;
}

/**
 * R2.2 (roadmap.md): aktualisiert (oder legt an) den Review-Zustand für jede
 * beantwortete Frage eines Nutzers - aufgerufen nach dem Auswerten eines
 * Quiz- oder Prüfungsversuchs (siehe app/api/sections/[id]/attempt,
 * app/api/exams/[certId]/[examId]/attempt). Fragen ohne eine questions-Zeile
 * (z. B. ad-hoc generierte Remediation-Fragen) werden übersprungen, nicht
 * verworfen mit Fehler - review_items.questionId ist eine echte FK.
 *
 * Ein Bulk-Upsert statt einer Schleife aus Einzelqueries, analog zu den
 * bereits bestehenden Bulk-Inserts für quizAnswers/examQuestions - wichtig
 * bei einer 90-Fragen-Abschlussprüfung. Wie der Rest der R1/R2-DB-Schicht
 * in dieser Sandbox mangels laufender Postgres-Instanz nicht End-to-End
 * getestet (siehe derselbe Hinweis in blueprint-approval.ts) - die reine
 * Scheduling-Logik ist vollständig in scheduler.test.ts abgedeckt.
 */
export async function recordReviewOutcomes(
  userId: string,
  results: ReviewOutcomeInput[],
): Promise<void> {
  if (results.length === 0) return;
  const db = getDb();

  // Dedupliziert auf die letzte Antwort je Frage - ein Bulk-Upsert darf
  // dieselbe Konfliktzeile nicht zweimal in einer Anweisung treffen.
  const dedupedResults = [...new Map(results.map((r) => [r.questionId, r])).values()];
  const questionIds = dedupedResults.map((r) => r.questionId);

  const [questionRows, existingRows] = await Promise.all([
    db
      .select({ id: questions.id, difficulty: questions.difficulty })
      .from(questions)
      .where(inArray(questions.id, questionIds)),
    db
      .select()
      .from(reviewItems)
      .where(and(eq(reviewItems.userId, userId), inArray(reviewItems.questionId, questionIds))),
  ]);

  const difficultyByQuestion = new Map(questionRows.map((q) => [q.id, q.difficulty]));
  const existingByQuestion = new Map(existingRows.map((r) => [r.questionId, r]));
  const now = new Date();

  const rows = dedupedResults
    .filter((result) => difficultyByQuestion.has(result.questionId))
    .map((result) => {
      const existing = existingByQuestion.get(result.questionId);
      const previous: ReviewState | null = existing
        ? {
            repetitions: existing.repetitions,
            easeFactor: Number(existing.easeFactor),
            intervalDays: Number(existing.intervalDays),
          }
        : null;

      const next = computeNextReview(
        previous,
        result.isCorrect ? "correct" : "incorrect",
        difficultyByQuestion.get(result.questionId) ?? null,
        now,
      );

      return {
        userId,
        questionId: result.questionId,
        dueAt: next.dueAt,
        intervalDays: next.intervalDays.toString(),
        repetitions: next.repetitions,
        easeFactor: next.easeFactor.toString(),
        lastOutcome: (result.isCorrect ? "correct" : "incorrect") as ReviewOutcome,
        lastAnsweredAt: now,
        updatedAt: now,
      };
    });

  if (rows.length === 0) return;

  await db
    .insert(reviewItems)
    .values(rows)
    .onConflictDoUpdate({
      target: [reviewItems.userId, reviewItems.questionId],
      set: {
        dueAt: sql`excluded.due_at`,
        intervalDays: sql`excluded.interval_days`,
        repetitions: sql`excluded.repetitions`,
        easeFactor: sql`excluded.ease_factor`,
        lastOutcome: sql`excluded.last_outcome`,
        lastAnsweredAt: sql`excluded.last_answered_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

export interface DueReviewItem {
  questionId: string;
  dueAt: Date;
  objectiveId: string;
  domainWeightPercent: number | null;
}

/**
 * R2.2: fällige Wiederholungen für eine Zertifizierung, fälligste zuerst.
 * "Fragenrotation sicherstellen" ergibt sich strukturell daraus, dass jede
 * beantwortete Frage sofort auf ein neues, späteres dueAt springt - dieselbe
 * Frage kommt also erst wieder hoch, wenn andere fällige Fragen abgearbeitet
 * sind. Bei gleichem dueAt entscheidet die Domain-Gewichtung
 * ("Objective-Gewichtung berücksichtigen", roadmap.md). Wie eine Session aus
 * fälligen + neuen + schwachen Fragen gemischt wird, ist R2.3 (Session
 * Builder), nicht Teil dieser Funktion.
 */
export async function getDueReviewItems(
  userId: string,
  certificationId: string,
  options: { limit?: number; now?: Date } = {},
): Promise<DueReviewItem[]> {
  const db = getDb();
  const now = options.now ?? new Date();

  const rows = await db
    .select({
      questionId: reviewItems.questionId,
      dueAt: reviewItems.dueAt,
      objectiveId: questions.objectiveId,
      domainWeightPercent: domains.weightPercent,
    })
    .from(reviewItems)
    .innerJoin(questions, eq(questions.id, reviewItems.questionId))
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(domains.certificationId, certificationId),
        lte(reviewItems.dueAt, now),
        eq(questions.stale, false),
      ),
    )
    .orderBy(asc(reviewItems.dueAt), sql`${domains.weightPercent} desc nulls last`)
    .limit(options.limit ?? 100);

  return rows.map((row) => ({
    ...row,
    domainWeightPercent: row.domainWeightPercent === null ? null : Number(row.domainWeightPercent),
  }));
}

/** R2.2/R2.4: reine Zählung für das "Heute lernen"-Dashboard (R2.4) - ohne
 * die Zeilen selbst zu laden. */
export async function getDueReviewCount(
  userId: string,
  certificationId: string,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewItems)
    .innerJoin(questions, eq(questions.id, reviewItems.questionId))
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(domains.certificationId, certificationId),
        lte(reviewItems.dueAt, now),
        eq(questions.stale, false),
      ),
    );
  return row?.count ?? 0;
}
