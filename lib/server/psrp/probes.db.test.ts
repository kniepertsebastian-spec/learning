/** Phase 7 gegen echte DB: Tagging, Abfrage-Erfassung, Kalibrierungsspeicherung, Ausschluss aus normalen Pools. */
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { concepts, probeResults, probeVariants, questionOptions, questions, reviewLog, userCalibration, users } from "@/lib/server/db/schema";
import { recordReviewOutcomes } from "@/lib/server/review/service";
import { conceptsWithoutProbes, tagCourseConcepts, type ConceptTagger } from "./concepts";
import { loadProbeCandidates } from "./probes";
import { recordRatedReviews } from "./service";
import { seedCourse, seedUser } from "./test-db";

const run = TEST_DB ? describe : describe.skip;

run("Abfragen und Kalibrierung (echte DB)", () => {
  let userId = "";
  let certId = "";
  let questionIds: string[] = [];
  const variantQuestionIds: string[] = [];

  const tagger: ConceptTagger = async (input) => {
    const variant = (text: string) => ({
      concept: "Routing", sourceItem: 1, format: "transfer" as const, isBottleneck: true,
      question: { de: `${text} völlig anderes Szenario`, en: `${text} different scenario entirely` },
      explanation: { de: "e", en: "e" },
      options: [
        { text: { de: "Richtig", en: "Right" }, isCorrect: true },
        ...[1, 2, 3].map((n) => ({ text: { de: `Falsch ${n}`, en: `Wrong ${n}` }, isCorrect: false })),
      ],
    });
    return {
      concepts: [{ name: "Routing", items: input.items.map((_, i) => i + 1) }],
      variants: [variant("Erste Variante mit Servern"), variant("Zweite Variante mit Kabeln")],
    };
  };

  beforeAll(async () => {
    userId = await seedUser();
    ({ certId, questionIds } = await seedCourse(3));
    for (const id of questionIds) {
      await getDb().insert(questionOptions).values({ questionId: id, orderNum: 1, text: { de: "A", en: "A" }, isCorrect: true });
    }
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("Tagging erzeugt Konzepte, Zuordnung und mindestens zwei Varianten als probe_only-Fragen", async () => {
    const counts = await tagCourseConcepts(certId, tagger);
    expect(counts).toMatchObject({ objectives: 1, concepts: 1, variants: 2, failed: 0 });
    expect(await conceptsWithoutProbes(certId)).toEqual([]);
    const own = await getDb()
      .select({ questionId: probeVariants.questionId })
      .from(probeVariants)
      .innerJoin(concepts, eq(concepts.id, probeVariants.conceptId))
      .where(eq(concepts.courseId, certId));
    variantQuestionIds.push(...own.map((v) => v.questionId as string));
    const probeQs = await getDb().select().from(questions).where(inArray(questions.id, variantQuestionIds));
    expect(probeQs.every((q) => q.probeOnly)).toBe(true);
    expect(variantQuestionIds.length).toBe(2);
    // Zweiter Lauf lässt Getaggtes in Ruhe
    expect(await tagCourseConcepts(certId, tagger)).toMatchObject({ objectives: 0, variants: 0 });
  });

  it("Kandidaten erscheinen nur bei passender Abrufwahrscheinlichkeit (0.80-0.90)", async () => {
    const t0 = new Date("2026-04-01T10:00:00Z");
    for (const itemId of questionIds) await recordRatedReviews(userId, [{ itemId, rawRating: 4 }], { now: t0 });
    const early = await loadProbeCandidates(userId, certId, new Date(t0.getTime() + 3 * 86_400_000));
    expect(early.length).toBe(2);
    expect(early.every((c) => c.predictedR !== null && c.predictedR > 0.8)).toBe(true);
    expect(early.every((c) => c.easyCount === 3)).toBe(true);
  });

  it("Antwort auf eine Abfrage: Review des Original-Items als probe, Messwerte und Kalibrierungswert gespeichert", async () => {
    const before = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    await recordReviewOutcomes(userId, [{ questionId: variantQuestionIds[0], isCorrect: false, confidence: "sure" }]);
    const after = await getDb().select().from(reviewLog).where(eq(reviewLog.userId, userId));
    expect(after.length).toBe(before.length + 1);
    const probe = after.find((r) => r.reviewType === "probe")!;
    expect(probe.rawRating).toBe(1);
    expect(probe.probeVariantId).not.toBeNull();
    expect(questionIds).toContain(probe.itemId);

    const [result] = await getDb().select().from(probeResults).where(eq(probeResults.userId, userId));
    expect(result).toMatchObject({ success: false, selfRating: 4 });
    const rows = await getDb().select().from(userCalibration).where(eq(userCalibration.userId, userId));
    expect(rows.map((r) => r.topicArea).sort()).toContain("__all__");
    expect(rows.every((r) => r.nProbes === 1)).toBe(true);
  });

  it("Variantenfragen tauchen nicht als normale Fragen auf (kein eigener Item-Zustand)", async () => {
    const { itemStates } = await import("@/lib/server/db/schema");
    const states = await getDb().select().from(itemStates).where(eq(itemStates.userId, userId));
    expect(states.some((s) => variantQuestionIds.includes(s.itemId))).toBe(false);
    const [c] = await getDb().select().from(concepts).where(eq(concepts.courseId, certId));
    expect(c.name).toBe("Routing");
  });
});
