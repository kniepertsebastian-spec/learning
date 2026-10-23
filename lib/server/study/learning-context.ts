/** „Wie ich lerne“ und Einstieg: Einstellungen der Person plus der daraus abgeleitete Stand (Wochenziel, Serie, Einführung, Willkommen zurück). */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { learningPreferences, studyProfiles, studySessions, users } from "@/lib/server/db/schema";
import {
  DEFAULT_PREFERENCES,
  introStage,
  isWelcomeBack,
  protectedStreak,
  weeklyProgress,
  type IntroStage,
  type LearningPreferences,
  type WeeklyProgress,
} from "@/lib/study/weekly-goal";

export interface LearningContext {
  preferences: LearningPreferences;
  intro: IntroStage;
  completedSessions: number;
  weekly: WeeklyProgress;
  /** Serie mit Serienschutz; nur gezeigt, wenn `preferences.showStreak`. */
  streak: number;
  welcomeBack: boolean;
}

export async function getLearningPreferences(userId: string): Promise<LearningPreferences> {
  const [row] = await getDb().select().from(learningPreferences).where(eq(learningPreferences.userId, userId)).limit(1);
  return row ? { weeklyGoalDays: row.weeklyGoalDays, showStreak: row.showStreak, askConfidence: row.askConfidence, offerCheckin: row.offerCheckin } : DEFAULT_PREFERENCES;
}

export class InvalidPreferencesError extends Error {}

export async function saveLearningPreferences(userId: string, input: Partial<LearningPreferences>): Promise<LearningPreferences> {
  const current = await getLearningPreferences(userId);
  const next: LearningPreferences = { ...current, ...input };
  if (!Number.isInteger(next.weeklyGoalDays) || next.weeklyGoalDays < 1 || next.weeklyGoalDays > 7) throw new InvalidPreferencesError();
  await getDb()
    .insert(learningPreferences)
    .values({ userId, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: learningPreferences.userId, set: { ...next, updatedAt: new Date() } });
  return next;
}

export async function getLearningContext(userId: string, now: Date = new Date()): Promise<LearningContext> {
  const db = getDb();
  const [preferences, completed, [user], profiles] = await Promise.all([
    getLearningPreferences(userId),
    db
      .select({ completedAt: studySessions.completedAt })
      .from(studySessions)
      .where(and(eq(studySessions.userId, userId), eq(studySessions.status, "completed")))
      .orderBy(desc(studySessions.completedAt)),
    db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ light: studyProfiles.lightWeekdays }).from(studyProfiles).where(eq(studyProfiles.userId, userId)),
  ]);
  const dates = completed.map((r) => r.completedAt).filter((d): d is Date => d !== null);
  const timeZone = user?.timezone ?? "UTC";
  // Leichte Tage gelten, wenn die Person sie in jedem ihrer Lernpfade als leicht eingetragen hat.
  const lightWeekdays = profiles.length > 0 ? profiles.map((p) => p.light).reduce((a, b) => a.filter((d) => b.includes(d))) : [];
  return {
    preferences,
    intro: introStage(dates.length, preferences),
    completedSessions: dates.length,
    weekly: weeklyProgress({ completedAt: dates, now, timeZone, lightWeekdays, goalDays: preferences.weeklyGoalDays }),
    streak: protectedStreak({ completedAt: dates, now, timeZone, lightWeekdays }),
    welcomeBack: isWelcomeBack(dates[0] ?? null, now),
  };
}

