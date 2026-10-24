/** Kennzahlen zu Abbruch, Rückkehr und Abschluss aus echten Daten (nur mit TEST_DATABASE_URL). */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { learningExits, lessonCompletions, studySessions, users } from "@/lib/server/db/schema";
import { seedCourse, seedLessons, seedUser } from "@/lib/server/psrp/test-db";
import { loadEngagementUsers } from "./engagement-metrics-db";
import { computeEngagement } from "./engagement-metrics";

const run = TEST_DB ? describe : describe.skip;
const asOf = new Date("2026-10-31T12:00:00Z");
const daysAgo = (d: number) => new Date(asOf.getTime() - d * 86_400_000);

run("Kennzahlen zu Abbruch und Abschluss (echte DB)", () => {
  it("liest Sessions, Pausen, Notausstieg, Entlastung und Kursabschluss je Person (anonym, nur bis zum Stichtag)", async () => {
    const course = await seedCourse(1);
    const sectionIds = await seedLessons(course.objectiveId, ["a", "b"]);
    const userId = await seedUser();
    await getDb().update(users).set({ evaluationGroup: "vanilla" }).where(eq(users.id, userId));
    const db = getDb();
    const session = (at: Date, over: Partial<typeof studySessions.$inferInsert> = {}) => db.insert(studySessions).values({ userId, certificationId: course.certId, status: "completed", goalType: "minutes", goalValue: 10, plannedAt: at, completedAt: at, ...over }).returning();
    await session(daysAgo(30));
    await session(daysAgo(29));
    const [deesc] = await session(daysAgo(10), { deescalated: true });
    await session(daysAgo(-5)); // nach dem Stichtag: zählt nicht
    await db.insert(learningExits).values({ userId, source: "session", sessionId: deesc.id, createdAt: daysAgo(10) });
    await db.insert(lessonCompletions).values([{ userId, sectionId: sectionIds[0], completedAt: daysAgo(9) }, { userId, sectionId: sectionIds[1], completedAt: daysAgo(8) }]);

    const people = await loadEngagementUsers(asOf, (id) => `h-${id.slice(0, 4)}`);
    const me = people.find((p) => p.userHash === `h-${userId.slice(0, 4)}`)!;
    expect(me).toMatchObject({ group: "vanilla", sessions: 3, exits: 1, deescalatedSessions: 1 });
    expect(me.sessionDays).toHaveLength(3);
    expect(me.courses).toEqual([{ done: 2, total: 2 }]);

    const m = computeEngagement([me], asOf);
    expect(m.churn30.rate).toBe(0); // zuletzt vor 10 Tagen: nicht weg
    expect(m.churn7.rate).toBe(1); // vor mehr als 7 Tagen gestartet, seit 10 Tagen keine Session
    expect(m.returnAfterPause).toMatchObject({ closed: 1, open: 1 }); // Lücke 29 -> 10 Tage, und seit 10 Tagen offen
    expect(m.courseCompletion.rate).toBe(1);
  });
});
