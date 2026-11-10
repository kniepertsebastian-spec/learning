/** Sehr großer Kurs: der Worker teilt ihn auf (echte DB nur mit TEST_DATABASE_URL, Fake-KI, keine Quelle im Netz). */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseGenerationJobs, users } from "@/lib/server/db/schema";
import { createFakeBlueprintProvider, createFakeContentProvider } from "./fake-providers";
import { createCourseGenerationJob, getCourseGenerationJob, nextSplitPartJob } from "./job-service";
import type { CourseBlueprintV1, ObjectiveContentResponse } from "./schemas";
import { executeCourseGenerationJob } from "./worker";

const run = TEST_DB ? describe : describe.skip;

const content: ObjectiveContentResponse = {
  sections: [
    {
      title: { de: "Lektion", en: "Lesson" },
      estimatedMinutes: 15,
      difficulty: "beginner",
      content: { de: "Ein VLAN trennt Broadcast-Domänen voneinander.", en: "A VLAN separates broadcast domains." },
      keyTakeaways: { de: ["a", "b"], en: ["a", "b"] },
      examFocusPoints: { de: ["a", "b"], en: ["a", "b"] },
    },
  ],
  questions: [],
};

function bigBlueprint(domains: number, perDomain: number): Omit<CourseBlueprintV1, "requestId"> {
  return {
    schemaVersion: "1.0", title: "Riesenkurs", description: "Test", language: "de", provider: "T",
    examQuestionCount: null, examDurationMinutes: null, passingScore: null, scoreScale: null,
    sources: [{ id: "src-1", title: "Leitfaden", url: "https://example.org/guide", retrievedAt: new Date().toISOString() }],
    domains: Array.from({ length: domains }, (_, d) => ({
      id: `dom-${d + 1}`, title: `Domain ${d + 1}`, weight: 1 / domains,
      objectives: Array.from({ length: perDomain }, (_, i) => ({
        id: `obj-${d + 1}-${i + 1}`, code: `${d + 1}.${i + 1}`, title: `Lernziel ${d + 1}.${i + 1}`, description: "x", examWeight: 0.01, complexity: "low" as const,
        requiredConcepts: ["a"], commonMisconceptions: [], lessonPlan: ["l"], sourceLocators: [], recommendedQuestions: 4, requiredScenarios: [],
      })),
    })),
  };
}

run("Aufteilung sehr großer Kurse im Worker (echte DB, Fake-KI)", () => {
  const tag = randomUUID().slice(0, 8);
  let userId = "";
  const jobIds: string[] = [];
  beforeAll(async () => {
    userId = (await getDb().insert(users).values({ email: `split-${tag}@test.example`, passwordHash: "x", name: "s" }).returning({ id: users.id }))[0].id;
  });
  afterAll(async () => {
    if (jobIds.length) await getDb().delete(courseGenerationJobs).where(or(inArray(courseGenerationJobs.id, jobIds), inArray(courseGenerationJobs.splitOfJobId, jobIds)));
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("über 80 Lernziele: Teil 1 wird erzeugt, Teil 2 wartet mit eigenem Blueprint, kein Lernziel fehlt", async () => {
    const job = await createCourseGenerationJob({
      requestedByUserId: userId, courseTitle: `Riesenkurs ${tag}`, courseDescription: "x", language: "de", provider: "T",
      sourceUrls: ["https://example.org/guide"], autoPublish: false, initialCostLimitUsd: 50, absoluteCostLimitUsd: 100, blueprintProvider: "anthropic-sonnet",
      includeSectionQuizzes: false, includeFinalExam: false,
    });
    jobIds.push(job.id);
    const bp = bigBlueprint(3, 30);
    const plan = Object.fromEntries(bp.domains.flatMap((d) => d.objectives.map((o) => [o.id, { result: content }])));
    const cp = createFakeContentProvider("fake", plan);
    await executeCourseGenerationJob(job.id, {
      blueprintProvider: createFakeBlueprintProvider(bp),
      contentProvider: cp,
      repairProvider: cp,
      fetchSourcesFn: async () => ({ sources: [{ id: "src-1", title: "Leitfaden", url: "https://example.org/guide", retrievedAt: new Date().toISOString(), excerpts: [{ locator: "Abschnitt 1", text: "x".repeat(500) }], truncated: false }], skipped: [] }),
    });

    const first = (await getCourseGenerationJob(job.id))!;
    expect(first.errorMessage).toBeNull();
    expect(first.status).toBe("package_ready");
    expect(first.courseTitle).toBe(`Riesenkurs ${tag} (Teil 1 von 2)`);
    expect(first).toMatchObject({ splitPart: 1, splitParts: 2 });
    const firstCodes = (first.blueprintJson as unknown as CourseBlueprintV1).domains.flatMap((d) => d.objectives.map((o) => o.code));

    const nextId = await nextSplitPartJob(job.id);
    expect(nextId).not.toBeNull();
    const second = (await getCourseGenerationJob(nextId!))!;
    expect(second).toMatchObject({ status: "queued", splitOfJobId: job.id, splitPart: 2, splitParts: 2, courseTitle: `Riesenkurs ${tag} (Teil 2 von 2)` });
    const secondCodes = (second.blueprintJson as unknown as CourseBlueprintV1).domains.flatMap((d) => d.objectives.map((o) => o.code));
    expect(firstCodes.length + secondCodes.length).toBe(90);
    expect(new Set([...firstCodes, ...secondCodes]).size).toBe(90);
    expect(firstCodes.length).toBeLessThanOrEqual(80);
  }, 120_000);
});
