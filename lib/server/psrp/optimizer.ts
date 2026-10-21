/**
 * PSRP-HR Phase 2: persönlicher Parameter-Fit. Der Fit selbst kommt aus fsrs-rs
 * (@open-spaced-repetition/binding); hier werden nur Trainingsdaten aus dem Review-Log gebaut
 * und das Ergebnis gespeichert. Aufruf: scripts/fsrs-optimize.ts (z. B. wöchentlich per Cron).
 */
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { reviewLog, userFsrsParams } from "@/lib/server/db/schema";
import { DEFAULT_PSRP_CONFIG, type PsrpConfig } from "./config";

export interface LogEntry {
  itemId: string;
  rawRating: number;
  timestamp: Date;
}

export interface TrainingReview {
  rating: number;
  deltaDays: number;
}

const DAY_MS = 86_400_000;

/**
 * Trainingsdaten wie in fsrs-rs: je Item eine Historie pro Review ab dem zweiten
 * (Präfixe [r0,r1], [r0,r1,r2], …), Abstände in ganzen Tagen; Items mit nur einem Review entfallen.
 */
export function buildTrainingItems(entries: LogEntry[]): TrainingReview[][] {
  const byItem = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const list = byItem.get(entry.itemId) ?? [];
    list.push(entry);
    byItem.set(entry.itemId, list);
  }
  const items: TrainingReview[][] = [];
  for (const list of byItem.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const reviews = list.map((entry, i) => ({
      rating: entry.rawRating,
      deltaDays: i === 0 ? 0 : Math.max(0, Math.round((entry.timestamp.getTime() - list[i - 1].timestamp.getTime()) / DAY_MS)),
    }));
    for (let end = 2; end <= reviews.length; end++) items.push(reviews.slice(0, end));
  }
  return items;
}

/** Fit der Parameter aus Trainingsdaten (fsrs-rs). Die Bibliothek wird erst hier geladen (natives Modul). */
export async function computeWeights(items: TrainingReview[][]): Promise<number[]> {
  const binding = await import("@open-spaced-repetition/binding");
  const trainSet = items.map(
    (reviews) => new binding.FSRSBindingItem(reviews.map((r) => new binding.FSRSBindingReview(r.rating, r.deltaDays))),
  );
  return binding.computeParameters(trainSet, { enableShortTerm: false });
}

export type FitDecision = "fit" | "too_few_reviews" | "recent_fit";

export function decideFit(
  reviewCount: number,
  lastFit: { fittedAt: Date; reviewCount: number } | null,
  now: Date,
  config: PsrpConfig["fsrs"] = DEFAULT_PSRP_CONFIG.fsrs,
): FitDecision {
  if (reviewCount < config.minReviewsForFit) return "too_few_reviews";
  if (lastFit && now.getTime() - lastFit.fittedAt.getTime() < config.refitIntervalDays * DAY_MS) return "recent_fit";
  return "fit";
}

/** Fittet die Parameter eines Nutzers, wenn genug Reviews vorliegen und der letzte Fit lange genug her ist. */
export async function fitUser(userId: string, now = new Date()): Promise<FitDecision> {
  const db = getDb();
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewLog)
    .where(eq(reviewLog.userId, userId));
  const [last] = await db.select().from(userFsrsParams).where(eq(userFsrsParams.userId, userId)).limit(1);
  const decision = decideFit(count?.n ?? 0, last ?? null, now);
  if (decision !== "fit") return decision;

  const rows = await db
    .select({ itemId: reviewLog.itemId, rawRating: reviewLog.rawRating, timestamp: reviewLog.timestampUtc })
    .from(reviewLog)
    .where(eq(reviewLog.userId, userId))
    .orderBy(asc(reviewLog.timestampUtc));
  const items = buildTrainingItems(rows);
  if (items.length === 0) return "too_few_reviews";
  let weights: number[];
  try {
    weights = await computeWeights(items);
  } catch (error) {
    // fsrs-rs braucht genug Wiederholungen je Item; sonst beim nächsten Lauf erneut versuchen.
    if (error instanceof Error && error.message.includes("NotEnoughData")) return "too_few_reviews";
    throw error;
  }
  await db
    .insert(userFsrsParams)
    .values({ userId, weights, reviewCount: count.n, fittedAt: now })
    .onConflictDoUpdate({
      target: userFsrsParams.userId,
      set: { weights, reviewCount: count.n, fittedAt: now },
    });
  return "fit";
}

/** Alle Nutzer mit genug Reviews (für den periodischen Job). */
export async function usersDueForFit(minReviews = DEFAULT_PSRP_CONFIG.fsrs.minReviewsForFit): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: reviewLog.userId })
    .from(reviewLog)
    .groupBy(reviewLog.userId)
    .having(sql`count(*) >= ${minReviews}`);
  return rows.map((r) => r.userId);
}
