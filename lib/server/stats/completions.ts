import { and, eq, gte, isNotNull, lte, min, ne, or, sql, sum } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  courseCompletionEvents,
  domains,
  examAttempts,
  exams,
  learningTime,
  lessonCompletions,
  objectives,
  quizAttempts,
  quizzes,
  sections,
  studySessions,
  userCertificates,
  type CourseCompletionKind,
} from "@/lib/server/db/schema";

/**
 * Anonyme Abschluss-Statistik (roadmap3.md): beim ERSTEN Bestehen der Abschlussprüfung und beim ERSTEN Zertifikat einer
 * Person in einem Kurs entsteht eine Zeile in course_completion_events, ohne Bezug zur Person (kein user_id, nur der Tag).
 * Die persönlichen Daten werden nur gelesen, um zu entscheiden, ob es das erste Mal ist, und um Dauer und Lernzeit zu
 * berechnen; gespeichert wird nur das Ergebnis.
 *
 * Fehler hier dürfen nie das Einreichen einer Prüfung oder das Anlegen eines Zertifikats verhindern: die öffentlichen
 * Funktionen fangen alles ab und melden es nur im Log.
 */

/** Bestehensgrenze der Abschlussprüfung in Prozent: die offizielle, wenn sie in Prozent angegeben ist, sonst 70 %
 * (ab hier gilt man in der Auswertung als „angemessen vorbereitet“, siehe lib/server/exam/scoring.ts). */
export const DEFAULT_PASS_PERCENT = 70;
export function passMarkPercent(passingScore: string | number | null | undefined): number {
  const n = passingScore === null || passingScore === undefined ? NaN : Number(passingScore);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : DEFAULT_PASS_PERCENT;
}

export function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Angefangene Kalendertage vom ersten Lernen bis zum Abschluss; am selben Tag = 1. */
export function calendarDaysBetween(first: Date, done: Date): number {
  const a = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const b = Date.UTC(done.getUTCFullYear(), done.getUTCMonth(), done.getUTCDate());
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** Frühestes Lernen der Person im Kurs: Lektion, Lektionstest, Lernsitzung, Prüfungsversuch oder gemessene Lernzeit. */
export async function firstActivity(userId: string, certificationId: string): Promise<Date | null> {
  const db = getDb();
  const [lesson] = await db
    .select({ at: min(lessonCompletions.completedAt) })
    .from(lessonCompletions)
    .innerJoin(sections, eq(sections.id, lessonCompletions.sectionId))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(lessonCompletions.userId, userId), eq(domains.certificationId, certificationId)));
  const [quiz] = await db
    .select({ at: min(quizAttempts.startedAt) })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.userId, userId), eq(quizzes.certificationId, certificationId)));
  const [session] = await db
    .select({ at: min(sql<Date>`coalesce(${studySessions.startedAt}, ${studySessions.createdAt})`) })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.certificationId, certificationId)));
  const [exam] = await db
    .select({ at: min(examAttempts.startedAt) })
    .from(examAttempts)
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .where(and(eq(examAttempts.userId, userId), eq(exams.certificationId, certificationId)));
  const [tracked] = await db.select({ day: min(learningTime.day) }).from(learningTime).where(and(eq(learningTime.userId, userId), eq(learningTime.certificationId, certificationId)));
  const dates = [lesson?.at, quiz?.at, session?.at, exam?.at, tracked?.day ? `${tracked.day}T00:00:00Z` : null]
    .filter((d): d is Date | string => d !== null && d !== undefined)
    .map((d) => new Date(d));
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}

/**
 * Gemessene aktive Lernzeit bis einschließlich `until`, in Minuten. null, wenn die Messung später einsetzt als das erste
 * Lernen (die Zeit davor fehlt, die Zahl wäre zu klein).
 */
export async function activeMinutes(userId: string, certificationId: string, first: Date, until: Date): Promise<number | null> {
  const [row] = await getDb()
    .select({ firstDay: min(learningTime.day), seconds: sum(learningTime.seconds) })
    .from(learningTime)
    .where(and(eq(learningTime.userId, userId), eq(learningTime.certificationId, certificationId), lte(learningTime.day, dayOf(until))));
  if (!row?.firstDay || row.firstDay > dayOf(first)) return null;
  return Math.round(Number(row.seconds ?? 0) / 60);
}

async function insertCompletion(userId: string, certificationId: string, kind: CourseCompletionKind, at: Date): Promise<boolean> {
  const db = getDb();
  const [cert] = await db.select({ name: certifications.name }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  if (!cert) return false;
  const first = await firstActivity(userId, certificationId);
  // Kein Lernen im Kurs vor dem Abschluss (z. B. ein Zertifikat von früher eingetragen): kein Kursabschluss hier.
  if (!first || first.getTime() > at.getTime()) return false;
  await db.insert(courseCompletionEvents).values({
    certificationId,
    courseName: cert.name,
    kind,
    completedOn: dayOf(at),
    calendarDays: calendarDaysBetween(first, at),
    activeMinutes: await activeMinutes(userId, certificationId, first, at),
  });
  return true;
}

/**
 * Nach einem eingereichten Prüfungsversuch: war es das erste Bestehen der Person in diesem Kurs? Frühere Versuche zählen
 * als bestanden, wenn `passed` gesetzt ist oder (ältere Versuche ohne `passed`) die Punkte die Grenze erreichen.
 */
export async function recordFinalExamPass(userId: string, certificationId: string, attemptId: string, at: Date = new Date()): Promise<boolean> {
  try {
    const db = getDb();
    const [cert] = await db.select({ passingScore: certifications.passingScore }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
    if (!cert) return false;
    const mark = passMarkPercent(cert.passingScore);
    const [earlier] = await db
      .select({ id: examAttempts.id })
      .from(examAttempts)
      .innerJoin(exams, eq(exams.id, examAttempts.examId))
      .where(
        and(
          eq(examAttempts.userId, userId),
          eq(exams.certificationId, certificationId),
          ne(examAttempts.id, attemptId),
          or(eq(examAttempts.passed, true), and(isNotNull(examAttempts.score), gte(examAttempts.score, String(mark)))),
        ),
      )
      .limit(1);
    if (earlier) return false;
    return await insertCompletion(userId, certificationId, "final_exam_passed", at);
  } catch (error) {
    console.error("[stats] Abschluss (Prüfung) nicht erfasst:", error);
    return false;
  }
}

/** Nach einem neu angelegten Zertifikat zu einem Kurs: das erste dieser Person für diesen Kurs? */
export async function recordCertified(userId: string, certificationId: string, certificateId: string, earnedAt: Date): Promise<boolean> {
  try {
    const [earlier] = await getDb()
      .select({ id: userCertificates.id })
      .from(userCertificates)
      .where(and(eq(userCertificates.userId, userId), eq(userCertificates.certificationId, certificationId), ne(userCertificates.id, certificateId)))
      .limit(1);
    if (earlier) return false;
    return await insertCompletion(userId, certificationId, "certified", earnedAt);
  } catch (error) {
    console.error("[stats] Abschluss (Zertifikat) nicht erfasst:", error);
    return false;
  }
}
