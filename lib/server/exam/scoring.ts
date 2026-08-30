import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  objectives,
  domains,
  questions,
  questionOptions,
  objectiveProgress,
} from "@/lib/server/db/schema";

export interface WeakObjective {
  objectiveId: string;
  objectiveCode: string;
  objectiveTitle: string;
  domainName: string;
  examScore: number;
  overallMastery: number;
  questionsAttempted: number;
  questionsCorrect: number;
}

export interface DomainPerformance {
  domainId: string;
  domainName: string;
  score: number;
  questionsAttempted: number;
  questionsCorrect: number;
}

export interface ExamScoringResult {
  overallScore: number;
  readinessLevel: "WELL_PREPARED" | "ADEQUATELY_PREPARED" | "SOMEWHAT_PREPARED" | "NEEDS_PREPARATION";
  readinessLabel: string;
  readinessConfidence: number; // 0-1, higher = more confident
  domainPerformance: DomainPerformance[];
  weakObjectives: WeakObjective[];
  recommendations: string[];
  comparison: {
    scoreVsProgress: "ahead" | "aligned" | "behind";
    progressTrend: "improving" | "stable" | "declining";
  };
}

/**
 * Comprehensive exam scoring with detailed analysis and recommendations
 */
export class ExamScoringService {
  static async scoreExam(
    userId: string,
    examId: string,
    answerResults: Array<{
      questionId: string;
      isCorrect: boolean;
    }>,
    locale: string = "en",
  ): Promise<ExamScoringResult> {
    const db = getDb();

    // Get overall score
    const correctCount = answerResults.filter((r) => r.isCorrect).length;
    const overallScore = Math.round((correctCount / answerResults.length) * 100);

    // Get question details with objectives and domains
    const questionIds = answerResults.map((r) => r.questionId);
    const questionData = await db
      .select({
        questionId: questions.id,
        objectiveId: questions.objectiveId,
        difficulty: questions.difficulty,
      })
      .from(questions)
      .where(inArray(questions.id, questionIds));

    const objectiveIds = [...new Set(questionData.map((q) => q.objectiveId))];
    const objectiveDetails = await db
      .select({
        id: objectives.id,
        code: objectives.code,
        title: objectives.title,
        domainId: domains.id,
        domainName: domains.name,
      })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(inArray(objectives.id, objectiveIds));

    // Calculate per-objective performance
    const objectiveScores: Map<string, { correct: number; total: number }> = new Map();
    for (const q of questionData) {
      if (!objectiveScores.has(q.objectiveId)) {
        objectiveScores.set(q.objectiveId, { correct: 0, total: 0 });
      }
      const result = answerResults.find((r) => r.questionId === q.questionId);
      const score = objectiveScores.get(q.objectiveId)!;
      score.total++;
      if (result?.isCorrect) {
        score.correct++;
      }
    }

    // Calculate per-domain performance
    const domainScores: Map<string, { correct: number; total: number }> = new Map();
    for (const obj of objectiveDetails) {
      const score = objectiveScores.get(obj.id);
      if (!score) continue;

      if (!domainScores.has(obj.domainId)) {
        domainScores.set(obj.domainId, { correct: 0, total: 0 });
      }
      const domain = domainScores.get(obj.domainId)!;
      domain.correct += score.correct;
      domain.total += score.total;
    }

    // Get overall objective mastery from progress tracking
    const progressRecords = await db
      .select()
      .from(objectiveProgress)
      .where(inArray(objectiveProgress.objectiveId, objectiveIds));

    const masteryMap = new Map(
      progressRecords.map((p: typeof progressRecords[0]) => [p.objectiveId, Number(p.masteryScore)]),
    );

    // Identify weak objectives (below 70% on exam)
    const weakObjectives: WeakObjective[] = [];
    for (const obj of objectiveDetails) {
      const score = objectiveScores.get(obj.id);
      if (!score || score.total === 0) continue;

      const examScore = Math.round((score.correct / score.total) * 100);
      if (examScore < 70) {
        // Struggling in exam
        weakObjectives.push({
          objectiveId: obj.id,
          objectiveCode: obj.code,
          objectiveTitle: obj.title,
          domainName: obj.domainName,
          examScore,
          overallMastery: masteryMap.get(obj.id) ?? 0,
          questionsAttempted: score.total,
          questionsCorrect: score.correct,
        });
      }
    }

    // Sort by exam score (worst first)
    weakObjectives.sort((a: WeakObjective, b: WeakObjective) => a.examScore - b.examScore);

    // Determine readiness level
    let readinessLevel: "WELL_PREPARED" | "ADEQUATELY_PREPARED" | "SOMEWHAT_PREPARED" | "NEEDS_PREPARATION";
    let readinessLabel: string;
    let readinessConfidence: number;

    if (overallScore >= 80) {
      readinessLevel = "WELL_PREPARED";
      readinessLabel = locale === "de" ? "Gut vorbereitet" : "Well prepared for certification";
      readinessConfidence = Math.min(0.95, 0.7 + (overallScore - 80) / 100);
    } else if (overallScore >= 70) {
      readinessLevel = "ADEQUATELY_PREPARED";
      readinessLabel = locale === "de" ? "Angemessen vorbereitet" : "Adequately prepared, some review recommended";
      readinessConfidence = Math.min(0.85, 0.6 + (overallScore - 70) / 100);
    } else if (overallScore >= 60) {
      readinessLevel = "SOMEWHAT_PREPARED";
      readinessLabel = locale === "de" ? "Teilweise vorbereitet" : "Somewhat prepared, significant review needed";
      readinessConfidence = 0.4 + (overallScore - 60) / 100;
    } else {
      readinessLevel = "NEEDS_PREPARATION";
      readinessLabel = locale === "de" ? "Nicht ausreichend vorbereitet" : "Needs more preparation before attempting certification";
      readinessConfidence = Math.max(0.1, overallScore / 100);
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (weakObjectives.length > 0) {
      const topWeak = weakObjectives.slice(0, 3);
      if (locale === "de") {
        recommendations.push(
          `Fokussiere auf diese schwachen Bereiche: ${topWeak.map((w) => `${w.objectiveCode} (${w.examScore}%)`).join(", ")}`,
        );
        if (overallScore < 60) {
          recommendations.push("Wiederhole die Hauptkonzepte für alle Domains vor der Zertifizierungsprüfung.");
        }
        if (overallScore >= 70 && overallScore < 80) {
          recommendations.push("Eine gezielte Wiederholung der schwachen Bereiche sollte ausreichen.");
        }
      } else {
        recommendations.push(
          `Focus on these weak areas: ${topWeak.map((w) => `${w.objectiveCode} (${w.examScore}%)`).join(", ")}`,
        );
        if (overallScore < 60) {
          recommendations.push("Review core concepts for all domains before the certification exam.");
        }
        if (overallScore >= 70 && overallScore < 80) {
          recommendations.push("Targeted review of weak areas should be sufficient.");
        }
      }
    } else {
      if (locale === "de") {
        recommendations.push("Ausgezeichnete Leistung! Du bist gut vorbereitet.");
      } else {
        recommendations.push("Excellent performance! You're well-prepared for the certification exam.");
      }
    }

    // Compare exam score to overall progress
    const avgMastery =
      masteryMap.size > 0
        ? Math.round(
            Array.from(masteryMap.values()).reduce((a, b) => a + b, 0) / masteryMap.size,
          )
        : 0;

    let scoreVsProgress: "ahead" | "aligned" | "behind";
    if (overallScore > avgMastery + 5) {
      scoreVsProgress = "ahead";
    } else if (overallScore < avgMastery - 5) {
      scoreVsProgress = "behind";
    } else {
      scoreVsProgress = "aligned";
    }

    // Determine trend (simplified - in production would track over time)
    let progressTrend: "improving" | "stable" | "declining";
    if (overallScore > 75 && weakObjectives.length === 0) {
      progressTrend = "improving";
    } else if (overallScore < 50 && weakObjectives.length > 3) {
      progressTrend = "declining";
    } else {
      progressTrend = "stable";
    }

    // Build domain performance list
    const domainPerformance: DomainPerformance[] = [];
    for (const [domainId, domainObj] of Array.from(domainScores.entries())) {
      const domainName = objectiveDetails.find((o) => o.domainId === domainId)?.domainName || "Unknown";
      domainPerformance.push({
        domainId,
        domainName,
        score: Math.round((domainObj.correct / domainObj.total) * 100),
        questionsAttempted: domainObj.total,
        questionsCorrect: domainObj.correct,
      });
    }

    // Sort by score
    domainPerformance.sort((a: DomainPerformance, b: DomainPerformance) => a.score - b.score);

    return {
      overallScore,
      readinessLevel,
      readinessLabel,
      readinessConfidence,
      domainPerformance,
      weakObjectives: weakObjectives.slice(0, 5), // Top 5 weak areas
      recommendations,
      comparison: {
        scoreVsProgress,
        progressTrend,
      },
    };
  }
}
