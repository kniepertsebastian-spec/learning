/** Aufgabe 14 (Review 12.11.2026): Aufschieben, Regelmäßigkeit und Schlaf aus echten Daten (nur mit TEST_DATABASE_URL). */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { examPlans, itemStates, recallChecks, reviewLog, studySessions, users } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { anonymize, exportMetrics } from "./metrics";
import { computeHumanFactors } from "./human-factors";
import { humanFactorsMetrics, loadHumanFactorsUsers } from "./human-factors-db";

const run = TEST_DB ? describe : describe.skip;
const asOf = new Date("2026-11-14T12:00:00Z");
const daysAgo = (d: number, hour = 10) => new Date(Date.UTC(2026, 10, 14 - d, hour));

run("Menschliche Faktoren aus echten Daten", () => {
  it("eine Person mit 200 Reviews: Werte zu 4.4 und 4.5 mit Nenner, in psrp:metrics enthalten", async () => {
    const course = await seedCourse(5);
    const sectionIds = await seedLessons(course.objectiveId, ["a"]);
    const userId = await seedUser();
    const db = getDb();
    await db.update(users).set({ evaluationGroup: "planning" }).where(eq(users.id, userId));

    // 200 Reviews an 40 Tagen (5 je Tag), meist um 9 Uhr; jedes zweite mit niedriger Abrufwahrscheinlichkeit.
    const rows = Array.from({ length: 200 }, (_, i) => {
      const at = daysAgo(1 + (i % 40), 9);
      return {
        userId,
        itemId: course.questionIds[i % 5],
        sessionId: crypto.randomUUID(),
        timestampUtc: at,
        localHour: at.getUTCHours() + 1,
        weekday: ((at.getUTCDay() + 6) % 7) + 1,
        rawRating: 3,
        predictedR: i % 2 ? 0.95 : 0.6,
      };
    });
    await db.insert(reviewLog).values(rows);

    // Zwei überfällige Items (3 und 8 Tage), ein nicht überfälliges.
    await db.insert(itemStates).values([
      { userId, itemId: course.questionIds[0], stability: 2, difficulty: 5, reps: 2, lapses: 0, fsrsState: 2, lastReview: daysAgo(10), due: daysAgo(3, 12) },
      { userId, itemId: course.questionIds[1], stability: 2, difficulty: 5, reps: 2, lapses: 0, fsrsState: 2, lastReview: daysAgo(15), due: daysAgo(8, 12) },
      { userId, itemId: course.questionIds[2], stability: 2, difficulty: 5, reps: 2, lapses: 0, fsrsState: 2, lastReview: daysAgo(1), due: new Date(asOf.getTime() + 5 * 86_400_000) },
    ]);

    // Prüfungstermin vor 3 Tagen; ein Rückblick mit Nacht dazwischen.
    await db.insert(examPlans).values({ userId, certificationId: course.certId, scheduledAt: daysAgo(3, 9), status: "passed" });
    const [session] = await db.insert(studySessions).values({ userId, certificationId: course.certId, status: "completed", goalType: "minutes", goalValue: 10, plannedAt: daysAgo(6), completedAt: daysAgo(6) }).returning();
    await db.insert(recallChecks).values({
      userId, sessionId: session.id, sectionId: sectionIds[0], status: "answered", questionCount: 4, correctCount: 3,
      lessonCompletedAt: new Date(Date.UTC(2026, 10, 7, 21)), hoursSinceLesson: 10, phiAtRecall: 0.7, hourAtLearning: 22, hourAtRecall: 8, createdAt: daysAgo(6),
    });

    const hash = (id: string) => anonymize(id, "test");
    const people = await loadHumanFactorsUsers(asOf, hash);
    const me = people.find((p) => p.userHash === hash(userId))!;
    expect(me.reviews).toHaveLength(200);
    expect(me.overdueDays.sort()).toEqual([3, 8]);

    // Die Werte dieser einen Person (die Testdatenbank enthält auch andere Personen).
    const all = computeHumanFactors([me], asOf);
    // 4.4
    expect(all.procrastination.backlog).toMatchObject({ persons: 1, withBacklog: 1, overdueItems: 2 });
    expect(all.procrastination.backlog.medianDaysOverdue.median).toBe(5.5);
    expect(all.procrastination.lateness).toMatchObject({ n: 200, numerator: 100, share: 0.5, small: false });
    expect(all.procrastination.cramming.exams).toBe(1);
    expect(all.procrastination.cramming.n).toBeGreaterThan(0);
    // 4.5
    expect(all.regularity.hourSpreadHours).toMatchObject({ n: 1, small: true });
    expect(all.regularity.hourSpreadHours.median).toBeCloseTo(0, 6);
    expect(all.regularity.weekdaysUsed.median).toBe(7);
    expect(all.regularity.weeklyGoal.n).toBeGreaterThan(0);
    // 4.11: Der Rückblick (22 Uhr bis 08 Uhr Berlin) hatte eine Nacht, die Empfehlung ist mangels Daten nicht belegt.
    expect(all.sleep.withNight).toMatchObject({ n: 1, questions: 4, correct: 3 });
    expect(all.sleep.recommendationSupported).toBe(false);

    // Im Export von `npm run psrp:metrics`.
    const exported = await exportMetrics({ asOf, salt: "test" });
    expect(exported.humanFactors.all.regularity.weeklyGoal).toHaveProperty("n");
    expect(exported.humanFactors.all.procrastination.lateness.n).toBeGreaterThanOrEqual(200);
    expect(exported.humanFactors.byGroup.planning?.procrastination.lateness.n).toBeGreaterThanOrEqual(200);
    expect((await humanFactorsMetrics(asOf, hash)).all.sleep).toHaveProperty("recommendationSupported");
  });

  it("Reviews nach dem Stichtag und Personen ohne Evaluationsgruppe zählen nicht", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser(); // ohne Gruppe
    await getDb().insert(reviewLog).values({ userId, itemId: course.questionIds[0], sessionId: crypto.randomUUID(), timestampUtc: daysAgo(2), localHour: 9, weekday: 1, rawRating: 3 });
    const people = await loadHumanFactorsUsers(asOf, (id) => id);
    expect(people.find((p) => p.userHash === userId)).toBeUndefined();
  });
});
