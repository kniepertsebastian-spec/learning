import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
import { getDb } from "@/lib/server/db/client";
import { concepts, itemVariants, probeVariants, questionOptions, questions } from "@/lib/server/db/schema";
import { seedCourse } from "@/lib/server/psrp/test-db";
import { adoptProbeVariants, backfillVariants, type GeneratedVariant, type VariantGenerator } from "@/lib/server/variants/generate";

const make = (q: string): GeneratedVariant => ({
  question: { de: q, en: q },
  options: [true, false, false, false].map((isCorrect, i) => ({ text: { de: `Option ${i}`, en: `Option ${i}` }, isCorrect })),
  explanation: { de: "E", en: "E" },
});

describe.skipIf(!TEST_DB)("backfillVariants (DB)", () => {
  it("erzeugt zwei Varianten als probe_only-Fragen, am Original hängend, und ist wiederholbar", async () => {
    const { certId, questionIds } = await seedCourse(1);
    let calls = 0;
    const generate: VariantGenerator = async (_s, count) => {
      calls++;
      const pool = ["Ein Techniker prüft im Serverraum, warum der Drucker keine Adresse erhält", "Eine Kollegin meldet, dass beim Aufruf der Intranetseite nur ein Fehlercode erscheint"];
      return pool.slice(0, count).map(make);
    };
    const first = await backfillVariants(certId, generate);
    expect(first).toMatchObject({ items: 1, variants: 2, failed: 0 });

    const rows = await getDb().select().from(itemVariants).where(eq(itemVariants.itemId, questionIds[0]));
    expect(rows.map((r) => r.source).sort()).toEqual(["generated", "generated", "original"]);
    const generated = await getDb().select().from(questions).where(eq(questions.id, rows.find((r) => r.source === "generated")!.questionId));
    expect(generated[0].probeOnly).toBe(true);
    const opts = await getDb().select().from(questionOptions).where(eq(questionOptions.questionId, generated[0].id));
    expect(opts.filter((o) => o.isCorrect)).toHaveLength(1);

    const second = await backfillVariants(certId, generate);
    expect(second.variants).toBe(0);
    expect(calls).toBe(1);
  });

  it("übernimmt Abfragevarianten mit is_bottleneck und erzeugt nur die fehlende Variante", async () => {
    const { certId, questionIds, objectiveId } = await seedCourse(1);
    const db = getDb();
    const [concept] = await db.insert(concepts).values({ courseId: certId, topicArea: "T", name: `K-${questionIds[0]}` }).returning();
    const [probe] = await db.insert(questions).values({ humanId: `P-${questionIds[0]}`, objectiveId, difficulty: "easy", type: "single", question: { de: "Abfrage", en: "Probe" } as never, explanation: { de: "E", en: "E" } as never, probeOnly: true }).returning();
    await db.insert(probeVariants).values({ conceptId: concept.id, questionId: probe.id, sourceItemId: questionIds[0], format: "transfer", content: { de: "Abfrage", en: "Probe" }, isBottleneck: true });
    expect(await adoptProbeVariants(certId)).toBe(1);

    const counts: number[] = [];
    const generate: VariantGenerator = async (_s, count) => {
      counts.push(count);
      return ["Ganz anderes Szenario mit Firewall und Routing im Rechenzentrum"].slice(0, count).map(make);
    };
    const result = await backfillVariants(certId, generate);
    expect(counts).toEqual([1]);
    expect(result.variants).toBe(1);
    const sources = (await db.select().from(itemVariants).where(and(eq(itemVariants.itemId, questionIds[0])))).map((r) => r.source).sort();
    expect(sources).toEqual(["generated", "original", "probe"]);
  });

  it("verwirft ungültige Varianten und zählt sie", async () => {
    const { certId } = await seedCourse(1);
    const bad = make("F");
    bad.options[1].isCorrect = true; // zwei richtige Optionen
    const result = await backfillVariants(certId, async () => [bad, bad]);
    expect(result).toMatchObject({ variants: 0, rejected: 2 });
  });
});
