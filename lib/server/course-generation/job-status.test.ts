/** Ein vom Fehlerschutz gestoppter Auftrag steht still: er ist beendet (neu startbar), blockiert aber keinen Titel. Echte DB. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseGenerationJobs, users } from "@/lib/server/db/schema";
import { createCourseGenerationJob, DuplicateCourseGenerationJobError, isTerminalCourseGenerationStatus, updateCourseGenerationJob } from "./job-service";

const run = TEST_DB ? describe : describe.skip;

describe("isTerminalCourseGenerationStatus", () => {
  it("circuit_breaker_open gilt als beendet, ein laufender Auftrag nicht", () => {
    expect(isTerminalCourseGenerationStatus("circuit_breaker_open")).toBe(true);
    expect(isTerminalCourseGenerationStatus("content_generating")).toBe(false);
  });
});

run("Dublettenprüfung (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  let userId = "";
  const ids: string[] = [];
  const input = (title: string) => ({
    requestedByUserId: userId, courseTitle: title, courseDescription: "x", language: "de" as const, provider: "T", sourceUrls: ["https://a.example/x"],
    autoPublish: false, initialCostLimitUsd: 1, absoluteCostLimitUsd: 2, blueprintProvider: "anthropic-sonnet" as const,
  });
  beforeAll(async () => {
    userId = (await getDb().insert(users).values({ email: `st-${tag}@test.example`, passwordHash: "x", name: "st" }).returning({ id: users.id }))[0].id;
  });
  afterAll(async () => {
    for (const id of ids) await getDb().delete(courseGenerationJobs).where(eq(courseGenerationJobs.id, id));
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("laufender Auftrag blockiert denselben Titel, ein gestoppter nicht mehr", async () => {
    const title = `Dup ${tag}`;
    const first = await createCourseGenerationJob(input(title));
    ids.push(first.id);
    await expect(createCourseGenerationJob(input(title))).rejects.toBeInstanceOf(DuplicateCourseGenerationJobError);
    await updateCourseGenerationJob(first.id, { status: "circuit_breaker_open" });
    const second = await createCourseGenerationJob(input(title));
    ids.push(second.id);
    expect(second.id).not.toBe(first.id);
  });
});
