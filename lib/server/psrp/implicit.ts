/**
 * PSRP-HR Phase 6: implizite Wiederholungen. Aufgaben referenzieren Items; eine gelöste Aufgabe
 * erzeugt Reviews mit review_type = interleaved. Das Rating-Mapping ist Konfiguration.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { itemStates, questions, taskItems } from "@/lib/server/db/schema";
import { DEFAULT_PSRP_CONFIG, type PsrpConfig } from "./config";
import type { RawRating } from "./fsrs";
import { recordRatedReviews } from "./service";

export function implicitRating(solved: boolean, config: PsrpConfig["implicit"] = DEFAULT_PSRP_CONFIG.implicit): RawRating {
  return solved ? config.solved : config.failed;
}

export async function linkTaskItems(taskType: "simulation" | "practice", taskRef: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await getDb()
    .insert(taskItems)
    .values(itemIds.map((itemId) => ({ taskType, taskRef, itemId })))
    .onConflictDoNothing();
}

/** Reviews für alle Items, die die Aufgabe referenziert; liefert die Anzahl. */
export async function recordInterleavedTask(params: {
  userId: string;
  taskType: "simulation" | "practice";
  taskRef: string;
  solved: boolean;
  sessionId?: string;
  now?: Date;
}): Promise<number> {
  const rows = await getDb()
    .select({ itemId: taskItems.itemId })
    .from(taskItems)
    .where(and(eq(taskItems.taskType, params.taskType), eq(taskItems.taskRef, params.taskRef)));
  if (rows.length === 0) return 0;
  const rating = implicitRating(params.solved);
  await recordRatedReviews(
    params.userId,
    rows.map((r) => ({ itemId: r.itemId, rawRating: rating, reviewType: "interleaved" as const })),
    { sessionId: params.sessionId, now: params.now },
  );
  return rows.length;
}

/**
 * Skip-Erkennung: Wer den Einstiegstest eines Kapitels (Lernziel) besteht, dessen Items starten mit Rating 4 als
 * erstem Review statt als neue Karte. Items mit vorhandenem Zustand bleiben unberührt.
 */
export async function applyChapterSkip(userId: string, objectiveId: string, now = new Date()): Promise<number> {
  const db = getDb();
  const items = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.objectiveId, objectiveId), eq(questions.stale, false)));
  if (items.length === 0) return 0;
  const ids = items.map((i) => i.id);
  const known = await db
    .select({ itemId: itemStates.itemId })
    .from(itemStates)
    .where(and(eq(itemStates.userId, userId), inArray(itemStates.itemId, ids)));
  const knownIds = known.map((k) => k.itemId);
  const fresh = knownIds.length ? ids.filter((id) => !knownIds.includes(id)) : ids;
  if (fresh.length === 0) return 0;
  await recordRatedReviews(
    userId,
    fresh.map((itemId) => ({ itemId, rawRating: 4 as const, reviewType: "interleaved" as const })),
    { now },
  );
  return fresh.length;
}
