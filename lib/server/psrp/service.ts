/**
 * PSRP-HR: schreibt Reviews in das Log (roh, unveränderlich), schreibt den FSRS-Zustand fort und
 * hält `review_items.due_at` für die bestehenden Leser (Dashboard, Bereitschaft) synchron.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AnswerConfidence } from "@/lib/types";
import { getDb } from "@/lib/server/db/client";
import {
  itemStates,
  reviewItems,
  reviewLog,
  userFsrsParams,
  users,
  type ReviewLogType,
} from "@/lib/server/db/schema";
import { DEFAULT_PSRP_CONFIG } from "./config";
import { scheduleReview, type ItemState, type RawRating } from "./fsrs";
import { buildReviewLogRow } from "./review-log";

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
  const rTarget = options.rTarget ?? DEFAULT_PSRP_CONFIG.fsrs.rMax;

  await db.transaction(async (tx) => {
    const [user] = await tx.select({ timezone: users.timezone, ageRange: users.ageRange }).from(users).where(eq(users.id, userId)).limit(1);
    const [params] = await tx.select().from(userFsrsParams).where(eq(userFsrsParams.userId, userId)).limit(1);
    const itemIds = [...new Set(reviews.map((r) => r.itemId))];
    const existing = await tx
      .select()
      .from(itemStates)
      .where(and(eq(itemStates.userId, userId), inArray(itemStates.itemId, itemIds)));
    const states = new Map<string, ItemState>(existing.map((row) => [row.itemId, rowToState(row)]));

    const logRows: (typeof reviewLog.$inferInsert)[] = [];
    // Ein Review pro Item liegt im selben Moment; spätere Wiederholungen bekommen +1 ms,
    // damit die Reihenfolge im Log eindeutig bleibt.
    let offset = 0;
    for (const review of reviews) {
      const at = new Date(now.getTime() + offset++);
      const result = scheduleReview(states.get(review.itemId) ?? null, review.rawRating, at, rTarget, {
        weights: params?.weights ?? (user?.ageRange ? DEFAULT_PSRP_CONFIG.fsrs.ageRangeWeights[user.ageRange] : null) ?? null,
      });
      states.set(review.itemId, result.state);
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
