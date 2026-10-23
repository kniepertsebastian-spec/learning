/** „Wie ich lerne“ und Einstieg gegen echte DB. Nur mit TEST_DATABASE_URL. */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { studyProfiles, studySessions, users } from "@/lib/server/db/schema";
import { seedCourse, seedUser } from "@/lib/server/psrp/test-db";
import { getLearningContext, getLearningPreferences, InvalidPreferencesError, saveLearningPreferences } from "./learning-context";

const run = TEST_DB ? describe : describe.skip;
const now = new Date("2026-10-21T12:00:00Z"); // Mittwoch
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

run("Einstieg und Wochenziel (echte DB)", () => {
  async function complete(userId: string, certId: string, when: Date) {
    await getDb().insert(studySessions).values({ userId, certificationId: certId, status: "completed", goalType: "minutes", goalValue: 10, plannedAt: when, completedAt: when });
  }

  it("neue Person: erste Session ohne Zusatz-Eingaben, Standardwerte", async () => {
    const userId = await seedUser();
    const ctx = await getLearningContext(userId, now);
    expect(ctx.intro).toEqual({ firstSession: true, askConfidence: false, offerCheckin: false });
    expect(ctx.preferences).toEqual({ weeklyGoalDays: 4, showStreak: false, askConfidence: true, offerCheckin: true });
    expect(ctx.weekly).toEqual({ daysLearned: 0, goal: 4, reached: false });
    expect(ctx.welcomeBack).toBe(false);
  });

  it("Sicherheitsangabe ab der 3., Check-in ab der 5. Session; abschaltbar", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser();
    for (let i = 0; i < 2; i++) await complete(userId, course.certId, daysAgo(i + 1));
    expect((await getLearningContext(userId, now)).intro).toEqual({ firstSession: false, askConfidence: true, offerCheckin: false });
    for (let i = 2; i < 4; i++) await complete(userId, course.certId, daysAgo(i + 1));
    expect((await getLearningContext(userId, now)).intro).toMatchObject({ askConfidence: true, offerCheckin: true });
    await saveLearningPreferences(userId, { askConfidence: false, offerCheckin: false });
    expect((await getLearningContext(userId, now)).intro).toMatchObject({ askConfidence: false, offerCheckin: false });
  });

  it("Wochenziel zählt Lerntage der Woche, leichte Tage zählen nicht gegen das Ziel, Serie nur mit Serienschutz", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser();
    await getDb().update(users).set({ timezone: "UTC" }).where(eq(users.id, userId));
    await getDb().insert(studyProfiles).values({ userId, certificationId: course.certId, lightWeekdays: [0, 6] } as never);
    // Mo, Di, Mi gelernt; Sa/So der Vorwoche frei (leicht), Fr gelernt
    for (const d of [0, 1, 2, 5]) await complete(userId, course.certId, daysAgo(d));
    const ctx = await getLearningContext(userId, now);
    expect(ctx.weekly.daysLearned).toBe(3);
    expect(ctx.weekly.goal).toBe(4);
    expect(ctx.streak).toBeGreaterThanOrEqual(4);
  });

  it("nach 7 Tagen Pause: Willkommen zurück", async () => {
    const course = await seedCourse(1);
    const userId = await seedUser();
    await complete(userId, course.certId, daysAgo(9));
    expect((await getLearningContext(userId, now)).welcomeBack).toBe(true);
    await complete(userId, course.certId, daysAgo(1));
    expect((await getLearningContext(userId, now)).welcomeBack).toBe(false);
  });

  it("Einstellungen speichern: nur gültige Werte, Teil-Updates", async () => {
    const userId = await seedUser();
    expect(await saveLearningPreferences(userId, { weeklyGoalDays: 5, showStreak: true })).toEqual({ weeklyGoalDays: 5, showStreak: true, askConfidence: true, offerCheckin: true });
    expect(await getLearningPreferences(userId)).toMatchObject({ weeklyGoalDays: 5, showStreak: true });
    await expect(saveLearningPreferences(userId, { weeklyGoalDays: 9 })).rejects.toBeInstanceOf(InvalidPreferencesError);
    expect((await getLearningPreferences(userId)).weeklyGoalDays).toBe(5);
  });
});
