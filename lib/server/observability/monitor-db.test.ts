/** Bericht für scripts/monitor.sh gegen die echte DB (nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseGenerationJobs } from "@/lib/server/db/schema";
import { getMonitorReport } from "./monitor";

const run = TEST_DB ? describe : describe.skip;

run("getMonitorReport (echte DB)", () => {
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await getDb().delete(courseGenerationJobs).where(inArray(courseGenerationJobs.id, ids));
  });

  async function job(title: string, status: string, updatedAt: Date) {
    const [row] = await getDb()
      .insert(courseGenerationJobs)
      .values({
        courseTitle: title,
        courseDescription: "x",
        language: "de",
        provider: "Test",
        initialCostLimitUsd: "1",
        absoluteCostLimitUsd: "2",
        blueprintProvider: "gemini",
        status: status as never,
        errorCode: status === "failed" ? "internal" : null,
        updatedAt,
      })
      .returning({ id: courseGenerationJobs.id });
    ids.push(row.id);
    return row.id;
  }

  it("meldet gescheiterte Aufträge der letzten 24 Stunden, nicht laufende oder ältere", async () => {
    const tag = randomUUID().slice(0, 6);
    const now = Date.now();
    const failed = await job(`Mon ${tag} gescheitert`, "failed", new Date(now - 60_000));
    const breaker = await job(`Mon ${tag} Fehlerschutz`, "circuit_breaker_open", new Date(now - 3600_000));
    const old = await job(`Mon ${tag} alt`, "failed", new Date(now - 30 * 3600_000));
    const running = await job(`Mon ${tag} läuft`, "batch_generating", new Date(now - 60_000));
    const report = await getMonitorReport(now);
    const seen = report.failedJobs.map((j) => j.id);
    expect(seen).toEqual(expect.arrayContaining([failed, breaker]));
    expect(seen).not.toContain(old);
    expect(seen).not.toContain(running);
    expect(report.failedJobs.find((j) => j.id === failed)).toMatchObject({ status: "failed", errorCode: "internal", title: `Mon ${tag} gescheitert` });
  });

  it("KI-Budget in Prozent, nur mit GEMINI_BUDGET_USD", async () => {
    const prev = process.env.GEMINI_BUDGET_USD;
    try {
      delete process.env.GEMINI_BUDGET_USD;
      expect((await getMonitorReport()).aiBudget).toBeNull();
      process.env.GEMINI_BUDGET_USD = "1000000";
      expect((await getMonitorReport()).aiBudget).toMatchObject({ limitUsd: 1000000, percent: expect.any(Number) });
    } finally {
      if (prev === undefined) delete process.env.GEMINI_BUDGET_USD;
      else process.env.GEMINI_BUDGET_USD = prev;
    }
  });
});
