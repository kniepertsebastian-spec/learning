import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { examAttempts, exams, quizAttempts, quizzes, studySessions } from "@/lib/server/db/schema";
import {
  buildActivityCalendar,
  computeActivityTrends,
  type ActivityCalendarDay,
  type ActivityTrendWindow,
} from "./trends";

const TREND_WINDOWS_DAYS = [7, 30, 90];
const CALENDAR_DAYS = 84; // 12 Wochen, GitHub-artige Heatmap

/**
 * R3 (roadmap.md): sammelt die Ereignisse für computeActivityTrends()/
 * buildActivityCalendar() aus quiz_attempts, exam_attempts und
 * study_sessions - bewusst NICHT aus review_items (siehe Kommentar in
 * trends.ts: das ist ein Upsert-Cache des LETZTEN Zustands, keine Historie).
 * Lernsessions zählen nur zur Aktivität (Tage/Ereigniszahl), nicht zur
 * Genauigkeits-Kennzahl - study_sessions hat kein eigenes Score-Feld
 * (mischt Review/Weak/Neu-Items unterschiedlicher Kategorie), quiz_attempts
 * und exam_attempts liefern dafür bereits ein passendes, einheitliches
 * 0-100-Ergebnis pro Versuch.
 */
export async function getActivityTrends(
  userId: string,
  certificationId: string,
  now: Date = new Date(),
): Promise<ActivityTrendWindow[]> {
  const { activityDates, accuracyEvents } = await gatherActivity(userId, certificationId);
  return computeActivityTrends(activityDates, accuracyEvents, TREND_WINDOWS_DAYS, now);
}

export async function getActivityCalendar(
  userId: string,
  certificationId: string,
  now: Date = new Date(),
): Promise<ActivityCalendarDay[]> {
  const { activityDates } = await gatherActivity(userId, certificationId);
  return buildActivityCalendar(activityDates, CALENDAR_DAYS, now);
}

async function gatherActivity(
  userId: string,
  certificationId: string,
): Promise<{ activityDates: Date[]; accuracyEvents: Array<{ date: Date; score: number }> }> {
  const db = getDb();

  const [quizRows, examRows, sessionRows] = await Promise.all([
    db
      .select({ completedAt: quizAttempts.completedAt, score: quizAttempts.score })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
      .where(and(eq(quizAttempts.userId, userId), eq(quizzes.certificationId, certificationId))),
    db
      .select({ completedAt: examAttempts.completedAt, score: examAttempts.score })
      .from(examAttempts)
      .innerJoin(exams, eq(exams.id, examAttempts.examId))
      .where(and(eq(examAttempts.userId, userId), eq(exams.certificationId, certificationId))),
    db
      .select({ completedAt: studySessions.completedAt })
      .from(studySessions)
      .where(and(eq(studySessions.userId, userId), eq(studySessions.certificationId, certificationId))),
  ]);

  const activityDates: Date[] = [];
  const accuracyEvents: Array<{ date: Date; score: number }> = [];

  for (const row of quizRows) {
    if (!row.completedAt) continue;
    activityDates.push(row.completedAt);
    if (row.score !== null) accuracyEvents.push({ date: row.completedAt, score: Number(row.score) });
  }
  for (const row of examRows) {
    if (!row.completedAt) continue;
    activityDates.push(row.completedAt);
    if (row.score !== null) accuracyEvents.push({ date: row.completedAt, score: Number(row.score) });
  }
  for (const row of sessionRows) {
    if (!row.completedAt) continue;
    activityDates.push(row.completedAt);
  }

  return { activityDates, accuracyEvents };
}
