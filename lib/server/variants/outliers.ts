/**
 * Varianten mit auffällig anderer Erfolgsquote als die übrigen Varianten desselben Items (Roadmap Didaktik Phase 1) landen
 * automatisch in der Prüfliste der Werkstatt (`ContentReportQueue`, Grund `variant_outlier`).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { contentReports, reviewLog } from "@/lib/server/db/schema";

export const OUTLIER_MIN_ANSWERS = 30;
/** Abweichung in Prozentpunkten (als Anteil), ab der eine Variante auffällt. */
export const OUTLIER_MAX_DEVIATION = 0.25;

export interface ShownStats {
  /** Gezeigte Frage (Original oder Variante). */
  questionId: string;
  answers: number;
  /** Antworten mit Rating > 1 (nicht „Again“). */
  correct: number;
}

/**
 * Fragen eines Items, deren Erfolgsquote um mehr als `OUTLIER_MAX_DEVIATION` von der gepoolten Quote der übrigen abweicht.
 * Beide Seiten brauchen mindestens `OUTLIER_MIN_ANSWERS` Antworten, sonst fehlt die Vergleichsgrundlage.
 */
export function findOutliers(stats: ShownStats[]): string[] {
  const flagged: Array<{ questionId: string; deviation: number }> = [];
  for (const s of stats) {
    if (s.answers < OUTLIER_MIN_ANSWERS) continue;
    const others = stats.filter((o) => o.questionId !== s.questionId);
    const otherAnswers = others.reduce((n, o) => n + o.answers, 0);
    if (otherAnswers < OUTLIER_MIN_ANSWERS) continue;
    const otherRate = others.reduce((n, o) => n + o.correct, 0) / otherAnswers;
    const deviation = Math.abs(s.correct / s.answers - otherRate);
    if (deviation > OUTLIER_MAX_DEVIATION) flagged.push({ questionId: s.questionId, deviation });
  }
  // Mit drei oder mehr Fragen zieht ein Ausreißer die Quote der übrigen mit: nur die größte Abweichung melden.
  // Bei zwei Fragen ist nicht zu erkennen, welche auffällt - beide melden.
  if (stats.length >= 3 && flagged.length > 1) return [flagged.reduce((a, b) => (b.deviation > a.deviation ? b : a)).questionId];
  return flagged.map((f) => f.questionId);
}

/** Prüft die Items (Original-IDs) und legt Meldungen für auffällige Fragen an, sofern noch keine offene existiert. Gibt die Anzahl neuer Meldungen zurück. */
export async function flagOutlierVariants(itemIds: string[]): Promise<number> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return 0;
  const db = getDb();
  const rows = await db
    .select({
      itemId: reviewLog.itemId,
      shown: sql<string>`coalesce(${reviewLog.variantQuestionId}, ${reviewLog.itemId})`,
      answers: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${reviewLog.rawRating} > 1)::int`,
    })
    .from(reviewLog)
    .where(and(inArray(reviewLog.itemId, ids)))
    .groupBy(reviewLog.itemId, sql`coalesce(${reviewLog.variantQuestionId}, ${reviewLog.itemId})`);
  const byItem = new Map<string, ShownStats[]>();
  for (const r of rows) byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), { questionId: r.shown, answers: Number(r.answers), correct: Number(r.correct) }]);
  const flagged = [...byItem.values()].flatMap(findOutliers);
  if (flagged.length === 0) return 0;
  const open = await db
    .select({ targetId: contentReports.targetId })
    .from(contentReports)
    .where(and(inArray(contentReports.targetId, flagged), eq(contentReports.targetType, "question"), eq(contentReports.reason, "variant_outlier"), eq(contentReports.status, "open")));
  const alreadyOpen = new Set(open.map((r) => r.targetId));
  const fresh = flagged.filter((id) => !alreadyOpen.has(id));
  if (fresh.length === 0) return 0;
  await db.insert(contentReports).values(fresh.map((targetId) => ({ reporterUserId: null, targetType: "question" as const, targetId, reason: "variant_outlier" as const })));
  return fresh.length;
}
