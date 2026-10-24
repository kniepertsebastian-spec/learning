/**
 * PSRP-HR: schreibt Reviews in das Log (roh, unveränderlich), schreibt den FSRS-Zustand fort und
 * hält `review_items.due_at` für die bestehenden Leser (Dashboard, Bereitschaft) synchron.
 */
import { randomUUID } from "node:crypto";
import { and, between, eq, inArray, sql } from "drizzle-orm";
import type { AnswerConfidence } from "@/lib/types";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  itemStates,
  objectives,
  questions,
  studyProfiles,
  reviewItems,
  reviewLog,
  userFsrsParams,
  users,
  type ReviewLogType,
} from "@/lib/server/db/schema";
import { DEFAULT_PSRP_CONFIG } from "./config";
import { scheduleReview, type ItemState, type RawRating } from "./fsrs";
import { getEvaluationGroup, usesPlanning } from "./evaluation";
import { balanceInterval, clampIntervalToExam, dayKey, daysUntilExam, examAdjustedTarget } from "./planner";
import { buildReviewLogRow, localTimeParts } from "./review-log";
import { sessionRTarget } from "./planning-service";

/** Rohes Rating aus Richtigkeit und (optionaler) Sicherheit der Antwort. */
export function ratingFromOutcome(isCorrect: boolean, confidence?: AnswerConfidence | null): RawRating {
  if (!isCorrect) return 1;
  if (confidence === "guessed") return 2;
  if (confidence === "sure") return 4;
  return 3;
}

export interface RatedReview {
  itemId: string;
  rawRating: RawRating;
  responseTimeMs?: number | null;
  reviewType?: ReviewLogType;
  probeVariantId?: string | null;
  variantQuestionId?: string | null;
  /** Eingewebt in den Lektionstest dieser Lektion (review_type interleaved). */
  wovenIntoLessonId?: string | null;
  /** Antwort entstand im Modus „Antwort zuerst überlegen“. */
  thinkFirst?: boolean;
}

export interface RecordOptions {
  sessionId?: string;
  now?: Date;
  /** Ziel-Retention der Planungsschicht; Standard: Obergrenze des Korridors. */
  rTarget?: number;
}

function rowToState(row: typeof itemStates.$inferSelect): ItemState {
  return {
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    fsrsState: row.fsrsState,
    lastReview: row.lastReview,
    due: row.due,
  };
}

/**
 * Verarbeitet Reviews in der übergebenen Reihenfolge: je Review genau ein Log-Eintrag.
 * Mehrere Reviews desselben Items hintereinander werden nacheinander angewendet.
 */
export async function recordRatedReviews(
  userId: string,
  reviews: RatedReview[],
  options: RecordOptions = {},
): Promise<{ sessionId: string }> {
  const sessionId = options.sessionId ?? randomUUID();
  if (reviews.length === 0) return { sessionId };
  const db = getDb();
  const now = options.now ?? new Date();
  const group = await getEvaluationGroup(userId);
  const planned = usesPlanning(group);
  // Ziel-Retention: explizit, sonst die der Session (Planungsschicht), sonst Obergrenze des Korridors.
  const sessionTarget = options.rTarget ?? (options.sessionId ? await sessionRTarget(options.sessionId) : null);
  const baseTarget = sessionTarget ?? DEFAULT_PSRP_CONFIG.fsrs.rMax;
  const DAY_MS = 86_400_000;

  await db.transaction(async (tx) => {
    const [user] = await tx.select({ timezone: users.timezone, ageRange: users.ageRange }).from(users).where(eq(users.id, userId)).limit(1);
    const [params] = await tx.select().from(userFsrsParams).where(eq(userFsrsParams.userId, userId)).limit(1);
    const itemIds = [...new Set(reviews.map((r) => r.itemId))];
    const existing = await tx
      .select()
      .from(itemStates)
      .where(and(eq(itemStates.userId, userId), inArray(itemStates.itemId, itemIds)));
    const states = new Map<string, ItemState>(existing.map((row) => [row.itemId, rowToState(row)]));

    // Planungsschicht: Prüfungsdatum und leichte Tage je Item (über den Kurs des Items).
    const timeZone = user?.timezone ?? "UTC";
    const itemContext = new Map<string, { examDate: Date | null; lightWeekdays: number[] }>();
    const loadByDay = new Map<string, number>();
    if (planned) {
      const contexts = await tx
        .select({ itemId: questions.id, examDate: studyProfiles.examDate, lightWeekdays: studyProfiles.lightWeekdays })
        .from(questions)
        .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
        .innerJoin(domains, eq(domains.id, objectives.domainId))
        .leftJoin(
          studyProfiles,
          and(eq(studyProfiles.certificationId, domains.certificationId), eq(studyProfiles.userId, userId)),
        )
        .where(inArray(questions.id, itemIds));
      for (const c of contexts) itemContext.set(c.itemId, { examDate: c.examDate, lightWeekdays: c.lightWeekdays ?? [] });
      // Bereits geplante Last der kommenden Tage (Fenster um die zu erwartenden Fälligkeiten).
      const horizon = new Date(now.getTime() + 400 * DAY_MS);
      const loadRows = await tx
        .select({ due: itemStates.due })
        .from(itemStates)
        .where(and(eq(itemStates.userId, userId), between(itemStates.due, now, horizon)));
      for (const row of loadRows) loadByDay.set(dayKey(row.due, timeZone), (loadByDay.get(dayKey(row.due, timeZone)) ?? 0) + 1);
    }

    const logRows: (typeof reviewLog.$inferInsert)[] = [];
    // Ein Review pro Item liegt im selben Moment; spätere Wiederholungen bekommen +1 ms,
    // damit die Reihenfolge im Log eindeutig bleibt.
    let offset = 0;
    for (const review of reviews) {
      const at = new Date(now.getTime() + offset++);
      const context = itemContext.get(review.itemId);
      const daysToExam = daysUntilExam(context?.examDate, at);
      const rTarget = planned ? examAdjustedTarget(baseTarget, daysToExam) : baseTarget;
      const result = scheduleReview(states.get(review.itemId) ?? null, review.rawRating, at, rTarget, {
        weights: params?.weights ?? (user?.ageRange ? DEFAULT_PSRP_CONFIG.fsrs.ageRangeWeights[user.ageRange] : null) ?? null,
      });
      let state = result.state;
      if (planned) {
        // Nur die Fälligkeit wird verschoben; Stabilität und Schwierigkeit bleiben unverändert (Regel 1).
        let interval = clampIntervalToExam(result.intervalDays, daysToExam);
        interval = balanceInterval({
          from: at,
          intervalDays: interval,
          loadByDay,
          lightWeekdays: context?.lightWeekdays,
          weekdayOf: (d) => localTimeParts(d, timeZone).weekday,
          daysToExam,
          timeZone,
        });
        state = { ...state, due: new Date(at.getTime() + interval * DAY_MS) };
        const key = dayKey(state.due, timeZone);
        loadByDay.set(key, (loadByDay.get(key) ?? 0) + 1);
      }
      states.set(review.itemId, state);
      logRows.push(
        buildReviewLogRow({
          userId,
          itemId: review.itemId,
          sessionId,
          timestamp: at,
          timeZone: user?.timezone ?? "UTC",
          rawRating: review.rawRating,
          responseTimeMs: review.responseTimeMs,
          reviewType: review.reviewType,
          probeVariantId: review.probeVariantId,
          variantQuestionId: review.variantQuestionId,
          wovenIntoLessonId: review.wovenIntoLessonId,
          thinkFirst: review.thinkFirst,
          predictedR: result.predictedR,
        }),
      );
    }

    await tx.insert(reviewLog).values(logRows);

    const finalRows = itemIds.map((itemId) => {
      const state = states.get(itemId)!;
      return {
        userId,
        itemId,
        stability: state.stability,
        difficulty: state.difficulty,
        reps: state.reps,
        lapses: state.lapses,
        fsrsState: state.fsrsState,
        lastReview: state.lastReview,
        due: state.due,
        updatedAt: now,
      };
    });
    await tx
      .insert(itemStates)
      .values(finalRows)
      .onConflictDoUpdate({
        target: [itemStates.userId, itemStates.itemId],
        set: {
          stability: sql`excluded.stability`,
          difficulty: sql`excluded.difficulty`,
          reps: sql`excluded.reps`,
          lapses: sql`excluded.lapses`,
          fsrsState: sql`excluded.fsrs_state`,
          lastReview: sql`excluded.last_review`,
          due: sql`excluded.due`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    // review_items bleibt die Fälligkeits-Sicht der bestehenden Leser.
    const lastRating = new Map(reviews.map((r) => [r.itemId, r.rawRating]));
    const queueRows = itemIds.map((itemId) => {
      const state = states.get(itemId)!;
      const dayMs = 86_400_000;
      return {
        userId,
        questionId: itemId,
        dueAt: state.due,
        intervalDays: Math.max(0, (state.due.getTime() - (state.lastReview ?? now).getTime()) / dayMs).toFixed(2),
        repetitions: state.reps,
        lastOutcome: ((lastRating.get(itemId) ?? 1) >= 2 ? "correct" : "incorrect") as "correct" | "incorrect",
        lastAnsweredAt: now,
        updatedAt: now,
      };
    });
    await tx
      .insert(reviewItems)
      .values(queueRows)
      .onConflictDoUpdate({
        target: [reviewItems.userId, reviewItems.questionId],
        set: {
          dueAt: sql`excluded.due_at`,
          intervalDays: sql`excluded.interval_days`,
          repetitions: sql`excluded.repetitions`,
          lastOutcome: sql`excluded.last_outcome`,
          lastAnsweredAt: sql`excluded.last_answered_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  });
  return { sessionId };
}
