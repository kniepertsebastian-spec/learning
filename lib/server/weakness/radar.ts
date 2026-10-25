import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, objectives, questions, quizAnswers, quizAttempts, quizzes } from "@/lib/server/db/schema";
import { rankWeaknesses, WEAKNESS_LIMIT, type WeaknessTopic } from "@/lib/weakness/rank";

export interface WeaknessRadar {
  topics: WeaknessTopic[];
  /** Gibt es überhaupt Antworten aus den „Sitzt das?“-Quizzes dieses Kurses? Ohne sie zeigt die Oberfläche den Radar nicht. */
  hasData: boolean;
}

/**
 * Schwächen-Radar eines Kurses: aus den „Sitzt das?“-Quizzes (Kapitelende, dazu alte Lektionstests) die Top-3-Themen mit den meisten
 * noch falschen Fragen. Je Frage zählt nur die letzte Antwort.
 */
export async function getWeaknessRadar(userId: string, certificationId: string, limit = WEAKNESS_LIMIT): Promise<WeaknessRadar> {
  const rows = await getDb()
    .selectDistinctOn([quizAnswers.questionId], {
      questionId: quizAnswers.questionId,
      isCorrect: quizAnswers.isCorrect,
      objectiveId: objectives.id,
      objectiveCode: objectives.code,
      objectiveTitle: objectives.title,
    })
    .from(quizAnswers)
    .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.quizAttemptId))
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .innerJoin(questions, eq(questions.id, quizAnswers.questionId))
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.completedAt), eq(domains.certificationId, certificationId)))
    .orderBy(quizAnswers.questionId, desc(quizAttempts.completedAt), desc(quizAnswers.id));
  return { topics: rankWeaknesses(rows, limit), hasData: rows.length > 0 };
}
