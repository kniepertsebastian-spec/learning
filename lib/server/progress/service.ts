import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  objectiveProgress,
  quizAnswers,
  questions,
  quizAttempts,
} from "@/lib/server/db/schema";

export interface MasteryData {
  objectiveId: string;
  masteryScore: number;
  status: "LEARNING" | "OK" | "STRONG";
  totalAttempts: number;
  correctCount: number;
  lastAttemptAt: Date;
  hasEnoughData: boolean;
}

const MIN_ATTEMPTS_FOR_STABLE_RATING = 3;
const MAX_RECENT_ATTEMPTS = 20;

export class ObjectiveProgressService {
  static calculateRecencyWeight(index: number, totalCount: number): number {
    // Most recent = 1.0, oldest = 0.5
    return 0.5 + (0.5 * (totalCount - index)) / totalCount;
  }

  static calculateDifficultyWeight(difficulty: string | null): number {
    // Slight boost for harder questions. Values match the actual difficulty
    // enum used by generated questions (draftQuestionSchema in
    // lib/server/ai/schemas.ts: beginner/intermediate/advanced) - this
    // previously checked for "hard"/"medium"/"easy", which never matched
    // anything, silently making difficulty weighting a no-op since step 10.
    if (difficulty === "advanced") return 1.15;
    if (difficulty === "intermediate") return 1.0;
    if (difficulty === "beginner") return 0.85;
    return 1.0;
  }

  static async calculateObjectiveMastery(
    userId: string,
    objectiveId: string,
  ): Promise<MasteryData> {
    const db = getDb();

    // Get recent answers for this objective (last 20)
    const answers = await db
      .select({
        isCorrect: quizAnswers.isCorrect,
        attemptId: quizAttempts.id,
        completedAt: quizAttempts.completedAt,
        difficulty: questions.difficulty,
      })
      .from(quizAnswers)
      .innerJoin(questions, eq(questions.id, quizAnswers.questionId))
      .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.quizAttemptId))
      .where(
        and(
          eq(questions.objectiveId, objectiveId),
          eq(quizAttempts.userId, userId),
        ),
      )
      .orderBy(desc(quizAttempts.completedAt))
      .limit(MAX_RECENT_ATTEMPTS);

    const totalAttempts = answers.length;
    const hasEnoughData = totalAttempts >= MIN_ATTEMPTS_FOR_STABLE_RATING;

    if (totalAttempts === 0) {
      return {
        objectiveId,
        masteryScore: 0,
        status: "LEARNING",
        totalAttempts: 0,
        correctCount: 0,
        lastAttemptAt: new Date(),
        hasEnoughData: false,
      };
    }

    // Calculate weighted mastery score
    let weightedCorrectness = 0;
    let totalWeight = 0;

    answers.forEach((answer, index) => {
      const recencyWeight = this.calculateRecencyWeight(index, totalAttempts);
      const difficultyWeight = this.calculateDifficultyWeight(answer.difficulty);
      const correctness = answer.isCorrect ? 1 : 0;

      const weight = recencyWeight * difficultyWeight;
      weightedCorrectness += correctness * weight;
      totalWeight += weight;
    });

    const masteryScore = totalWeight > 0 ? Math.round((weightedCorrectness / totalWeight) * 100) : 0;
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const lastAttemptAt = answers[0]?.completedAt ?? new Date();

    // Determine status
    let status: "LEARNING" | "OK" | "STRONG";
    if (!hasEnoughData) {
      status = "LEARNING";
    } else if (masteryScore >= 80) {
      status = "STRONG";
    } else if (masteryScore >= 60) {
      status = "OK";
    } else {
      status = "LEARNING";
    }

    return {
      objectiveId,
      masteryScore,
      status,
      totalAttempts,
      correctCount,
      lastAttemptAt,
      hasEnoughData,
    };
  }

  static async updateObjectiveProgress(userId: string, objectiveId: string): Promise<void> {
    const db = getDb();
    const mastery = await this.calculateObjectiveMastery(userId, objectiveId);

    // Upsert: update if exists, insert if not
    const existing = await db
      .select()
      .from(objectiveProgress)
      .where(
        and(
          eq(objectiveProgress.userId, userId),
          eq(objectiveProgress.objectiveId, objectiveId),
        ),
      );

    if (existing.length > 0) {
      await db
        .update(objectiveProgress)
        .set({
          masteryScore: String(mastery.masteryScore),
          status: mastery.status,
          lastAttemptAt: mastery.lastAttemptAt,
        })
        .where(
          and(
            eq(objectiveProgress.userId, userId),
            eq(objectiveProgress.objectiveId, objectiveId),
          ),
        );
    } else {
      await db.insert(objectiveProgress).values({
        userId,
        objectiveId,
        masteryScore: String(mastery.masteryScore),
        status: mastery.status,
        lastAttemptAt: mastery.lastAttemptAt,
      });
    }
  }

  static async updateProgressForQuizAttempt(
    userId: string,
    attemptId: string,
  ): Promise<void> {
    const db = getDb();

    // Find all objectives touched by this quiz attempt
    const answers = await db
      .select({ objectiveId: questions.objectiveId })
      .from(quizAnswers)
      .innerJoin(questions, eq(questions.id, quizAnswers.questionId))
      .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.quizAttemptId))
      .where(eq(quizAttempts.id, attemptId));

    // Deduplicate objectives
    const touchedObjectives = [...new Map(answers.map((a) => [a.objectiveId, a])).values()];

    // Update progress for each touched objective
    for (const { objectiveId } of touchedObjectives) {
      await this.updateObjectiveProgress(userId, objectiveId);
    }
  }
}
