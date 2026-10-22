import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/server/db/client";
import { itemVariants, questions } from "@/lib/server/db/schema";
import { seedCourse } from "./test-db";

describe.skipIf(!process.env.TEST_DATABASE_URL)("item_variant (DB)", () => {
  it("legt für jede neue Frage die Original-Variante an", async () => {
    const { questionIds } = await seedCourse(2);
    const rows = await getDb().select().from(itemVariants).where(eq(itemVariants.itemId, questionIds[0]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ questionId: questionIds[0], source: "original", active: true });
  });

  it("legt für Nur-Abfrage-Fragen keine Original-Variante an", async () => {
    const { objectiveId } = await seedCourse(1);
    const [q] = await getDb()
      .insert(questions)
      .values({ humanId: `P-${Math.random()}`, objectiveId, difficulty: "easy", type: "single", question: { de: "F", en: "Q" } as never, explanation: { de: "E", en: "E" } as never, probeOnly: true })
      .returning();
    expect(await getDb().select().from(itemVariants).where(eq(itemVariants.itemId, q.id))).toHaveLength(0);
  });

  it("löscht Varianten mit der Frage (CASCADE)", async () => {
    const { questionIds } = await seedCourse(1);
    await getDb().delete(questions).where(eq(questions.id, questionIds[0]));
    expect(await getDb().select().from(itemVariants).where(eq(itemVariants.itemId, questionIds[0]))).toHaveLength(0);
  });
});
