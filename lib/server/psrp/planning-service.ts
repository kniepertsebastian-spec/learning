/**
 * PSRP-HR Phase 3+4 (DB-Seite): Check-in speichern, Φ und Tagesplan berechnen, Tages-Queue bauen.
 * Die Berechnungen selbst stehen in planner.ts und state.ts (rein, ohne DB).
 */
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  itemStates,
  objectives,
  questions,
  reviewItems,
  reviewLog,
  sessionCheckins,
  sessionDerived,
  studyProfiles,
  userCheckinFlags,
  users,
  type EvaluationGroup,
} from "@/lib/server/db/schema";
import { DEFAULT_PSRP_CONFIG, type PsrpConfig } from "./config";
import { getEvaluationGroup, usesHumanState, usesPlanning } from "./evaluation";
import { retrievability, type ItemState } from "./fsrs";
import {
  dailyLimit,
  daysUntilExam,
  examAdjustedTarget,
  selectDailyQueue,
  type DailyQueueResult,
  type DueCandidate,
} from "./planner";
import { localTimeParts } from "./review-log";
import {
  chronoProfile,
  chronoStress,
  computePhi,
  imputeCheckin,
  isMonotoneCheckins,
  targetRetention,
  withoutOutliers,
  type CheckinValues,
} from "./state";

export interface CheckinInput {
  energyLevel?: number;
  hadWorkday?: boolean;
}

export interface SessionPlan {
  group: EvaluationGroup;
  phi: number;
  rTarget: number;
  dailyLimit: number;
  checkin: CheckinValues;
  imputed: boolean;
  daysToExam: number | null;
}

/** Durchschnittliche Sekunden je Review des Nutzers (ohne Ausreißer); null ohne Daten. */
export async function averageSecondsPerReview(userId: string, config = DEFAULT_PSRP_CONFIG): Promise<number | null> {
  const rows = await getDb()
    .select({ ms: reviewLog.responseTimeMs })
    .from(reviewLog)
    .where(and(eq(reviewLog.userId, userId), sql`${reviewLog.responseTimeMs} is not null`))
    .orderBy(desc(reviewLog.timestampUtc))
    .limit(500);
  const times = withoutOutliers(rows.map((r) => r.ms as number), config.state);
  if (times.length < 10) return null;
  return times.reduce((a, b) => a + b, 0) / times.length / 1000;
}

async function userChronoProfile(userId: string, config: PsrpConfig) {
  const rows = await getDb()
    .select({
      hour: reviewLog.localHour,
      n: sql<number>`count(*)::int`,
      ok: sql<number>`sum(case when ${reviewLog.rawRating} > 1 then 1 else 0 end)::int`,
    })
    .from(reviewLog)
    .where(eq(reviewLog.userId, userId))
    .groupBy(reviewLog.localHour);
  const reviews = rows.flatMap((r) => [
    ...Array.from({ length: r.ok }, () => ({ localHour: r.hour, success: true })),
    ...Array.from({ length: r.n - r.ok }, () => ({ localHour: r.hour, success: false })),
  ]);
  return chronoProfile(reviews, config.state);
}

/**
 * Berechnet Φ, Ziel-Retention und Tageslimit einer neuen Session.
 *  - vanilla: Φ = 0, r = r_max, Limit aus dem Zeitbudget (keine weitere Planung)
 *  - planning: Φ = 0, Prüfungsmodus und Limit aus persönlichem Durchschnitt
 *  - planning_state: Φ aus Check-in, Chronotyp und Arbeitstag
 */
export async function planSession(params: {
  userId: string;
  certificationId: string;
  now: Date;
  timeBudgetMin: number;
  checkin?: CheckinInput;
  extraCards?: number;
  config?: PsrpConfig;
}): Promise<SessionPlan> {
  const config = params.config ?? DEFAULT_PSRP_CONFIG;
  const db = getDb();
  const group = await getEvaluationGroup(params.userId);

  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, params.userId)).limit(1);
  const timeZone = user?.timezone ?? "UTC";
  const [profile] = await db
    .select({ examDate: studyProfiles.examDate, lightWeekdays: studyProfiles.lightWeekdays })
    .from(studyProfiles)
    .where(and(eq(studyProfiles.userId, params.userId), eq(studyProfiles.certificationId, params.certificationId)))
    .limit(1);

  const [last] = await db
    .select({ energyLevel: sessionCheckins.energyLevel, hadWorkday: sessionCheckins.hadWorkday })
    .from(sessionCheckins)
    .where(and(eq(sessionCheckins.userId, params.userId), eq(sessionCheckins.imputed, false)))
    .orderBy(desc(sessionCheckins.timestamp))
    .limit(1);
  const { values: checkin, imputed } = imputeCheckin(params.checkin ?? {}, params.timeBudgetMin, last ?? null);

  let phi = 0;
  if (usesHumanState(group)) {
    const local = localTimeParts(params.now, timeZone);
    const chrono = chronoStress(await userChronoProfile(params.userId, config), local.hour, config.state);
    phi = computePhi(checkin, chrono, config.state);
  }

  const daysToExam = daysUntilExam(profile?.examDate, params.now);
  const base = usesPlanning(group) ? targetRetention(phi, config.fsrs) : config.fsrs.rMax;
  const rTarget = usesPlanning(group) ? examAdjustedTarget(base, daysToExam, config) : base;

  const lightDay = (profile?.lightWeekdays ?? []).includes(localTimeParts(params.now, timeZone).weekday);
  const limit = dailyLimit({
    timeBudgetMin: params.timeBudgetMin,
    avgSecondsPerReview: usesPlanning(group) ? await averageSecondsPerReview(params.userId, config) : null,
    phi,
    lightDay: usesPlanning(group) && lightDay,
    extra: params.extraCards,
    config,
  });
  return { group, phi, rTarget, dailyLimit: limit, checkin, imputed, daysToExam };
}

/** Rohdaten (Check-in) und abgeleitete Werte (Φ, r_target, Limit) getrennt speichern. */
export async function persistSessionPlan(sessionId: string, userId: string, plan: SessionPlan, now: Date): Promise<void> {
  const db = getDb();
  await db
    .insert(sessionCheckins)
    .values({
      sessionId,
      userId,
      energyLevel: plan.checkin.energyLevel,
      timeBudgetMin: plan.checkin.timeBudgetMin,
      hadWorkday: plan.checkin.hadWorkday,
      imputed: plan.imputed,
      timestamp: now,
    })
    .onConflictDoNothing();
  await db
    .insert(sessionDerived)
    .values({ sessionId, phi: plan.phi, rTarget: plan.rTarget, dailyLimit: plan.dailyLimit })
    .onConflictDoNothing();
  await updateMonotoneFlag(userId);
}

export async function updateMonotoneFlag(userId: string, config = DEFAULT_PSRP_CONFIG): Promise<boolean> {
  const db = getDb();
  const recent = await db
    .select({
      energyLevel: sessionCheckins.energyLevel,
      timeBudgetMin: sessionCheckins.timeBudgetMin,
      hadWorkday: sessionCheckins.hadWorkday,
    })
    .from(sessionCheckins)
    .where(and(eq(sessionCheckins.userId, userId), eq(sessionCheckins.imputed, false)))
    .orderBy(desc(sessionCheckins.timestamp))
    .limit(config.state.monotoneSessions);
  const monotone = isMonotoneCheckins(recent, config.state);
  await db
    .insert(userCheckinFlags)
    .values({ userId, monotone })
    .onConflictDoUpdate({ target: userCheckinFlags.userId, set: { monotone, updatedAt: new Date() } });
  return monotone;
}

export interface QueueItem extends DueCandidate {
  questionId: string;
}

/** Fällige Karten eines Nutzers in einem Kurs mit aktueller Retrievability und Prüfungsrelevanz. */
export async function loadDueCandidates(userId: string, certificationId: string, now: Date): Promise<DueCandidate[]> {
  const rows = await getDb()
    .select({
      itemId: reviewItems.questionId,
      legacyDue: reviewItems.dueAt,
      stability: itemStates.stability,
      difficulty: itemStates.difficulty,
      reps: itemStates.reps,
      lapses: itemStates.lapses,
      fsrsState: itemStates.fsrsState,
      lastReview: itemStates.lastReview,
      stateDue: itemStates.due,
      weight: domains.weightPercent,
    })
    .from(reviewItems)
    .innerJoin(questions, eq(questions.id, reviewItems.questionId))
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .leftJoin(itemStates, and(eq(itemStates.userId, reviewItems.userId), eq(itemStates.itemId, reviewItems.questionId)))
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(domains.certificationId, certificationId),
        lte(reviewItems.dueAt, now),
        eq(questions.stale, false),
      ),
    );
  const maxWeight = Math.max(1, ...rows.map((r) => (r.weight === null ? 0 : Number(r.weight))));
  return rows.map((row) => {
    const state: ItemState | null =
      row.stability !== null && row.difficulty !== null
        ? {
            stability: row.stability, difficulty: row.difficulty, reps: row.reps ?? 0, lapses: row.lapses ?? 0,
            fsrsState: row.fsrsState ?? 2, lastReview: row.lastReview, due: row.stateDue ?? row.legacyDue,
          }
        : null;
    return {
      itemId: row.itemId,
      // Bestandskarten aus der Zeit vor FSRS haben noch keinen Zustand: neutraler Mittelwert.
      retrievability: retrievability(state, now) ?? 0.7,
      difficulty: state?.difficulty ?? 5,
      examRelevance: row.weight === null ? 0 : Number(row.weight) / maxWeight,
      due: row.legacyDue,
    };
  });
}

/** `buildDailyQueue(user, now, timeBudgetMin, phi) -> Item[]` (zusätzlich mit dem Kurs und dem fertigen Plan). */
export async function buildDailyQueue(params: {
  userId: string;
  certificationId: string;
  now: Date;
  limit: number;
  phi: number;
  config?: PsrpConfig;
}): Promise<DailyQueueResult & { totalDue: number }> {
  const due = await loadDueCandidates(params.userId, params.certificationId, params.now);
  const [profile] = await getDb()
    .select({ examDate: studyProfiles.examDate })
    .from(studyProfiles)
    .where(and(eq(studyProfiles.userId, params.userId), eq(studyProfiles.certificationId, params.certificationId)))
    .limit(1);
  const result = selectDailyQueue({
    due,
    limit: params.limit,
    phi: params.phi,
    examActive: daysUntilExam(profile?.examDate, params.now) !== null,
    config: params.config,
  });
  return { ...result, totalDue: due.length };
}

/** Ziel-Retention einer bereits geplanten Session (für die Reviews, die in ihr entstehen). */
export async function sessionRTarget(sessionId: string): Promise<number | null> {
  const [row] = await getDb()
    .select({ r: sessionDerived.rTarget })
    .from(sessionDerived)
    .where(eq(sessionDerived.sessionId, sessionId))
    .limit(1);
  return row?.r ?? null;
}
