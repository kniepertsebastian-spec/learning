/** Restaufwand für „Reicht die Zeit?“ gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { lessonCompletions } from "@/lib/server/db/schema";
import { recordRatedReviews } from "@/lib/server/psrp/service";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { getRemainingWorkload } from "./workload";

const run = TEST_DB ? describe : describe.skip;

run("Restaufwand (echte DB)", () => {
  it("zählt offene Lektionen und noch nie beantwortete Fragen", async () => {
    const course = await seedCourse(3);
    const [a, b] = await seedLessons(course.objectiveId, ["Eins", "Zwei"]);
    const userId = await seedUser();
    const before = await getRemainingWorkload(userId, course.certId);
    expect(before.unseenQuestions).toBe(3);
    expect(before.lessonMinutes).toBe(20); // zwei Lektionen mit je 10 Minuten (seedLessons)

    await getDb().insert(lessonCompletions).values({ userId, sectionId: a });
    await recordRatedReviews(userId, [{ itemId: course.questionIds[0], rawRating: 3 }]);
    const after = await getRemainingWorkload(userId, course.certId);
    expect(after).toEqual({ lessonMinutes: 10, unseenQuestions: 2 });
    expect(b).toBeTruthy();
  });
});
