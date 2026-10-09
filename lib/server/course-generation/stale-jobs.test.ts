/**
 * Hängende Aufträge: automatische Fortsetzung nach einem Neustart, Ende nach zu vielen Unterbrechungen, ein Abbruch
 * bleibt ein Abbruch. Echte DB (nur mit TEST_DATABASE_URL).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseGenerationJobs, courseGenerationObjectives, users } from "@/lib/server/db/schema";
import {
  createCourseGenerationJob,
  getCourseGenerationJob,
  MAX_AUTO_RESUMES,
  recoverStaleCourseGenerationJobs,
  STALE_AFTER_MS,
  updateCourseGenerationJob,
} from "./job-service";

const run = TEST_DB ? describe : describe.skip;

run("hängende Kursgenerierungen (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  let userId = "";
  const ids: string[] = [];
  const old = () => new Date(Date.now() - STALE_AFTER_MS - 60_000);

  async function job(status: string, extra: Partial<typeof courseGenerationJobs.$inferInsert> = {}) {
    const created = await createCourseGenerationJob({
      requestedByUserId: userId, courseTitle: `Stale ${tag} ${randomUUID().slice(0, 6)}`, courseDescription: "x", language: "de", provider: "T",
      sourceUrls: ["https://a.example/x"], autoPublish: false, initialCostLimitUsd: 1, absoluteCostLimitUsd: 2, blueprintProvider: "anthropic-sonnet",
    });
    ids.push(created.id);
    await getDb().update(courseGenerationJobs).set({ status: status as never, updatedAt: old(), ...extra }).where(eq(courseGenerationJobs.id, created.id));
    return created.id;
  }

  beforeAll(async () => {
    userId = (await getDb().insert(users).values({ email: `stale-${tag}@test.example`, passwordHash: "x", name: "st" }).returning({ id: users.id }))[0].id;
  });
  afterAll(async () => {
    for (const id of ids) await getDb().delete(courseGenerationJobs).where(eq(courseGenerationJobs.id, id));
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("ein verwaister Auftrag wird fortgesetzt, ein aktiver und einer mit frischem Lebenszeichen nicht", async () => {
    const orphan = await job("batch_generating");
    const active = await job("batch_generating");
    const fresh = await job("batch_generating");
    await getDb().insert(courseGenerationObjectives).values({ jobId: fresh, domainId: "d", objectiveId: "o", code: "1.1", isCanary: false, status: "generating" });

    const started: string[] = [];
    const handled = await recoverStaleCourseGenerationJobs((id) => id === active, (id) => started.push(id));

    expect(started).toContain(orphan);
    expect(started).not.toContain(active);
    expect(started).not.toContain(fresh);
    expect(handled).toContainEqual({ jobId: orphan, action: "resumed" });
    const resumed = (await getCourseGenerationJob(orphan))!;
    expect(resumed.status).toBe("queued");
    expect(resumed.errorCode).toBe("auto_resume:1");

    // Ein zweiter Durchlauf direkt danach übernimmt ihn nicht noch einmal (frisches Lebenszeichen).
    const again: string[] = [];
    await recoverStaleCourseGenerationJobs(() => false, (id) => again.push(id));
    expect(again).not.toContain(orphan);
  });

  it("nach MAX_AUTO_RESUMES Fortsetzungen endet der Auftrag als unterbrochen (erneut startbar)", async () => {
    const tired = await job("content_generating", { errorCode: `auto_resume:${MAX_AUTO_RESUMES}` });
    const started: string[] = [];
    const handled = await recoverStaleCourseGenerationJobs(() => false, (id) => started.push(id));
    expect(started).not.toContain(tired);
    expect(handled).toContainEqual({ jobId: tired, action: "interrupted" });
    const ended = (await getCourseGenerationJob(tired))!;
    expect(ended.status).toBe("failed");
    expect(ended.errorCode).toBe("interrupted");
  });

  it("ein abgebrochener Auftrag wird vom Worker nicht mehr auf einen anderen Status gesetzt", async () => {
    const id = await job("batch_generating");
    await updateCourseGenerationJob(id, { status: "cancelled" });
    await updateCourseGenerationJob(id, { status: "importing", message: "Kurs wird importiert …" });
    expect((await getCourseGenerationJob(id))!.status).toBe("cancelled");
    await updateCourseGenerationJob(id, { message: "Auftrag wurde abgebrochen.", completedAt: new Date() });
    const final = (await getCourseGenerationJob(id))!;
    expect(final.status).toBe("cancelled");
    expect(final.message).toBe("Auftrag wurde abgebrochen.");
  });
});
