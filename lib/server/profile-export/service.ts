import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, learningProfileExports, userCertificates, users, type LearningProfileCourse, type LearningProfilePayload } from "@/lib/server/db/schema";
import { getChapterOverview } from "@/lib/server/chapters/service";
import { signProfile, verifyProfile } from "./sign";

export class ProfileExportError extends Error {}
/** Es gibt keinen Kurs mit hinterlegter, bestandener Zertifikatsprüfung: ohne Nachweis kein PDF. */
export class NothingToExportError extends ProfileExportError {}
/** Das PDF trägt den Namen der Person; ohne Namen im Konto lässt sich kein Nachweis ausstellen. */
export class MissingNameError extends ProfileExportError {}

/**
 * Kurse für das PDF: nur Kurse, zu denen eine erfolgreiche Zertifikatsprüfung hinterlegt ist (ein Zertifikat der Person, das mit dem Kurs
 * verknüpft ist und schon erworben wurde). Alles andere – auch ein weit fortgeschrittener, aber ungeprüfter Kurs – steht nie im Nachweis.
 */
export async function listEligibleCourses(userId: string, now: Date = new Date()): Promise<LearningProfileCourse[]> {
  const rows = await getDb()
    .select({
      certificationId: userCertificates.certificationId,
      course: certifications.name,
      title: userCertificates.title,
      vendor: userCertificates.vendor,
      earnedAt: userCertificates.earnedAt,
      expiresAt: userCertificates.expiresAt,
    })
    .from(userCertificates)
    .innerJoin(certifications, eq(certifications.id, userCertificates.certificationId))
    .where(and(eq(userCertificates.userId, userId), isNotNull(userCertificates.certificationId), lte(userCertificates.earnedAt, now)))
    .orderBy(desc(userCertificates.earnedAt));
  // Je Kurs das jüngste Zertifikat, damit ein Kurs nur einmal erscheint.
  const seen = new Set<string>();
  const out: LearningProfileCourse[] = [];
  for (const r of rows) {
    if (!r.certificationId || seen.has(r.certificationId)) continue;
    seen.add(r.certificationId);
    const chapters = await getChapterOverview(userId, r.certificationId).catch(() => []);
    out.push({
      course: r.course,
      certificate: r.title,
      vendor: r.vendor,
      earnedAt: r.earnedAt.toISOString(),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      chaptersCompleted: chapters.filter((c) => c.completed).length,
      chaptersTotal: chapters.length,
      lessonsDone: chapters.reduce((s, c) => s + c.sectionsDone, 0),
      lessonsTotal: chapters.reduce((s, c) => s + c.sectionTotal, 0),
    });
  }
  return out;
}

export interface IssuedProfile {
  id: string;
  issuedAt: Date;
  signature: string;
  payload: LearningProfilePayload;
}

/** Stellt ein signiertes Lernprofil aus und speichert es für die Prüfseite. */
export async function issueLearningProfile(userId: string, now: Date = new Date()): Promise<IssuedProfile> {
  const [user] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const holder = user?.name?.trim();
  if (!holder) throw new MissingNameError();
  const courses = await listEligibleCourses(userId, now);
  if (courses.length === 0) throw new NothingToExportError();
  const payload: LearningProfilePayload = { holder, courses };
  const id = randomUUID();
  const signature = signProfile({ id, userId, issuedAt: now, payload });
  await getDb().insert(learningProfileExports).values({ id, userId, payload, signature, issuedAt: now });
  return { id, issuedAt: now, signature, payload };
}

export interface VerificationResult {
  /** Der Eintrag existiert, ist nicht widerrufen und die Signatur stimmt. */
  valid: boolean;
  revoked: boolean;
  issuedAt: Date;
  payload: LearningProfilePayload;
}

/** Für die öffentliche Prüfseite: gibt es dieses Dokument, ist es unverändert und nicht widerrufen? `null`, wenn es die Kennung nicht gibt. */
export async function verifyIssuedProfile(id: string): Promise<VerificationResult | null> {
  const [row] = await getDb().select().from(learningProfileExports).where(eq(learningProfileExports.id, id)).limit(1);
  if (!row) return null;
  const intact = verifyProfile({ id: row.id, userId: row.userId, issuedAt: row.issuedAt, payload: row.payload, signature: row.signature });
  return { valid: intact && !row.revokedAt, revoked: Boolean(row.revokedAt), issuedAt: row.issuedAt, payload: row.payload };
}

export async function listIssuedProfiles(userId: string) {
  return getDb()
    .select({ id: learningProfileExports.id, issuedAt: learningProfileExports.issuedAt, revokedAt: learningProfileExports.revokedAt, courses: learningProfileExports.payload })
    .from(learningProfileExports)
    .where(eq(learningProfileExports.userId, userId))
    .orderBy(desc(learningProfileExports.issuedAt));
}

/** Widerruft ein eigenes PDF: die Prüfseite zeigt es danach als widerrufen. */
export async function revokeIssuedProfile(userId: string, id: string, now: Date = new Date()): Promise<boolean> {
  const rows = await getDb()
    .update(learningProfileExports)
    .set({ revokedAt: now })
    .where(and(eq(learningProfileExports.id, id), eq(learningProfileExports.userId, userId), isNull(learningProfileExports.revokedAt)))
    .returning({ id: learningProfileExports.id });
  return rows.length > 0;
}
