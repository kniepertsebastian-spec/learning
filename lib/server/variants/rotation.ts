/**
 * Roadmap Didaktik Phase 1 (Paket 2.2c): Wiederholungen zeigen eine Variante statt immer derselben Frage. Der FSRS-Zustand
 * und `review_log.item_id` bleiben am Original; die gezeigte Variante steht in `study_session_items.variant_question_id`
 * (bei Sessionstart festgelegt, damit ein Reload nichts ändert) und wird als `review_log.variant_question_id` mitgeloggt.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { itemVariants, questions, reviewLog } from "@/lib/server/db/schema";

/** Mindestabstand, bis dieselbe Variante erneut gezeigt wird. */
export const MIN_VARIANT_GAP_DAYS = 30;
/** Mindestzahl aktiver Varianten (inkl. Original), damit die Rotation greift. */
export const MIN_VARIANTS_FOR_ROTATION = 2;
const DAY_MS = 86_400_000;

/** Feature-Flag `variant_rotation`: stabile Zuteilung je Nutzer, Anteil über VARIANT_ROTATION_ROLLOUT (0-100, Standard 100), hart aus mit VARIANT_ROTATION=0. */
export function variantRotationEnabled(userId: string, env: Record<string, string | undefined> = process.env): boolean {
  if (env.VARIANT_ROTATION === "0") return false;
  const raw = Number(env.VARIANT_ROTATION_ROLLOUT);
  const percent = env.VARIANT_ROTATION_ROLLOUT === undefined || env.VARIANT_ROTATION_ROLLOUT === "" || !Number.isFinite(raw) ? 100 : Math.min(100, Math.max(0, raw));
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  const hash = createHash("sha256").update(`variant-rotation-v1:${userId}`).digest();
  return hash.readUInt32BE(0) % 100 < percent;
}

export interface VariantCandidate {
  questionId: string;
  /** Wann diese Frage dem Nutzer zuletzt gezeigt wurde; null = noch nie. */
  lastShownAt: Date | null;
}

/**
 * Wählt die Variante, die am längsten nicht gezeigt wurde. Bevorzugt Kandidaten mit mindestens `MIN_VARIANT_GAP_DAYS` Abstand
 * (oder noch nie gezeigt); gibt es keine, gewinnt die älteste. Bei Gleichstand gilt die Reihenfolge der Kandidaten (Original zuerst).
 * Weniger als `MIN_VARIANTS_FOR_ROTATION` Kandidaten: null (keine Rotation).
 */
export function pickVariant(candidates: VariantCandidate[], now: Date): string | null {
  if (candidates.length < MIN_VARIANTS_FOR_ROTATION) return null;
  const time = (c: VariantCandidate) => (c.lastShownAt ? c.lastShownAt.getTime() : -Infinity);
  const eligible = candidates.filter((c) => c.lastShownAt === null || now.getTime() - c.lastShownAt.getTime() >= MIN_VARIANT_GAP_DAYS * DAY_MS);
  const pool = eligible.length > 0 ? eligible : candidates;
  return pool.reduce((best, c) => (time(c) < time(best) ? c : best)).questionId;
}

/**
 * Variante je Item für eine neue Session. Rückgabe: Item-ID (Original) → gezeigte Variante (questions.id), nur wenn nicht das Original.
 * Neue Fragen (`isNew`) zeigen immer zuerst das Original; deaktivierte und veraltete Varianten zählen nicht.
 */
export async function chooseSessionVariants(
  userId: string,
  items: Array<{ itemId: string; isNew: boolean }>,
  now: Date = new Date(),
): Promise<Map<string, string>> {
  const chosen = new Map<string, string>();
  const ids = items.filter((i) => !i.isNew).map((i) => i.itemId);
  if (ids.length === 0 || !variantRotationEnabled(userId)) return chosen;
  const db = getDb();
  const [variantRows, lastShown] = await Promise.all([
    db
      .select({ itemId: itemVariants.itemId, questionId: itemVariants.questionId, source: itemVariants.source })
      .from(itemVariants)
      .innerJoin(questions, eq(questions.id, itemVariants.questionId))
      .where(and(inArray(itemVariants.itemId, ids), eq(itemVariants.active, true), eq(questions.stale, false))),
    lastShownByQuestion(userId, ids),
  ]);
  const byItem = new Map<string, typeof variantRows>();
  for (const v of variantRows) byItem.set(v.itemId, [...(byItem.get(v.itemId) ?? []), v]);
  for (const itemId of ids) {
    const rows = (byItem.get(itemId) ?? []).slice().sort((a, b) => Number(b.source === "original") - Number(a.source === "original"));
    const picked = pickVariant(rows.map((v) => ({ questionId: v.questionId, lastShownAt: lastShown.get(`${itemId}:${v.questionId}`) ?? null })), now);
    if (picked && picked !== itemId) chosen.set(itemId, picked);
  }
  return chosen;
}

/** Wann wurde dem Nutzer welche Frage (Original oder Variante) eines Items zuletzt gezeigt? Schlüssel: `<itemId>:<gezeigteFrageId>`. */
export async function lastShownByQuestion(userId: string, itemIds: string[]): Promise<Map<string, Date>> {
  if (itemIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      itemId: reviewLog.itemId,
      shown: sql<string>`coalesce(${reviewLog.variantQuestionId}, ${reviewLog.itemId})`,
      last: sql<Date>`max(${reviewLog.timestampUtc})`,
    })
    .from(reviewLog)
    .where(and(eq(reviewLog.userId, userId), inArray(reviewLog.itemId, itemIds)))
    .groupBy(reviewLog.itemId, sql`coalesce(${reviewLog.variantQuestionId}, ${reviewLog.itemId})`);
  return new Map(rows.map((r) => [`${r.itemId}:${r.shown}`, new Date(r.last)]));
}
