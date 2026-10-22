/**
 * PSRP-HR Phase 1: Review-Log (append-only) und Basiszeit je Item.
 * Das Log wird nur geschrieben, nie verändert (Trigger in Migration 0067).
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { questions, objectives, domains, reviewLog, type ReviewLogType } from "@/lib/server/db/schema";

export interface LocalTime {
  /** 0-23 */
  hour: number;
  /** ISO-Wochentag, 1 = Montag … 7 = Sonntag */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Lokale Stunde und Wochentag in einer IANA-Zeitzone; ungültige Zone → UTC. */
export function localTimeParts(date: Date, timeZone: string): LocalTime {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(date);
    return {
      hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24,
      weekday: WEEKDAYS[parts.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 1,
    };
  };
  try {
    return read(timeZone);
  } catch {
    return read("UTC");
  }
}

export interface ReviewLogInput {
  userId: string;
  itemId: string;
  sessionId: string;
  timestamp: Date;
  timeZone: string;
  rawRating: 1 | 2 | 3 | 4;
  responseTimeMs?: number | null;
  reviewType?: ReviewLogType;
  probeVariantId?: string | null;
  /** Gezeigte Variante (questions.id), wenn nicht das Original. */
  variantQuestionId?: string | null;
  predictedR?: number | null;
}

/** Zeile für `review_log` aus einem Review; rechnet die lokale Tageszeit aus. */
export function buildReviewLogRow(input: ReviewLogInput): typeof reviewLog.$inferInsert {
  const local = localTimeParts(input.timestamp, input.timeZone);
  return {
    userId: input.userId,
    itemId: input.itemId,
    sessionId: input.sessionId,
    timestampUtc: input.timestamp,
    localHour: local.hour,
    weekday: local.weekday,
    rawRating: input.rawRating,
    responseTimeMs: input.responseTimeMs ?? null,
    reviewType: input.reviewType ?? "card",
    probeVariantId: input.probeVariantId ?? null,
    variantQuestionId: input.variantQuestionId ?? null,
    predictedR: input.predictedR ?? null,
  };
}

/**
 * Basiszeit je Item: Median der Antwortzeiten aller Nutzer; ohne Daten für das Item der
 * Durchschnitt der Antwortzeiten im Kurs; sonst null (der Aufrufer nimmt dann seinen Rückfall).
 */
export async function getItemBaseTimeMs(itemId: string): Promise<number | null> {
  const db = getDb();
  const [own] = await db
    .select({ median: sql<number | null>`percentile_cont(0.5) within group (order by ${reviewLog.responseTimeMs})` })
    .from(reviewLog)
    .where(and(eq(reviewLog.itemId, itemId), sql`${reviewLog.responseTimeMs} is not null`));
  if (own?.median != null) return Number(own.median);

  const [course] = await db
    .select({ avg: sql<number | null>`avg(${reviewLog.responseTimeMs})` })
    .from(reviewLog)
    .innerJoin(questions, eq(questions.id, reviewLog.itemId))
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(
      sql`${domains.certificationId} = (
        select d.certification_id from ${questions} q
        join ${objectives} o on o.id = q.objective_id
        join ${domains} d on d.id = o.domain_id
        where q.id = ${itemId}
      ) and ${reviewLog.responseTimeMs} is not null`,
    );
  return course?.avg != null ? Number(course.avg) : null;
}
