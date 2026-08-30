import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { lessons, questions } from "@/lib/server/db/schema";

/**
 * Caching service to reduce AI API calls
 * Checks if content already exists before generating new content
 */
export class CachingService {
  /**
   * Checks if a lesson already exists for a section
   * Avoids redundant generation
   */
  static async getLessonIfExists(sectionId: string) {
    const db = getDb();
    const existing = await db
      .select()
      .from(lessons)
      .where(eq(lessons.sectionId, sectionId))
      .limit(1);

    return existing.length > 0 ? existing[0] : null;
  }

  /**
   * Checks if questions exist for an objective
   * Returns them if available
   */
  static async getQuestionsIfExist(objectiveId: string) {
    const db = getDb();
    const existing = await db
      .select()
      .from(questions)
      .where(eq(questions.objectiveId, objectiveId));

    return existing.length > 0 ? existing : null;
  }

  /**
   * Calculates estimated cost savings from caching
   */
  static calculateCostSavings(
    totalObjectives: number,
    generatedObjectives: number,
  ): {
    cached: number;
    generated: number;
    callsSaved: number;
    costReduction: number;
  } {
    // Approximate: 2 API calls per objective (lessons + questions)
    const totalCalls = totalObjectives * 2;
    const generatedCalls = generatedObjectives * 2;
    const cachedCalls = (totalObjectives - generatedObjectives) * 2;

    // Approximate cost per call: $0.01 (depends on model/provider)
    const estimatedCostPerCall = 0.01;
    const costSavings = cachedCalls * estimatedCostPerCall;

    return {
      cached: totalObjectives - generatedObjectives,
      generated: generatedObjectives,
      callsSaved: cachedCalls,
      costReduction: Math.round(costSavings * 100) / 100,
    };
  }

  /**
   * Gets cache statistics for a certification
   */
  static async getCacheStats(certificationId: string) {
    const db = getDb();

    // Count lessons and questions
    const lessonCount = await db.select().from(lessons);
    const questionCount = await db.select().from(questions);

    return {
      totalLessons: lessonCount.length,
      totalQuestions: questionCount.length,
      estimatedCostSavings: this.calculateCostSavings(
        Math.max(lessonCount.length, questionCount.length / 5),
        0,
      ),
    };
  }
}
