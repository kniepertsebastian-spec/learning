import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, courseCompletionEvents, examAttempts, exams, userCertificates } from "@/lib/server/db/schema";
import { calendarDaysBetween, dayOf, firstActivity, passMarkPercent } from "./completions";

/**
 * Einmaliger Nachtrag der anonymen Abschluss-Statistik aus vorhandenen Daten (npm run stats:backfill-completions):
 * erstes Bestehen der Abschlussprüfung (Punkte ≥ Bestehensgrenze) und erstes Zertifikat zu einem Kurs je Person.
 * Aktive Lernzeit gibt es dafür nicht (die Messung kam später): activeMinutes bleibt leer. Setzt außerdem
 * `exam_attempts.passed` für ältere Versuche, bei denen es fehlt. Läuft nur, solange es keine nachgetragenen Zeilen gibt.
 */
export async function backfillCompletions(): Promise<{ finalExams: number; certificates: number; attemptsMarked: number } | null> {
  const db = getDb();
  const [done] = await db.select({ id: courseCompletionEvents.id }).from(courseCompletionEvents).where(eq(courseCompletionEvents.backfilled, true)).limit(1);
  if (done) return null;

  // Ältere Versuche ohne `passed`: aus Punkten und Bestehensgrenze des Kurses nachtragen.
  const open = await db
    .select({ id: examAttempts.id, score: examAttempts.score, passingScore: certifications.passingScore })
    .from(examAttempts)
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .innerJoin(certifications, eq(certifications.id, exams.certificationId))
    .where(and(isNull(examAttempts.passed), isNotNull(examAttempts.completedAt), isNotNull(examAttempts.score)));
  let attemptsMarked = 0;
  for (const a of open) {
    await db.update(examAttempts).set({ passed: Number(a.score) >= passMarkPercent(a.passingScore) }).where(eq(examAttempts.id, a.id));
    attemptsMarked++;
  }

  // Abschlüsse, die schon live erfasst wurden (nach Einführung), nicht doppelt zählen: nur Abschlüsse VOR der ersten Live-Zeile.
  const [firstLive] = await db.select({ day: sql<string | null>`min(${courseCompletionEvents.completedOn})` }).from(courseCompletionEvents).where(eq(courseCompletionEvents.backfilled, false));
  const before = (d: Date) => !firstLive?.day || dayOf(d) < firstLive.day;

  const passes = await db
    .select({ userId: examAttempts.userId, certificationId: exams.certificationId, courseName: certifications.name, at: examAttempts.completedAt })
    .from(examAttempts)
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .innerJoin(certifications, eq(certifications.id, exams.certificationId))
    .where(and(eq(examAttempts.passed, true), isNotNull(examAttempts.completedAt)))
    .orderBy(asc(examAttempts.completedAt));
  const certs = await db
    .select({ userId: userCertificates.userId, certificationId: userCertificates.certificationId, courseName: certifications.name, at: userCertificates.earnedAt })
    .from(userCertificates)
    .innerJoin(certifications, eq(certifications.id, userCertificates.certificationId))
    .orderBy(asc(userCertificates.earnedAt));

  const counts = { finalExams: 0, certificates: 0, attemptsMarked };
  for (const [kind, list] of [["final_exam_passed", passes], ["certified", certs]] as const) {
    const seen = new Set<string>();
    for (const r of list) {
      const key = `${r.userId}:${r.certificationId}`;
      if (!r.at || !r.certificationId || seen.has(key)) continue;
      seen.add(key);
      if (!before(r.at)) continue;
      const first = await firstActivity(r.userId, r.certificationId);
      if (!first || first.getTime() > r.at.getTime()) continue;
      await db.insert(courseCompletionEvents).values({ certificationId: r.certificationId, courseName: r.courseName, kind, completedOn: dayOf(r.at), calendarDays: calendarDaysBetween(first, r.at), activeMinutes: null, backfilled: true });
      if (kind === "certified") counts.certificates++;
      else counts.finalExams++;
    }
  }
  return counts;
}
