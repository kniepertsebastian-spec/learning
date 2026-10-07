import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  domains,
  examAttempts,
  exams,
  lessons,
  objectives,
  questions,
  sections,
  studySessions,
  users,
} from "@/lib/server/db/schema";
import { canViewCertification, type Viewer } from "./visibility";

/**
 * Sichtbarkeit für die Lern-APIs (/api/progress, exams, study-profile, cert, sections, remediation,
 * study-sessions, sync, content-reports). Die Seiten unter /cert prüfen sie im Layout; die IDs der
 * APIs sind UUIDs und nicht geheim, deshalb gilt dieselbe Regel (canViewCertification) auch hier:
 * Lernpfade vor der fachlichen Freigabe und interne Lernpfade anderer Firmen sind „nicht vorhanden“.
 *
 * Die Funktionen antworten mit `true` = gesperrt NUR für ein vorhandenes, aber nicht sichtbares Ziel.
 * Fehlt das Ziel oder ist die ID keine UUID, bleibt es bei der bisherigen Fehlerbehandlung der Route
 * (404 bzw. Validierung), damit sich nichts ändert und nichts verraten wird.
 */
type CertRow = Parameters<typeof canViewCertification>[1];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function viewerFor(userId: string): Promise<Viewer> {
  const [user] = await getDb().select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

async function hiddenFrom(userId: string, cert: CertRow | undefined): Promise<boolean> {
  if (!cert) return false;
  return !(await canViewCertification(await viewerFor(userId), cert));
}

const certColumns = {
  kind: certifications.kind,
  ownerOrganizationId: certifications.ownerOrganizationId,
  catalogStatus: certifications.catalogStatus,
};

/** Lernpfad nach ID (certifications.id). */
export async function isCertificationHidden(userId: string, certId: string): Promise<boolean> {
  if (!UUID_RE.test(certId)) return false;
  const [cert] = await getDb().select(certColumns).from(certifications).where(eq(certifications.id, certId)).limit(1);
  return hiddenFrom(userId, cert);
}

/** Lernziel (objectives.id) → Lernpfad. */
export async function isObjectiveHidden(userId: string, objectiveId: string): Promise<boolean> {
  if (!UUID_RE.test(objectiveId)) return false;
  const [cert] = await getDb()
    .select(certColumns)
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(certifications, eq(certifications.id, domains.certificationId))
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  return hiddenFrom(userId, cert);
}

/** Abschnitt (sections.id) → Lernpfad. */
export async function isSectionHidden(userId: string, sectionId: string): Promise<boolean> {
  if (!UUID_RE.test(sectionId)) return false;
  const [cert] = await getDb()
    .select(certColumns)
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(certifications, eq(certifications.id, domains.certificationId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  return hiddenFrom(userId, cert);
}

/** Lernsitzung (study_sessions.id) → Lernpfad. */
export async function isStudySessionHidden(userId: string, sessionId: string): Promise<boolean> {
  if (!UUID_RE.test(sessionId)) return false;
  const [cert] = await getDb()
    .select(certColumns)
    .from(studySessions)
    .innerJoin(certifications, eq(certifications.id, studySessions.certificationId))
    .where(eq(studySessions.id, sessionId))
    .limit(1);
  return hiddenFrom(userId, cert);
}

/** Prüfung (exams.id) → Lernpfad. Die Prüfungs-Routen tragen die certId im Pfad, entscheidend ist aber die Prüfung selbst. */
export async function isExamHidden(userId: string, examId: string): Promise<boolean> {
  if (!UUID_RE.test(examId)) return false;
  const [cert] = await getDb()
    .select(certColumns)
    .from(exams)
    .innerJoin(certifications, eq(certifications.id, exams.certificationId))
    .where(eq(exams.id, examId))
    .limit(1);
  return hiddenFrom(userId, cert);
}

/** Prüfungsversuch (exam_attempts.id) → Lernpfad. */
export async function isExamAttemptHidden(userId: string, attemptId: string): Promise<boolean> {
  if (!UUID_RE.test(attemptId)) return false;
  const [cert] = await getDb()
    .select(certColumns)
    .from(examAttempts)
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .innerJoin(certifications, eq(certifications.id, exams.certificationId))
    .where(eq(examAttempts.id, attemptId))
    .limit(1);
  return hiddenFrom(userId, cert);
}

/** Frage oder Lektion → Lernpfad (für Inhaltsmeldungen). `internal` = gehört zu einem internen Lernpfad. */
export async function resolveContentTarget(
  userId: string,
  targetType: "question" | "lesson",
  targetId: string,
): Promise<"missing" | "hidden" | "internal" | "ok"> {
  const db = getDb();
  const base = targetType === "question"
    ? db.select(certColumns).from(questions).innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    : db
        .select(certColumns)
        .from(lessons)
        .innerJoin(sections, eq(sections.id, lessons.sectionId))
        .innerJoin(objectives, eq(objectives.id, sections.objectiveId));
  const [cert] = await base
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(certifications, eq(certifications.id, domains.certificationId))
    .where(eq(targetType === "question" ? questions.id : lessons.id, targetId))
    .limit(1);
  if (!cert) return "missing";
  if (await hiddenFrom(userId, cert)) return "hidden";
  return cert.kind === "internal" ? "internal" : "ok";
}
