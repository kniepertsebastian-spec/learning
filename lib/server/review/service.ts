import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, objectives, questions, reviewItems } from "@/lib/server/db/schema";
import type { AnswerConfidence } from "@/lib/types";
import { ratingFromOutcome, recordRatedReviews } from "@/lib/server/psrp/service";

export interface ReviewOutcomeInput {
  questionId: string;
  isCorrect: boolean;
  confidence?: AnswerConfidence | null;
  responseTimeMs?: number | null;
}

/**
 * Schreibt die beantworteten Fragen eines Quiz-, Prüfungs- oder Session-Versuchs als Reviews
 * (PSRP-HR: Review-Log + FSRS-Zustand, siehe lib/server/psrp/service.ts). Fragen ohne
 * questions-Zeile (ad-hoc generierte Remediation-Fragen) werden übersprungen.
 */
export async function recordReviewOutcomes(
  userId: string,
  results: ReviewOutcomeInput[],
  options: { sessionId?: string; rTarget?: number } = {},
): Promise<void> {
  if (results.length === 0) return;
  const db = getDb();
  // Dedupliziert auf die letzte Antwort je Frage.
  const deduped = [...new Map(results.map((r) => [r.questionId, r])).values()];
  const known = await db
    .select({ id: questions.id })
    .from(questions)
    .where(inArray(questions.id, deduped.map((r) => r.questionId)));
  const knownIds = new Set(known.map((q) => q.id));

  await recordRatedReviews(
    userId,
    deduped
      .filter((r) => knownIds.has(r.questionId))
      .map((r) => ({
        itemId: r.questionId,
        rawRating: ratingFromOutcome(r.isCorrect, r.confidence),
        responseTimeMs: r.responseTimeMs ?? null,
      })),
    options,
  );
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
