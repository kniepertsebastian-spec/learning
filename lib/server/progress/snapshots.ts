/** Fortschritt sichtbar (roadmap_motivation Phase 7): Stand „Lernziele sicher“ je Tag festhalten und daraus Rückblick und Einschätzung bilden. Nur für die Person selbst. */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectiveProgress, objectiveSnapshots, objectives, studyProfiles, users } from "@/lib/server/db/schema";
import { examOutlook, progressReview, type Outlook, type ProgressReview, type SnapshotPoint } from "@/lib/progress/forecast";
import { dayKey } from "@/lib/study/weekly-goal";

/** „Sicher“ = Status STRONG (Beherrschung ab 80, siehe progress/service.ts). */
const SECURE_STATUS = "STRONG";

async function timeZoneOf(userId: string): Promise<string> {
  const [row] = await getDb().select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.timezone ?? "UTC";
}

/** Hält den heutigen Stand fest (höchstens einmal je Tag und Kurs, später am Tag überschrieben). Gibt die Werte zurück; ohne Lernziele null. */
export async function recordObjectiveSnapshot(userId: string, certificationId: string, now: Date = new Date()): Promise<SnapshotPoint | null> {
  const db = getDb();
  const rows = await db
    .select({ id: objectives.id })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certificationId));
  if (rows.length === 0) return null;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(objectiveProgress)
    .where(and(eq(objectiveProgress.userId, userId), inArray(objectiveProgress.objectiveId, rows.map((r) => r.id)), eq(objectiveProgress.status, SECURE_STATUS)));
  const day = dayKey(now, await timeZoneOf(userId));
  const point: SnapshotPoint = { day, secure: Number(n), total: rows.length };
  await db
    .insert(objectiveSnapshots)
    .values({ userId, certificationId, day, secureObjectives: point.secure, totalObjectives: point.total })
    .onConflictDoUpdate({ target: [objectiveSnapshots.userId, objectiveSnapshots.certificationId, objectiveSnapshots.day], set: { secureObjectives: point.secure, totalObjectives: point.total } });
  return point;
}

/** Die Kurse, in denen die Person zuletzt Fortschritt festgehalten hat (für das Profil), jüngster zuerst. */
export async function listProgressCourses(userId: string, limit = 3): Promise<Array<{ id: string; slug: string; name: string }>> {
  const rows = await getDb()
    .select({ id: certifications.id, slug: certifications.slug, name: certifications.name, last: sql<string>`max(${objectiveSnapshots.day})` })
    .from(objectiveSnapshots)
    .innerJoin(certifications, eq(certifications.id, objectiveSnapshots.certificationId))
    .where(eq(objectiveSnapshots.userId, userId))
    .groupBy(certifications.id, certifications.slug, certifications.name)
    .orderBy(desc(sql`max(${objectiveSnapshots.day})`))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name }));
}

export interface ProgressView {
  review: ProgressReview | null;
  outlook: Outlook;
  /** Verlauf für die kleine Grafik, ältester zuerst (höchstens 26 Wochen). */
  series: SnapshotPoint[];
}

/** Rückblick und Einschätzung; legt dabei den heutigen Stand an, damit der Verlauf auch bei bestehenden Personen beginnt. */
export async function getProgressView(userId: string, certificationId: string, now: Date = new Date()): Promise<ProgressView> {
  const db = getDb();
  await recordObjectiveSnapshot(userId, certificationId, now).catch((error) => console.error("Fortschritts-Stand fehlgeschlagen:", error));
  const [rows, [profile], timeZone] = await Promise.all([
    db
      .select({ day: objectiveSnapshots.day, secure: objectiveSnapshots.secureObjectives, total: objectiveSnapshots.totalObjectives })
      .from(objectiveSnapshots)
      .where(and(eq(objectiveSnapshots.userId, userId), eq(objectiveSnapshots.certificationId, certificationId)))
      .orderBy(asc(objectiveSnapshots.day)),
    db.select({ examDate: studyProfiles.examDate }).from(studyProfiles).where(and(eq(studyProfiles.userId, userId), eq(studyProfiles.certificationId, certificationId))).limit(1),
    timeZoneOf(userId),
  ]);
  const today = dayKey(now, timeZone);
  const series = rows.slice(-182);
  return {
    review: progressReview(series, today),
    outlook: examOutlook(series, today, profile?.examDate ? dayKey(profile.examDate, timeZone) : null),
    series,
  };
}
