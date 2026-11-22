/** Kostenbuch: echte DB (nur mit TEST_DATABASE_URL). Summen, Kosten je Kurs, gelöschter Kurs, Budget. */
import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getAiBudgetStatus } from "@/lib/server/admin/ai-cost";
import { getAiCostReport, recordAiUsage, withAiCost, type AiCostCourseRow } from "@/lib/server/admin/ai-ledger";
import { getDb } from "@/lib/server/db/client";
import { useAiLedgerLock } from "@/test-support/ai-ledger-lock";
import { aiCostEntries, certifications, courseGenerationJobs } from "@/lib/server/db/schema";
import { seedCourse } from "@/lib/server/psrp/test-db";

const run = TEST_DB ? describe : describe.skip;

// gemini-3.8-flash: 0,75 USD je Million Eingabe-Token, 3,75 je Million Ausgabe-Token (eingebauter Preis).
const MODEL = "gemini-3.8-flash";
const INPUT_1M = { model: MODEL, promptTokens: 1_000_000, completionTokens: 0 }; // 0,75 USD
const OUTPUT_1M = { model: MODEL, promptTokens: 0, completionTokens: 1_000_000 }; // 3,75 USD

const certIds: string[] = [];
const jobIds: string[] = [];
const loneTokens: number[] = []; // Aufrufe ohne Kurs und Kontext, an ihren Token-Zahlen wiederzufinden

async function course() {
  const seeded = await seedCourse(1);
  certIds.push(seeded.certId);
  return seeded.certId;
}

async function job(resultCertificationId: string | null) {
  const [row] = await getDb()
    .insert(courseGenerationJobs)
    .values({
      courseTitle: `Auftrag ${randomUUID().slice(0, 8)}`,
      courseDescription: "d",
      language: "de",
      provider: "T",
      initialCostLimitUsd: "10",
      absoluteCostLimitUsd: "20",
      blueprintProvider: "x",
      resultCertificationId,
    })
    .returning({ id: courseGenerationJobs.id, title: courseGenerationJobs.courseTitle });
  jobIds.push(row.id);
  return row;
}

async function rowFor(certId: string): Promise<AiCostCourseRow | undefined> {
  return (await getAiCostReport()).courses.find((c) => c.certificationId === certId);
}
const noCourse = async () => (await getAiCostReport()).courses.find((c) => c.certificationId === null);

run("Kostenbuch (echte DB)", () => {
  // Kostenbuch nur von einer Datei zugleich (test-support/ai-ledger-lock.ts).
  useAiLedgerLock(TEST_DB);

  beforeAll(() => {
    delete process.env.GEMINI_BUDGET_USD;
  });

  afterEach(() => {
    delete process.env.GEMINI_BUDGET_USD;
  });

  afterAll(async () => {
    const db = getDb();
    if (certIds.length || jobIds.length) {
      const conditions = [certIds.length ? inArray(aiCostEntries.certificationId, certIds) : undefined, jobIds.length ? inArray(aiCostEntries.generationJobId, jobIds) : undefined].filter((c) => c !== undefined);
      await db.delete(aiCostEntries).where(or(...conditions));
    }
    if (loneTokens.length) await db.delete(aiCostEntries).where(inArray(aiCostEntries.promptTokens, loneTokens));
    if (jobIds.length) await db.delete(courseGenerationJobs).where(inArray(courseGenerationJobs.id, jobIds));
    if (certIds.length) await db.delete(certifications).where(inArray(certifications.id, certIds));
  });

  it("verbucht einen Aufruf mit Kurs und Quelle, die Kosten je Kurs steigen um genau diesen Betrag", async () => {
    const certId = await course();
    expect(await rowFor(certId)).toBeUndefined();

    await withAiCost({ source: "translation", certificationId: certId }, async () => {
      await recordAiUsage(INPUT_1M);
      await recordAiUsage(OUTPUT_1M);
    });

    const row = await rowFor(certId);
    expect(row?.costUsd).toBeCloseTo(4.5, 6);
    expect(row?.calls).toBe(2);
    expect(row?.slug).toMatch(/^psrp-/);
    expect(row?.kind).toBe("general");
  });

  it("die Gesamtsumme ist die Summe der Kurszeilen, und diese ist die Summe aus allen Quellen", async () => {
    const certId = await course();
    await withAiCost({ source: "workshop", certificationId: certId }, () => recordAiUsage(OUTPUT_1M));
    await withAiCost({ source: "batch", detail: "stale", certificationId: certId }, () => recordAiUsage(INPUT_1M));

    const report = await getAiCostReport();
    expect(report.totalUsd).toBeCloseTo(report.courses.reduce((sum, c) => sum + c.costUsd, 0), 6);
    expect(report.totalUsd).toBeCloseTo(report.bySource.reduce((sum, s) => sum + s.costUsd, 0), 6);
    const mine = report.courses.find((c) => c.certificationId === certId);
    expect(mine?.costUsd).toBeCloseTo(4.5, 6);
    // teuerste zuerst
    const costs = report.courses.map((c) => c.costUsd);
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
  });

  it("Kursgenerierung: der Kurs ergibt sich aus dem Auftrag, auch wenn es ihn beim Aufruf noch nicht gab", async () => {
    const certId = await course();
    const generation = await job(null); // noch nicht veröffentlicht
    await withAiCost({ source: "course_generation", generationJobId: generation.id }, () => recordAiUsage(OUTPUT_1M));

    const before = (await noCourse())?.costUsd ?? 0;
    expect(await rowFor(certId)).toBeUndefined(); // bisher gehört der Aufruf zu keinem Kurs ("Ohne Kurs")
    expect((await noCourse())?.costUsd).toBeGreaterThanOrEqual(3.75);

    await getDb().update(courseGenerationJobs).set({ resultCertificationId: certId }).where(eq(courseGenerationJobs.id, generation.id));

    expect((await rowFor(certId))?.costUsd).toBeCloseTo(3.75, 6);
    expect((await noCourse())?.costUsd ?? 0).toBeCloseTo(before - 3.75, 6);
  });

  it("ein gelöschter Kurs nimmt seine Kosten nicht mit: die Gesamtsumme bleibt, die Kosten wandern nach „Ohne Kurs“", async () => {
    const certId = await course();
    await withAiCost({ source: "translation", certificationId: certId }, () => recordAiUsage(OUTPUT_1M));
    const before = await getAiCostReport();
    const noCourseBefore = before.courses.find((c) => c.certificationId === null)?.costUsd ?? 0;

    await getDb().delete(certifications).where(eq(certifications.id, certId));
    certIds.splice(certIds.indexOf(certId), 1);

    const after = await getAiCostReport();
    expect(after.totalUsd).toBeCloseTo(before.totalUsd, 6);
    expect(after.courses.find((c) => c.certificationId === certId)).toBeUndefined();
    expect(after.courses.find((c) => c.certificationId === null)?.costUsd).toBeCloseTo(noCourseBefore + 3.75, 6);
    // die Zeile bleibt im Buch (Kurs NULL), damit nichts verloren geht
    expect(await getDb().select({ id: aiCostEntries.id }).from(aiCostEntries).where(eq(aiCostEntries.model, MODEL)).limit(1)).toHaveLength(1);
  });

  it("Aufteilung nach Schritt: Aufrufe, Token und Kosten je Quelle und Schritt, Summe wie die Gesamtkosten", async () => {
    const certId = await course();
    const step = (report: Awaited<ReturnType<typeof getAiCostReport>>, source: string, detail: string | null) =>
      report.bySteps.find((s) => s.source === source && s.detail === detail);
    const before = await getAiCostReport();

    await withAiCost({ source: "translation", detail: "schritt-test-a", certificationId: certId }, async () => {
      await recordAiUsage(INPUT_1M);
      await recordAiUsage(OUTPUT_1M);
    });
    await withAiCost({ source: "translation", detail: "schritt-test-b", certificationId: certId }, () => recordAiUsage(OUTPUT_1M));
    await withAiCost({ source: "translation", detail: "schritt-test-b", certificationId: certId }, () => recordAiUsage(OUTPUT_1M, { byok: true }));

    const after = await getAiCostReport();
    const a = step(after, "translation", "schritt-test-a");
    const b = step(after, "translation", "schritt-test-b");
    expect(a?.calls).toBe(2);
    expect(a?.costUsd).toBeCloseTo(0.75 + 3.75, 6);
    expect(a?.promptTokens).toBe(INPUT_1M.promptTokens + OUTPUT_1M.promptTokens);
    expect(a?.completionTokens).toBe(INPUT_1M.completionTokens + OUTPUT_1M.completionTokens);
    // BYOK steht nicht in der Aufteilung, genau wie nicht in der Summe
    expect(b?.calls).toBe(1);
    expect(b?.costUsd).toBeCloseTo(3.75, 6);
    // teuerste zuerst, und die Summe über alle Schritte ist die Gesamtsumme
    const costs = after.bySteps.map((s) => s.costUsd);
    expect(costs).toEqual([...costs].sort((x, y) => y - x));
    expect(after.bySteps.reduce((sum, s) => sum + s.costUsd, 0)).toBeCloseTo(after.totalUsd, 6);
    expect(after.totalUsd - before.totalUsd).toBeCloseTo(0.75 + 3.75 + 3.75, 6);
  });

  it("Aufrufe ohne Kontext stehen als „Ohne Kurs“ und „other“ im Buch", async () => {
    // Vielfaches von 4: dann ist tokens × 0,75 / 1 Mio. auf 6 Stellen genau und die Kosten-Rundung des Kostenbuchs fällt nicht ins Gewicht.
    const tokens = 10_000_000 + Math.floor(Math.random() * 250_000) * 4;
    loneTokens.push(tokens);
    const before = await getAiCostReport();
    await recordAiUsage({ model: MODEL, promptTokens: tokens, completionTokens: 0 });
    const after = await getAiCostReport();

    const expected = (tokens / 1_000_000) * 0.75;
    expect(after.totalUsd - before.totalUsd).toBeCloseTo(expected, 6);
    const other = (r: typeof after) => r.bySource.find((s) => s.source === "other")?.costUsd ?? 0;
    expect(other(after) - other(before)).toBeCloseTo(expected, 6);
  });

  it("Aufrufe mit dem eigenen Schlüssel einer Firma stehen nicht in der Summe, werden aber ausgewiesen", async () => {
    const certId = await course();
    const before = await getAiCostReport();
    await withAiCost({ source: "batch", detail: "stale", certificationId: certId }, () => recordAiUsage(OUTPUT_1M, { byok: true }));
    const after = await getAiCostReport();

    expect(after.totalUsd).toBeCloseTo(before.totalUsd, 6);
    expect(after.byokUsd - before.byokUsd).toBeCloseTo(3.75, 6);
    expect(await rowFor(certId)).toBeUndefined();
  });

  it("Modelle ohne Preis zählen als 0 und werden gezählt statt verschwiegen", async () => {
    const certId = await course();
    const before = await getAiCostReport();
    await withAiCost({ source: "workshop", certificationId: certId }, () => recordAiUsage({ model: "kein-preis-modell", promptTokens: 500, completionTokens: 500 }));
    const after = await getAiCostReport();

    expect(after.unpricedCalls).toBe(before.unpricedCalls + 1);
    expect(after.totalUsd).toBeCloseTo(before.totalUsd, 6);
    expect((await rowFor(certId))?.costUsd ?? 0).toBe(0);
  });

  it("historische Zeilen zählen zur Summe und sind getrennt ausgewiesen, ohne als Aufrufe gezählt zu werden", async () => {
    const certId = await course();
    const before = await getAiCostReport();
    await getDb().insert(aiCostEntries).values({ source: "workshop", certificationId: certId, costUsd: "2.000000", historic: true });
    const after = await getAiCostReport();

    expect(after.totalUsd - before.totalUsd).toBeCloseTo(2, 6);
    expect(after.historicUsd - before.historicUsd).toBeCloseTo(2, 6);
    const mine = await rowFor(certId);
    expect(mine?.costUsd).toBeCloseTo(2, 6);
    expect(mine?.calls).toBe(0);
  });

  it("das Budget summiert das ganze Buch ohne BYOK; ohne GEMINI_BUDGET_USD gibt es kein Budget", async () => {
    expect(await getAiBudgetStatus()).toBeNull();

    const certId = await course();
    process.env.GEMINI_BUDGET_USD = "1000000";
    const before = await getAiBudgetStatus();
    await withAiCost({ source: "batch", detail: "stale", certificationId: certId }, async () => {
      await recordAiUsage(OUTPUT_1M);
      await recordAiUsage(OUTPUT_1M, { byok: true }); // zählt nicht
    });
    const after = await getAiBudgetStatus();

    expect(before?.exceeded).toBe(false);
    expect(after!.spentUsd - before!.spentUsd).toBeCloseTo(3.75, 6);

    process.env.GEMINI_BUDGET_USD = String(after!.spentUsd); // genau erreicht: ausgeschöpft
    expect((await getAiBudgetStatus())?.exceeded).toBe(true);
    process.env.GEMINI_BUDGET_USD = String(after!.spentUsd + 1);
    expect((await getAiBudgetStatus())?.exceeded).toBe(false);
  });
});
