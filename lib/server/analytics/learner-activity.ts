import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  examAttempts,
  exams,
  objectives,
  quizAttempts,
  quizzes,
  sections,
  studySessions,
} from "@/lib/server/db/schema";
import {
  buildActivityCalendar,
  computeActivityTrends,
  type ActivityCalendarDay,
  type ActivityTrendWindow,
} from "./trends";

const TREND_WINDOWS_DAYS = [7, 30, 90];
/** Nur 30 Tage statt aller drei Fenster wie beim kursweiten Trend - eine
 * Domain-aufgeschlüsselte 7-/30-/90-Tage-Matrix über mehrere Domains wäre
 * kaum noch lesbar. 30 Tage ist der sinnvollste Mittelwert zwischen "zu
 * verrauscht" (7) und "zu träge" (90). */
const DOMAIN_TREND_WINDOW_DAYS = 30;
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

export interface DomainActivityTrend {
  domainId: string;
  domainName: string;
  windowDays: number;
  activeDays: number;
  totalActivityEvents: number;
  avgAccuracy: number | null;
}

/**
 * R3 (roadmap.md): "Trends ... nach Domain/Objective aufschlüsseln" - nur
 * über quiz_attempts, NICHT exam_attempts: eine Prüfung deckt typischerweise
 * mehrere Domains gemischt ab und lässt sich keiner einzelnen zuordnen,
 * während ein Section-Quiz über quizzes.sectionId -> sections.objectiveId
 * -> objectives.domainId eindeutig einer Domain zugehört. Echte
 * Objective-Ebene würde bei größeren Kursen (20+ Objectives) kaum noch
 * lesbar sein - Domain ist die gröbere, aber tatsächlich nutzbare Stufe
 * (deckt sich mit der bereits vorhandenen Domain-Mastery-Ansicht).
 */
export async function getActivityTrendsByDomain(
  userId: string,
  certificationId: string,
  now: Date = new Date(),
): Promise<DomainActivityTrend[]> {
  const db = getDb();

  const rows = await db
    .select({
      domainId: domains.id,
      domainName: domains.name,
      completedAt: quizAttempts.completedAt,
      score: quizAttempts.score,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .innerJoin(sections, eq(sections.id, quizzes.sectionId))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(quizAttempts.userId, userId), eq(quizzes.certificationId, certificationId)));

  const byDomain = new Map<string, { name: string; dates: Date[]; scores: { date: Date; score: number }[] }>();
  for (const row of rows) {
    if (!row.completedAt) continue;
    let bucket = byDomain.get(row.domainId);
    if (!bucket) {
      bucket = { name: row.domainName, dates: [], scores: [] };
      byDomain.set(row.domainId, bucket);
    }
    bucket.dates.push(row.completedAt);
    if (row.score !== null) bucket.scores.push({ date: row.completedAt, score: Number(row.score) });
  }

  return Array.from(byDomain.entries())
    .map(([domainId, bucket]) => {
      const [window] = computeActivityTrends(bucket.dates, bucket.scores, [DOMAIN_TREND_WINDOW_DAYS], now);
      return {
        domainId,
        domainName: bucket.name,
        windowDays: window.windowDays,
        activeDays: window.activeDays,
        totalActivityEvents: window.totalActivityEvents,
        avgAccuracy: window.avgAccuracy,
      };
    })
    .sort((a, b) => a.domainName.localeCompare(b.domainName));
}
