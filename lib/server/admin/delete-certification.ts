import { and, eq, inArray, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  companyCourseEntitlements,
  contentGenerationJobs,
  mandatoryRules,
  quizzes,
  studyProfiles,
  studySessions,
} from "@/lib/server/db/schema";

export class CertificationNotFoundError extends Error {}
/** Interne Kurse gehören den Firmen; der Betreiber löscht sie nicht (er sieht sie nicht einmal). */
export class InternalCertificationError extends Error {}
export class GenerationRunningError extends Error {}
export class SlugMismatchError extends Error {}
/** Es hängen Lerndaten oder Firmenzuweisungen daran und das Löschen wurde nicht ausdrücklich bestätigt. */
export class DataAttachedError extends Error {
  constructor(readonly impact: DeleteImpact) {
    super("Es hängen Daten an diesem Kurs.");
  }
}

export type DeleteImpact = {
  /** Personen mit Lernstand (Profil, Lernsitzungen, Quizversuche) in diesem Kurs. */
  learners: number;
  companyAssignments: number;
  companyEntitlements: number;
  mandatoryRules: number;
};

const hasData = (i: DeleteImpact) => i.learners + i.companyAssignments + i.companyEntitlements + i.mandatoryRules > 0;

export async function getDeleteImpact(certificationId: string): Promise<DeleteImpact> {
  const db = getDb();
  const [learners] = await db.execute<{ n: number }>(sql`
    select count(distinct u)::int as n from (
      select user_id as u from ${studyProfiles} where certification_id = ${certificationId}
      union select user_id from ${studySessions} where certification_id = ${certificationId}
      union select a.user_id from quiz_attempts a join ${quizzes} q on q.id = a.quiz_id where q.certification_id = ${certificationId}
    ) x`);
  const count = async (table: typeof companyAssignments | typeof companyCourseEntitlements | typeof mandatoryRules) =>
    (await db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.certificationId, certificationId)))[0].n;
  return {
    learners: learners?.n ?? 0,
    companyAssignments: await count(companyAssignments),
    companyEntitlements: await count(companyCourseEntitlements),
    mandatoryRules: await count(mandatoryRules),
  };
}

/**
 * Löscht einen allgemeinen Kurs samt Inhalten (Lernziele, Lektionen, Fragen, Quellen; Lernstände und Zuweisungen
 * hängen per Kaskade daran und gehen mit). Schutz: Der Kurs-Slug muss eingetippt werden; hängen Daten dran, muss das
 * zusätzlich ausdrücklich bestätigt sein; während einer Inhaltsgenerierung wird nicht gelöscht.
 */
export async function deleteCertification(input: { certificationId: string; confirmSlug: string; acknowledgeData?: boolean; actorUserId: string }): Promise<DeleteImpact> {
  const db = getDb();
  const [cert] = await db.select({ id: certifications.id, slug: certifications.slug, kind: certifications.kind, name: certifications.name }).from(certifications).where(eq(certifications.id, input.certificationId)).limit(1);
  if (!cert) throw new CertificationNotFoundError();
  if (cert.kind !== "general") throw new InternalCertificationError();
  if (input.confirmSlug !== cert.slug) throw new SlugMismatchError();

  const [running] = await db
    .select({ id: contentGenerationJobs.id })
    .from(contentGenerationJobs)
    .where(and(eq(contentGenerationJobs.certificationId, cert.id), inArray(contentGenerationJobs.status, ["queued", "running"])))
    .limit(1);
  if (running) throw new GenerationRunningError();

  const impact = await getDeleteImpact(cert.id);
  if (hasData(impact) && !input.acknowledgeData) throw new DataAttachedError(impact);
  await db.delete(certifications).where(and(eq(certifications.id, cert.id), eq(certifications.kind, "general")));
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "certification.deleted",
    targetType: "certification",
    targetId: cert.id,
    metadata: { slug: cert.slug, name: cert.name, ...impact },
  }).catch((e) => console.error("Audit-Log fehlgeschlagen:", e));
  return impact;
}
