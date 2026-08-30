import { eq, inArray, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  quizAttempts,
  quizAnswers,
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

    const certObjectiveIds = (
      await db
        .select({ id: objectives.id })
        .from(objectives)
        .innerJoin(domains, eq(domains.id, objectives.domainId))
        .where(eq(domains.certificationId, certificationId))
    ).map((o) => o.id);

    const allQuestions =
      certObjectiveIds.length > 0
        ? await db.select().from(questions).where(inArray(questions.objectiveId, certObjectiveIds))
        : [];
    const questionIds = allQuestions.map((q) => q.id);
    const allAnswers =
      questionIds.length > 0
        ? await db.select().from(quizAnswers).where(inArray(quizAnswers.questionId, questionIds))
        : [];

    const answersByQuestion = new Map<string, { total: number; correct: number }>();
    for (const answer of allAnswers) {
      const stats = answersByQuestion.get(answer.questionId) ?? { total: 0, correct: 0 };
      stats.total++;
      if (answer.isCorrect) stats.correct++;
      answersByQuestion.set(answer.questionId, stats);
    }

    const questionStats: Array<{
      questionId: string;
      humanId: string;
      difficulty: string;
      totalAttempts: number;
      correctAttempts: number;
      successRate: number;
    }> = [];

    for (const question of allQuestions) {
      const stats = answersByQuestion.get(question.id);
      // Require at least 3 real attempts before judging a question as
      // "problematic" - otherwise one unlucky guess flags it unfairly.
      if (!stats || stats.total < 3) continue;

      const successRate = stats.correct / stats.total;
      if (successRate < 0.65) {
        questionStats.push({
          questionId: question.id,
          humanId: question.humanId,
          difficulty: question.difficulty,
          totalAttempts: stats.total,
          correctAttempts: stats.correct,
          successRate: Math.round(successRate * 100),
        });
      }
    }

    // Sort by success rate (worst first)
    questionStats.sort((a, b) => a.successRate - b.successRate);

    const questionsWithData = [...answersByQuestion.values()].filter((s) => s.total >= 3);
    const avgSuccessRate =
      questionsWithData.length > 0
        ? Math.round(
            (questionsWithData.reduce((sum, s) => sum + s.correct / s.total, 0) /
              questionsWithData.length) *
              100,
          )
        : 0;

    return {
      totalQuestions: allQuestions.length,
      questionsWithEnoughData: questionsWithData.length,
      problemQuestions: questionStats.slice(0, 10),
      avgSuccessRate,
    };
  }

  /**
   * Gets objective-level analytics
   */
  static async getObjectiveAnalytics(certificationId: string) {
    const db = getDb();

    const allObjectives = await db
      .select()
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, certificationId))
      .then((rows) => rows.map((r) => r.objectives));
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
