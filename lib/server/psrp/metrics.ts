/**
 * PSRP-HR Phase 5: Metriken je Evaluationsgruppe. Berechnung rein (testbar), Export anonymisiert
 * (Nutzer erscheinen nur als gesalzener Hash, nie mit ID, E-Mail oder Namen).
 */
import { createHash } from "node:crypto";
import { asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { probeResults, reviewLog, users, type EvaluationGroup } from "@/lib/server/db/schema";
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
    }));

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
  return { asOf: asOf.toISOString(), groups: computeGroupMetrics(reviews, asOf), calibration };
}
