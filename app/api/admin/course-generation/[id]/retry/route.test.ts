/** Neustart eines gestoppten Auftrags (echte DB): sofort „in der Warteschlange“, damit die Oberfläche weiter aktualisiert. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const started = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/server/auth-guards", () => ({ requireAdminApi: async () => ({ ok: true, user: { id: "op" } }) }));
vi.mock("@/lib/server/course-generation/runner", () => ({
  isCourseGenerationJobActive: () => false,
  startCourseGenerationJob: (id: string) => void started.push(id),
  startCourseGenerationPublish: () => {},
}));

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseGenerationJobs, users } from "@/lib/server/db/schema";
import { createCourseGenerationJob, updateCourseGenerationJob } from "@/lib/server/course-generation/job-service";
import { POST } from "./route";

const run = TEST_DB ? describe : describe.skip;

run("Neustart über die Admin-Route", () => {
  const tag = randomUUID().slice(0, 8);
  let userId = "";
  let jobId = "";
  beforeAll(async () => {
    userId = (await getDb().insert(users).values({ email: `rt-${tag}@test.example`, passwordHash: "x", name: "rt" }).returning({ id: users.id }))[0].id;
    const job = await createCourseGenerationJob({
      requestedByUserId: userId, courseTitle: `Retry ${tag}`, courseDescription: "x", language: "de", provider: "T", sourceUrls: ["https://a.example/x"],
      autoPublish: false, initialCostLimitUsd: 1, absoluteCostLimitUsd: 2, blueprintProvider: "anthropic-sonnet",
    });
    jobId = job.id;
    await updateCourseGenerationJob(jobId, { status: "circuit_breaker_open", phase: "content", errorCode: "circuit_breaker_open", errorMessage: "Fehlerquote", completedAt: new Date() });
  });
  afterAll(async () => {
    await getDb().delete(courseGenerationJobs).where(eq(courseGenerationJobs.id, jobId));
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("setzt den Auftrag sofort auf „queued“, löscht den Fehler und startet den Lauf", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: jobId }) });
    expect(res.status).toBe(202);
    const { job } = await res.json();
    expect(job.status).toBe("queued");
    expect(job.errorMessage).toBeNull();
    expect(job.completedAt).toBeNull();
    expect(started).toEqual([jobId]);
  });
});
