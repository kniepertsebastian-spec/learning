/**
 * PSRP-HR Phase 5: Metriken je Evaluationsgruppe. Berechnung rein (testbar), Export anonymisiert
 * (Nutzer erscheinen nur als gesalzener Hash, nie mit ID, E-Mail oder Namen).
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { energyModeEvents, examAttempts, examPlans, exams, probeResults, recallChecks, reviewLog, users, type EvaluationGroup } from "@/lib/server/db/schema";
import { readiness } from "@/lib/exams/plan";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { reactivationStats } from "@/lib/server/reactivation/service";
import { variantRotationEnabled } from "@/lib/server/variants/rotation";
import { DEFAULT_PSRP_CONFIG } from "./config";
import { calibrationHistory, type ProbeObservation } from "./calibration";

const DAY_MS = 86_400_000;
const EPS = 1e-6;

export interface Prediction {
  predicted: number;
  success: boolean;
}

export function logLoss(rows: Prediction[]): number | null {
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => {
    const p = Math.min(1 - EPS, Math.max(EPS, r.predicted));
    return acc - (r.success ? Math.log(p) : Math.log(1 - p));
  }, 0);
  return sum / rows.length;
}

export function rmse(rows: Prediction[]): number | null {
  if (rows.length === 0) return null;
  return Math.sqrt(rows.reduce((acc, r) => acc + (r.predicted - (r.success ? 1 : 0)) ** 2, 0) / rows.length);
}

export interface MetricReview {
  userHash: string;
  group: EvaluationGroup;
  timestamp: Date;
  rawRating: number;
  predictedR: number | null;
  /** Feature-Flag `variant_rotation` des Nutzers und ob in diesem Review eine Variante statt des Originals gezeigt wurde. */
  rotation?: boolean;
  variantShown?: boolean;
  /** Feature-Flag `pretest_questions` des Nutzers. */
  pretest?: boolean;
  /** Feature-Flag `recall_check` des Nutzers. */
  recall?: boolean;
  /** Feature-Flag `understanding_mode` des Nutzers. */
  understanding?: boolean;
  /** Feature-Flag `dropout_guard` des Nutzers. */
  dropoutGuard?: boolean;
  /** Feature-Flag `exit_with_win` des Nutzers. */
  exitWithWin?: boolean;
  /** Feature-Flag `reactivation` des Nutzers. */
  reactivation?: boolean;
  /** Feature-Flag `woven_reviews` des Nutzers. */
  wovenReviews?: boolean;
  /** Feature-Flag `energy_modes` des Nutzers. */
  energyModes?: boolean;
}

export interface GroupMetrics {
  group: EvaluationGroup;
  users: number;
  reviews: number;
  logLoss: number | null;
  rmse: number | null;
  reviewsPerDay: number | null;
  actualRetention: number | null;
  activeDaysPerUser: number | null;
  abandonedUsers: number;
  abandonRate: number | null;
}

/** Gruppenmetriken. Abbruch = keine Session in den letzten `abandonAfterDays` Tagen vor `asOf`. */
export function computeGroupMetrics(
  reviews: MetricReview[],
  asOf: Date,
  abandonAfterDays = DEFAULT_PSRP_CONFIG.evaluation.abandonAfterDays,
): GroupMetrics[] {
  const groups = new Map<EvaluationGroup, MetricReview[]>();
  for (const r of reviews) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);

  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([group, rows]) => {
    const byUser = new Map<string, MetricReview[]>();
    for (const r of rows) byUser.set(r.userHash, [...(byUser.get(r.userHash) ?? []), r]);

    const predicted = rows
      .filter((r) => r.predictedR !== null)
      .map((r) => ({ predicted: r.predictedR as number, success: r.rawRating > 1 }));
    let activeDays = 0;
    let userDays = 0;
    let abandoned = 0;
    for (const list of byUser.values()) {
      const days = new Set(list.map((r) => r.timestamp.toISOString().slice(0, 10)));
      activeDays += days.size;
      const first = Math.min(...list.map((r) => r.timestamp.getTime()));
      userDays += Math.max(1, Math.ceil((asOf.getTime() - first) / DAY_MS));
      const last = Math.max(...list.map((r) => r.timestamp.getTime()));
      if (asOf.getTime() - last > abandonAfterDays * DAY_MS) abandoned++;
    }
    return {
      group,
      users: byUser.size,
      reviews: rows.length,
      logLoss: logLoss(predicted),
      rmse: rmse(predicted),
      reviewsPerDay: userDays > 0 ? rows.length / userDays : null,
      actualRetention: predicted.length ? predicted.filter((p) => p.success).length / predicted.length : null,
      activeDaysPerUser: byUser.size ? activeDays / byUser.size : null,
      abandonedUsers: abandoned,
      abandonRate: byUser.size ? abandoned / byUser.size : null,
    };
  });
}

export interface ExamResultInput {
  userId: string;
  group: EvaluationGroup | null;
  status: "passed" | "failed";
  scheduledAt: Date;
  /** Simulationsergebnisse (%) dieses Kurses vor dem Prüfungstermin, älteste zuerst. */
  scoresBeforeExam: number[];
}

export interface ExamResultMetric {
  user: string;
  group: EvaluationGroup | null;
  result: "passed" | "failed";
  /** Bereitschaftswert vor der Prüfung (Engine aus lib/exams/plan.ts); Grundlage, um ihn gegen das echte Ergebnis zu kalibrieren. */
  readiness: { reached: number; ready: boolean; lastScore: number | null };
}

/** Prüfungsergebnis je Nutzer samt Bereitschaft vor der Prüfung, anonymisiert (roadmap_didaktik Phase 7). */
export function computeExamResults(rows: ExamResultInput[], salt: string): ExamResultMetric[] {
  return rows.map((r) => {
    const { reached, ready } = readiness(r.scoresBeforeExam);
    return {
      user: anonymize(r.userId, salt),
      group: r.group,
      result: r.status,
      readiness: { reached, ready, lastScore: r.scoresBeforeExam.length ? r.scoresBeforeExam[r.scoresBeforeExam.length - 1] : null },
    };
  });
}

export interface VariantArmMetrics {
  users: number;
  reviews: number;
  /** Anteil Reviews mit Rating > 1. */
  retention: number | null;
  reviewsWithVariant: number;
  retentionVariant: number | null;
  retentionOriginal: number | null;
}

const rate = (rows: MetricReview[]) => (rows.length ? rows.filter((r) => r.rawRating > 1).length / rows.length : null);

/** Kennzahlen getrennt nach Nutzern mit und ohne ein Feature-Flag (beschreibend, keine automatische Auswertung). */
export function computeFlagArms(reviews: MetricReview[], flagOf: (r: MetricReview) => boolean): { enabled: Pick<VariantArmMetrics, "users" | "reviews" | "retention">; disabled: Pick<VariantArmMetrics, "users" | "reviews" | "retention"> } {
  const arm = (rows: MetricReview[]) => ({ users: new Set(rows.map((r) => r.userHash)).size, reviews: rows.length, retention: rate(rows) });
  return { enabled: arm(reviews.filter(flagOf)), disabled: arm(reviews.filter((r) => !flagOf(r))) };
}

/** Feature-Flag `variant_rotation`: Kennzahlen getrennt nach Nutzern mit und ohne Rotation sowie nach Variante vs. Original. */
export function computeVariantMetrics(reviews: MetricReview[]): { enabled: VariantArmMetrics; disabled: VariantArmMetrics } {
  const arm = (rows: MetricReview[]): VariantArmMetrics => ({
    users: new Set(rows.map((r) => r.userHash)).size,
    reviews: rows.length,
    retention: rate(rows),
    reviewsWithVariant: rows.filter((r) => r.variantShown).length,
    retentionVariant: rate(rows.filter((r) => r.variantShown)),
    retentionOriginal: rate(rows.filter((r) => !r.variantShown)),
  });
  return { enabled: arm(reviews.filter((r) => r.rotation)), disabled: arm(reviews.filter((r) => !r.rotation)) };
}

export function anonymize(userId: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${userId}`).digest("hex").slice(0, 16);
}

/** Vollständiger, reproduzierbarer Export (Gruppenmetriken + Verlauf der Kalibrierungswerte je anonymem Nutzer). */
export async function exportMetrics(options: { asOf?: Date; salt?: string } = {}) {
  const asOf = options.asOf ?? new Date();
  const salt = options.salt ?? "psrp-export";
  const db = getDb();
  const rows = await db
    .select({
      userId: reviewLog.userId,
      group: users.evaluationGroup,
      timestamp: reviewLog.timestampUtc,
      rawRating: reviewLog.rawRating,
      predictedR: reviewLog.predictedR,
      variantQuestionId: reviewLog.variantQuestionId,
      wovenIntoLessonId: reviewLog.wovenIntoLessonId,
    })
    .from(reviewLog)
    .innerJoin(users, eq(users.id, reviewLog.userId))
    .where(isNotNull(users.evaluationGroup))
    .orderBy(asc(reviewLog.timestampUtc), asc(reviewLog.id));
  const reviews: MetricReview[] = rows
    .filter((r) => r.timestamp <= asOf)
    .map((r) => ({
      userHash: anonymize(r.userId, salt),
      group: r.group as EvaluationGroup,
      timestamp: r.timestamp,
      rawRating: r.rawRating,
      predictedR: r.predictedR,
      rotation: variantRotationEnabled(r.userId),
      variantShown: r.variantQuestionId !== null,
      pretest: isFeatureEnabled("pretest_questions", r.userId),
      recall: isFeatureEnabled("recall_check", r.userId),
      understanding: isFeatureEnabled("understanding_mode", r.userId),
      dropoutGuard: isFeatureEnabled("dropout_guard", r.userId),
      exitWithWin: isFeatureEnabled("exit_with_win", r.userId),
      energyModes: isFeatureEnabled("energy_modes", r.userId),
      reactivation: isFeatureEnabled("reactivation", r.userId),
      wovenReviews: isFeatureEnabled("woven_reviews", r.userId),
    }));

  // Energie-Alternativen: Anteil gewählter Alternativen an den Abenden mit niedriger Energie oder Entlastung, und ob am Folgetag gelernt wurde.
  const energyRows = (
    await db
      .select({ userId: energyModeEvents.userId, mode: energyModeEvents.mode, createdAt: energyModeEvents.createdAt })
      .from(energyModeEvents)
      .orderBy(asc(energyModeEvents.createdAt))
  ).filter((e) => e.createdAt <= asOf);
  const reviewDays = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = reviewDays.get(r.userId) ?? new Set<string>();
    set.add(r.timestamp.toISOString().slice(0, 10));
    reviewDays.set(r.userId, set);
  }
  const nextDay = (d: Date) => new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
  const energyChoices = {
    events: energyRows.length,
    alternativeChosen: energyRows.filter((e) => e.mode !== "normal").length,
    alternativeShare: energyRows.length ? energyRows.filter((e) => e.mode !== "normal").length / energyRows.length : null,
    returnedNextDay: energyRows.filter((e) => reviewDays.get(e.userId)?.has(nextDay(e.createdAt))).length,
  };

  // Eingewebte Fragen: wie viele es gab und wie oft sie richtig beantwortet wurden (Rating ab 2).
  const wovenRows = rows.filter((r) => r.timestamp <= asOf && r.wovenIntoLessonId !== null);
  const wovenStats = { reviews: wovenRows.length, correct: wovenRows.filter((r) => r.rawRating >= 2).length };

  const probeRows = await db
    .select({
      userId: probeResults.userId,
      topicArea: probeResults.topicArea,
      predictedR: probeResults.predictedR,
      selfRating: probeResults.selfRating,
      populationRate: probeResults.populationRate,
      success: probeResults.success,
      createdAt: probeResults.createdAt,
    })
    .from(probeResults)
    .orderBy(asc(probeResults.createdAt));
  const byUser = new Map<string, ProbeObservation[]>();
  for (const p of probeRows) {
    byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), { ...p, timestamp: p.createdAt }]);
  }
  const calibration = [...byUser].map(([userId, observations]) => ({
    user: anonymize(userId, salt),
    history: calibrationHistory(observations),
  }));

  // Rückblick „Was weißt du noch?“: Abstand zur Lektion, Tagesform (Φ) und Tageszeit beim Lernen und beim Rückblick, Ergebnis, übersprungen ja/nein.
  const recallRows = await db
    .select({
      userId: recallChecks.userId,
      group: users.evaluationGroup,
      status: recallChecks.status,
      questionCount: recallChecks.questionCount,
      correctCount: recallChecks.correctCount,
      hoursSinceLesson: recallChecks.hoursSinceLesson,
      phiAtLearning: recallChecks.phiAtLearning,
      hourAtLearning: recallChecks.hourAtLearning,
      phiAtRecall: recallChecks.phiAtRecall,
      hourAtRecall: recallChecks.hourAtRecall,
      createdAt: recallChecks.createdAt,
    })
    .from(recallChecks)
    .innerJoin(users, eq(users.id, recallChecks.userId))
    .orderBy(asc(recallChecks.createdAt));
  const recallMetrics = recallRows
    .filter((r) => r.createdAt <= asOf)
    .map(({ userId, createdAt: _createdAt, ...rest }) => ({ user: anonymize(userId, salt), ...rest }));

  const planRows = await db
    .select({ userId: examPlans.userId, certificationId: examPlans.certificationId, status: examPlans.status, scheduledAt: examPlans.scheduledAt, group: users.evaluationGroup })
    .from(examPlans)
    .innerJoin(users, eq(users.id, examPlans.userId))
    .where(and(inArray(examPlans.status, ["passed", "failed"]), isNotNull(examPlans.scheduledAt)));
  const finished = planRows.filter((p) => p.scheduledAt && p.scheduledAt <= asOf);
  const attemptRows = finished.length
    ? await db
        .select({ userId: examAttempts.userId, certificationId: exams.certificationId, score: examAttempts.score, at: examAttempts.completedAt })
        .from(examAttempts)
        .innerJoin(exams, eq(exams.id, examAttempts.examId))
        .where(and(inArray(examAttempts.userId, [...new Set(finished.map((p) => p.userId))]), isNotNull(examAttempts.completedAt)))
        .orderBy(asc(examAttempts.completedAt))
    : [];
  const examResults = computeExamResults(
    finished.map((p) => ({
      userId: p.userId,
      group: p.group as EvaluationGroup | null,
      status: p.status as "passed" | "failed",
      scheduledAt: p.scheduledAt as Date,
      scoresBeforeExam: attemptRows
        .filter((a) => a.userId === p.userId && a.certificationId === p.certificationId && a.at && a.at <= (p.scheduledAt as Date))
        .map((a) => Number(a.score ?? 0)),
    })),
    salt,
  );
  return { asOf: asOf.toISOString(), groups: computeGroupMetrics(reviews, asOf), variantRotation: computeVariantMetrics(reviews), pretestQuestions: computeFlagArms(reviews, (r) => Boolean(r.pretest)), understandingMode: computeFlagArms(reviews, (r) => Boolean(r.understanding)), dropoutGuard: computeFlagArms(reviews, (r) => Boolean(r.dropoutGuard)), exitWithWin: computeFlagArms(reviews, (r) => Boolean(r.exitWithWin)), wovenReviews: { arms: computeFlagArms(reviews, (r) => Boolean(r.wovenReviews)), woven: wovenStats }, reactivation: { arms: computeFlagArms(reviews, (r) => Boolean(r.reactivation)), messages: await reactivationStats(asOf) }, energyModes: { arms: computeFlagArms(reviews, (r) => Boolean(r.energyModes)), choices: energyChoices }, recallCheck: { arms: computeFlagArms(reviews, (r) => Boolean(r.recall)), checks: recallMetrics }, calibration, examResults };
}
