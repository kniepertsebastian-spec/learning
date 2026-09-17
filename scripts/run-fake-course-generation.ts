import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications, courseGenerationJobs, courseGenerationObjectives, users } from "../lib/server/db/schema";
import { createCourseGenerationJob, getCourseGenerationJob } from "../lib/server/course-generation/job-service";
import { executeCourseGenerationJob } from "../lib/server/course-generation/worker";
import { createFakeBlueprintProvider, createFakeContentProvider } from "../lib/server/course-generation/fake-providers";
import type { CourseBlueprintV1, ObjectiveContentResponse } from "../lib/server/course-generation/schemas";
import type { FetchedSource } from "../lib/server/course-generation/sources";

/**
 * course_generation.md Phase 2/5/6/7 - echter End-to-End-Lauf des kompletten
 * Job-Orchestrators (Preflight -> Blueprint -> Canary -> Batches -> Import)
 * gegen echtes Postgres, mit Fake-Providern statt echter (kostenpflichtiger)
 * Claude-Aufrufe - siehe course_generation.md Abschnitt 9/0 zur
 * Provider-Austauschbarkeit.
 *
 * Usage: npm run course:e2e -- <scenario> [--keep]
 * Szenarien: happy-path | circuit-breaker | budget-exceeded | canary-failed | package-ready
 * --keep lässt Job/Zertifizierung zur manuellen Inspektion in der DB stehen.
 */

function fakeSources(): FetchedSource[] {
  return [
    {
      id: "src-1",
      title: "Fake Source",
      url: "https://example.org/fake-guide.pdf",
      retrievedAt: new Date().toISOString(),
      excerpts: [
        { locator: "S. 1", text: "Fake source text for objective 1.1 covering concept-a and concept-b in detail." },
        { locator: "S. 2", text: "Fake source text for objective 1.2 covering concept-a applied practice." },
        { locator: "S. 3", text: "Fake source text for objective 1.3 covering concept-c advanced scenario." },
      ],
      truncated: false,
    },
  ];
}

function fakeBlueprint(objectiveCount: number): Omit<CourseBlueprintV1, "requestId"> {
  const objectives = Array.from({ length: objectiveCount }, (_, i) => ({
    id: `obj-1-${i + 1}`,
    code: `1.${i + 1}`,
    title: `Fake Objective ${i + 1}`,
    description: `Description for fake objective ${i + 1}.`,
    examWeight: 1 / objectiveCount,
    complexity: (i === 0 ? "high" : "medium") as "high" | "medium" | "low",
    requiredConcepts: ["concept-a"],
    commonMisconceptions: [],
    lessonPlan: ["Step 1"],
    sourceLocators: ["S. 1"],
    recommendedQuestions: 4,
    requiredScenarios: [],
  }));

  return {
    schemaVersion: "1.0",
    title: "Fake E2E Course",
    description: "A course generated end-to-end with fake providers.",
    language: "en",
    provider: "Fixture Provider",
    examQuestionCount: null,
    examDurationMinutes: null,
    passingScore: null,
    scoreScale: null,
    sources: [{ id: "src-1", title: "Fake Source", url: "https://example.org/fake-guide.pdf", retrievedAt: new Date().toISOString() }],
    domains: [{ id: "dom-1", title: "Fake Domain", weight: 1, objectives }],
  };
}

function goodContent(): ObjectiveContentResponse {
  return {
    sections: [
      {
        title: { de: "Abschnitt", en: "Section" },
        estimatedMinutes: 15,
        difficulty: "beginner",
        content: { de: "Lerninhalt über concept-a.", en: "Lesson content about concept-a." },
        keyTakeaways: { de: ["a", "b"], en: ["a", "b"] },
        examFocusPoints: { de: ["a", "b"], en: ["a", "b"] },
      },
    ],
    questions: Array.from({ length: 4 }, (_, i) => ({
      difficulty: "beginner" as const,
      type: (i === 0 ? "scenario" : "knowledge") as "scenario" | "knowledge",
      question: { de: `Frage ${i + 1} zu concept-a?`, en: `Question ${i + 1} about concept-a?` },
      options: [
        { text: { de: "Richtig", en: "Correct" }, isCorrect: i === 0 },
        { text: { de: "Falsch 1", en: "Wrong 1" }, isCorrect: i !== 0 && i === 1 },
        { text: { de: "Falsch 2", en: "Wrong 2" }, isCorrect: false },
        { text: { de: "Falsch 3", en: "Wrong 3" }, isCorrect: false },
      ].map((opt, idx) => ({ ...opt, isCorrect: idx === i % 4 })),
      explanation: { de: "Erklärung zu concept-a.", en: "Explanation about concept-a." },
      sourceLocator: "S. 1",
    })),
  };
}

async function cleanupJob(jobId: string) {
  const db = getDb();
  const job = await getCourseGenerationJob(jobId);
  if (job?.resultCertificationId) {
    await db.delete(certifications).where(eq(certifications.id, job.resultCertificationId));
  }
  await db.delete(courseGenerationObjectives).where(eq(courseGenerationObjectives.jobId, jobId));
  await db.delete(courseGenerationJobs).where(eq(courseGenerationJobs.id, jobId));
}

async function main() {
  const scenario = process.argv[2] || "happy-path";
  const db = getDb();
  const [adminUser] = await db.select().from(users).limit(1);
  if (!adminUser) {
    console.error("Kein User in der DB gefunden - npm run db:seed zuerst ausführen.");
    process.exit(1);
  }

  const objectiveCount = 4;
  const job = await createCourseGenerationJob({
    requestedByUserId: adminUser.id,
    courseTitle: `Fake E2E Course ${randomUUID().slice(0, 8)}`,
    courseDescription: "E2E test course",
    language: "en",
    provider: "Fixture Provider",
    sourceUrls: ["https://example.org/fake-guide.pdf"],
    autoPublish: scenario !== "package-ready",
    initialCostLimitUsd: 2,
    absoluteCostLimitUsd: scenario === "budget-exceeded" ? 0.0001 : 5,
    blueprintProvider: "anthropic-sonnet",
  });
  console.log(`Job erstellt: ${job.id} (Szenario: ${scenario})`);

  const blueprintProvider = createFakeBlueprintProvider(fakeBlueprint(objectiveCount));

  let contentProvider = createFakeContentProvider("fake-haiku", {
    "obj-1-1": { result: goodContent() },
    "obj-1-2": { result: goodContent() },
    "obj-1-3": { result: goodContent() },
    "obj-1-4": { result: goodContent() },
  });

  if (scenario === "circuit-breaker") {
    // 3 of 4 objectives fail every attempt (canary is obj-1-1, forced good so
    // we actually reach the batch phase) -> batch error rate > 30%.
    contentProvider = createFakeContentProvider("fake-haiku-flaky", {
      "obj-1-1": { result: goodContent() },
      "obj-1-2": { result: goodContent(), failFirstAttempts: 99 },
      "obj-1-3": { result: goodContent(), failFirstAttempts: 99 },
      "obj-1-4": { result: goodContent(), failFirstAttempts: 99 },
    });
  } else if (scenario === "canary-failed") {
    contentProvider = createFakeContentProvider("fake-haiku-canary-fail", {
      "obj-1-1": { result: goodContent(), failFirstAttempts: 99 },
    });
  }

  await executeCourseGenerationJob(job.id, {
    blueprintProvider,
    contentProvider,
    repairProvider: contentProvider,
    fetchSourcesFn: async () => fakeSources(),
  });

  const finalJob = await getCourseGenerationJob(job.id);
  console.log(`Endstatus: ${finalJob?.status} - ${finalJob?.message}`);
  console.log(`Kosten: $${finalJob?.actualCostUsd}, Fehler: ${finalJob?.errorCode ?? "-"} ${finalJob?.errorMessage ?? ""}`);
  if (finalJob?.resultCertificationId) {
    console.log(`Zertifizierung importiert: ${finalJob.resultCertificationId}`);
  }

  if (process.argv.includes("--keep")) {
    console.log("(--keep gesetzt, Job/Zertifizierung bleiben in der DB)");
  } else {
    await cleanupJob(job.id);
    console.log("Aufgeräumt.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("E2E-Lauf fehlgeschlagen:", err);
  process.exit(1);
});
