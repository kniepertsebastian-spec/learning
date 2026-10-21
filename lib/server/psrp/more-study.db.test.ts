/** „Mehr lernen“ und leichte Tage gegen echte DB. */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { sessionDerived, studySessions, users } from "@/lib/server/db/schema";
import { getStudyProfile, upsertStudyProfile } from "@/lib/server/study/profile";
import { startMoreStudySession, startStudySession } from "@/lib/server/study/session-service";
import { seedCourse, seedUser } from "./test-db";

const run = TEST_DB ? describe : describe.skip;

run("Mehr lernen und leichte Tage (echte DB)", () => {
  let userId = "";
  let certId = "";
  beforeAll(async () => {
    userId = await seedUser();
    ({ certId } = await seedCourse(2));
  });
  afterAll(async () => {
    await getDb().delete(users).where(eq(users.id, userId));
  });

  it("leichte Tage werden gespeichert und bleiben beim Speichern ohne das Feld erhalten", async () => {
    const base = { examDate: null, dailyGoalType: "minutes" as const, dailyGoalValue: 15, activeDays: [1, 2, 3], preferredLocale: null };
    await upsertStudyProfile(userId, certId, { ...base, lightWeekdays: [6, 7] });
    expect((await getStudyProfile(userId, certId))?.lightWeekdays).toEqual([6, 7]);
    await upsertStudyProfile(userId, certId, base);
    expect((await getStudyProfile(userId, certId))?.lightWeekdays).toEqual([6, 7]);
  });

  it("Mehr lernen ist erst nach einer abgeschlossenen Session möglich und erhöht das Limit", async () => {
    expect(await startMoreStudySession(userId, certId)).toBeNull();
    const first = await startStudySession(userId, certId, 10);
    expect(await startMoreStudySession(userId, certId)).toBeNull(); // noch aktiv
    await getDb().update(studySessions).set({ status: "completed", completedAt: new Date() }).where(eq(studySessions.id, first.id));
    const more = await startMoreStudySession(userId, certId);
    expect(more).not.toBeNull();
    const [a] = await getDb().select().from(sessionDerived).where(eq(sessionDerived.sessionId, first.id));
    const [b] = await getDb().select().from(sessionDerived).where(eq(sessionDerived.sessionId, more!.id));
    expect(b.dailyLimit).toBeGreaterThan(a.dailyLimit);
  });
});
