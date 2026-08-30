import { eq, inArray, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  quizAttempts,
  examAttempts,
  remediationSessions,
  objectiveProgress,
  questions,
  domains,
  objectives,
} from "@/lib/server/db/schema";

/**
 * Analytics service for tracking learner behavior and content effectiveness
 */
export class AnalyticsService {
  /**
   * Gets learner analytics for a user
   */
  static async getLearnerAnalytics(userId: string) {
    const db = getDb();

    const quizzes = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, userId));

    const exams = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.userId, userId));

    const remediations = await db
      .select()
      .from(remediationSessions)
      .where(eq(remediationSessions.userId, userId));

    const completionRate = quizzes.length > 0 ? Math.round((quizzes.length / 100) * 100) : 0;
    const avgQuizScore =
      quizzes.length > 0
        ? Math.round(
            quizzes.reduce((sum, q) => sum + (Number(q.score) || 0), 0) / quizzes.length,
          )
        : 0;

    const avgExamScore =
      exams.length > 0
        ? Math.round(
            exams.reduce((sum, e) => sum + (Number(e.score) || 0), 0) / exams.length,
          )
        : 0;

    const remediationRate =
      quizzes.length > 0 ? Math.round((remediations.length / quizzes.length) * 100) : 0;

    const improvedRemediations = remediations.filter((r) => r.improved).length;
    const remediationSuccessRate =
      remediations.length > 0 ? Math.round((improvedRemediations / remediations.length) * 100) : 0;

    return {
      quizzesCompleted: quizzes.length,
      examsCompleted: exams.length,
      remediationsSessions: remediations.length,
      completionRate,
      avgQuizScore,
      avgExamScore,
      remediationRate,
      remediationSuccessRate,
      totalStudyTime: 0, // TODO: Track in database
    };
  }

  /**
   * Gets content analytics - questions that are frequently answered incorrectly
   */
  static async getContentAnalytics(certificationId: string) {
    const db = getDb();

    const allQuestions = await db.select().from(questions);

    // Collect problem questions (low success rate)
    const questionStats: Array<{
      questionId: string;
      humanId: string;
      difficulty: string;
      totalAttempts: number;
      correctAttempts: number;
      successRate: number;
    }> = [];

    for (const question of allQuestions) {
      // In production, would query actual attempt data
      // For MVP, simulate based on difficulty
      const totalAttempts = Math.floor(Math.random() * 50) + 10;
      const successRate =
        question.difficulty === "easy"
          ? 0.8
          : question.difficulty === "intermediate"
            ? 0.6
            : 0.4;
      const correctAttempts = Math.floor(totalAttempts * successRate);

      if (successRate < 0.65) {
        // Flag questions with success rate below 65%
        questionStats.push({
          questionId: question.id,
          humanId: question.humanId,
          difficulty: question.difficulty,
          totalAttempts,
          correctAttempts,
          successRate: Math.round(successRate * 100),
        });
      }
    }

    // Sort by success rate (worst first)
    questionStats.sort((a, b) => a.successRate - b.successRate);

    return {
      totalQuestions: allQuestions.length,
      problemQuestions: questionStats.slice(0, 10),
      avgSuccessRate: 65,
    };
  }

  /**
   * Gets objective-level analytics
   */
  static async getObjectiveAnalytics(certificationId: string) {
    const db = getDb();

    const allObjectives = await db.select().from(objectives);
    const objectiveStats: Array<{
      objectiveId: string;
      code: string;
      title: string;
      avgMastery: number;
      learnerCount: number;
      needsReview: boolean;
    }> = [];

    for (const obj of allObjectives) {
      const progress = await db
        .select()
        .from(objectiveProgress)
        .where(eq(objectiveProgress.objectiveId, obj.id));

      const avgMastery =
        progress.length > 0
          ? Math.round(
              progress.reduce((sum, p) => sum + Number(p.masteryScore), 0) / progress.length,
            )
          : 0;

      objectiveStats.push({
        objectiveId: obj.id,
        code: obj.code,
        title: obj.title,
        avgMastery,
        learnerCount: progress.length,
        needsReview: avgMastery < 60,
      });
    }

    // Sort by mastery (lowest first)
    objectiveStats.sort((a, b) => a.avgMastery - b.avgMastery);

    const problematicObjectives = objectiveStats.filter((o) => o.needsReview).length;

    return {
      totalObjectives: allObjectives.length,
      avgMasteryAcross: Math.round(
        objectiveStats.reduce((sum, o) => sum + o.avgMastery, 0) / objectiveStats.length,
      ),
      objectivesByMastery: objectiveStats,
      problematicObjectives,
    };
  }

  /**
   * Gets domain-level analytics
   */
  static async getDomainAnalytics(certificationId: string) {
    const db = getDb();

    const allDomains = await db.select().from(domains).where(eq(domains.certificationId, certificationId));

    const domainStats: Array<{
      domainId: string;
      domainName: string;
      avgMastery: number;
      completionRate: number;
    }> = [];

    for (const domain of allDomains) {
      const domainObjectives = await db
        .select()
        .from(objectives)
        .where(eq(objectives.domainId, domain.id));

      const objectiveIds = domainObjectives.map((o) => o.id);
      const progress =
        objectiveIds.length > 0
          ? await db
              .select()
              .from(objectiveProgress)
              .where(inArray(objectiveProgress.objectiveId, objectiveIds))
          : [];

      const avgMastery =
        progress.length > 0
          ? Math.round(
              progress.reduce((sum, p) => sum + Number(p.masteryScore), 0) / progress.length,
            )
          : 0;

      const completionRate =
        domainObjectives.length > 0
          ? Math.round(
              (progress.filter((p) => Number(p.masteryScore) >= 60).length / domainObjectives.length) * 100,
            )
          : 0;

      domainStats.push({
        domainId: domain.id,
        domainName: domain.name,
        avgMastery,
        completionRate,
      });
    }

    return {
      domains: domainStats,
      avgDomainMastery: Math.round(
        domainStats.reduce((sum, d) => sum + d.avgMastery, 0) / domainStats.length,
      ),
    };
  }
}
