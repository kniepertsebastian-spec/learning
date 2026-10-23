import { sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import type { FirstTryStats } from "@/lib/feedback/platform-stat";

/** Erste Antwort je Lernendem auf ein Item (Original und Varianten zusammen): wie viele haben es nicht gleich gelöst (Rating 1)? */
export async function firstTryStats(itemId: string): Promise<FirstTryStats> {
  const result = await getDb().execute(sql`
    select count(*)::int as answers, count(*) filter (where first_rating = 1)::int as not_solved
    from (
      select distinct on (user_id) raw_rating as first_rating
      from review_log
      where item_id = ${itemId}
      order by user_id, timestamp_utc asc
    ) firsts
  `);
  const row = (result as unknown as Array<{ answers?: number; not_solved?: number }>)[0];
  return { answers: Number(row?.answers ?? 0), notSolved: Number(row?.not_solved ?? 0) };
}
