/** Aufgabe 03b (Review 12.11.2026): Simulation in einer Transaktion. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { lessons, reviewItems, sections, simulationResults } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { recordSimulationSolved } from "./service";

const run = TEST_DB ? describe : describe.skip;
const t = (v: string) => ({ de: v, en: v });
const SIM = '```simulation\n{"type":"terminal","title":"T","scenario":"S","steps":[{"goal":"g","accept":["a"],"output":"","hint":"h"}],"success":"ok"}\n```';

async function setup() {
  const db = getDb();
  const course = await seedCourse(1);
  const [section] = await db.insert(sections).values({ objectiveId: course.objectiveId, orderNum: 1, title: t("S") }).returning();
  await db.insert(lessons).values({ sectionId: section.id, content: t(`## Einleitung\n\n${SIM}`) });
  const userId = await seedUser();
  const dueAt = new Date(Date.now() + 10 * 86400_000);
  await db.insert(reviewItems).values({ userId, questionId: course.questionIds[0], dueAt });
  return { userId, sectionId: section.id, questionId: course.questionIds[0], dueAt };
}

const resultsOf = async (userId: string) => getDb().select().from(simulationResults).where(eq(simulationResults.userId, userId));

run("Simulation atomar (echte DB)", () => {
  it("Fehler nach dem Verbuchen hinterlässt nichts, erneutes Senden zählt die Lösung genau einmal", async () => {
    const { userId, sectionId, questionId, dueAt } = await setup();
    const db = getDb();
    const fn = `fail_sim_${userId.replaceAll("-", "")}`;
    // Mühsam gelöst (3 Hilfen) zieht die Wiederholung vor. Das ist der letzte Schritt, also nach dem Festhalten der Lösung.
    await db.execute(sql.raw(`create function ${fn}() returns trigger language plpgsql as $$ begin if new.user_id = '${userId}' then raise exception 'Abbruch (Test)'; end if; return new; end $$`));
    await db.execute(sql.raw(`create trigger ${fn} before update on review_items for each row execute function ${fn}()`));
    try {
      await expect(recordSimulationSolved(userId, sectionId, 0, 3)).rejects.toThrow();
    } finally {
      await db.execute(sql.raw(`drop trigger ${fn} on review_items`));
      await db.execute(sql.raw(`drop function ${fn}()`));
    }
    expect(await resultsOf(userId)).toHaveLength(0);
    const [untouched] = await db.select().from(reviewItems).where(and(eq(reviewItems.userId, userId), eq(reviewItems.questionId, questionId)));
    expect(untouched.dueAt.getTime()).toBe(dueAt.getTime());

    const result = await recordSimulationSolved(userId, sectionId, 0, 3);
    expect(result).toMatchObject({ struggled: true, pulledForward: 1 });
    const rows = await resultsOf(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ solves: 1, bestHelps: 3 });
  });
});
