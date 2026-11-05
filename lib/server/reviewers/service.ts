/**
 * Fachliche Prüfer (roadmap_pruefer Phase 1): Rolle `reviewer`, Einladung durch einen Admin, Zuweisung je allgemeinem Kurs.
 * Ein Prüfer sieht nur seine zugewiesenen allgemeinen Kurse (nie interne Lernpfade, nie Lerndaten) und ist an keine Firma gebunden.
 */
import { assignUnassignedSamples } from "./second-review";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  courseReviewers,
  domains,
  objectives,
  questions,
  reviewerComments,
  reviewerInvitations,
  sections,
  users,
  type ReviewerCommentKind,
  type ReviewerCommentTarget,
} from "@/lib/server/db/schema";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { normalizeEmail } from "@/lib/server/email";

export const REVIEWER_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_COMMENT_LENGTH = 2000;

export class ReviewerError extends Error {}
export class NotAGeneralCourseError extends ReviewerError {}
export class NotAReviewerError extends ReviewerError {}
export class InvalidCommentError extends ReviewerError {}
export class TargetNotInCourseError extends ReviewerError {}
/** Ein Prüfer ist exklusiv genau einem Kurs zugewiesen: erst die bestehende Zuweisung aufheben. */
export class ReviewerAlreadyAssignedError extends ReviewerError {}
/** Eine Einladung gilt für genau einen Kurs. */
export class InvalidInvitationError extends ReviewerError {}

const logAuditFailure = (err: unknown) => console.error("Audit-Log fehlgeschlagen:", err);
export const hashReviewerToken = (token: string) => createHash("sha256").update(token).digest("hex");

/* ------------------------------------------------------------------ Zugriff */

/** Darf diese Person diesen Kurs prüfen? Rolle `reviewer`, Zuweisung und ein allgemeiner Kurs; sonst nein (Admins prüfen über die Admin-Werkstatt). */
export async function canReviewCourse(userId: string, certificationId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: courseReviewers.id })
    .from(courseReviewers)
    .innerJoin(users, eq(users.id, courseReviewers.userId))
    .innerJoin(certifications, eq(certifications.id, courseReviewers.certificationId))
    .where(and(eq(courseReviewers.userId, userId), eq(courseReviewers.certificationId, certificationId), eq(users.role, "reviewer"), eq(certifications.kind, "general")))
    .limit(1);
  return Boolean(row);
}

export type AssignedCourse = { id: string; slug: string; name: string; catalogStatus: "draft" | "in_review" | "approved" };

/** Die zugewiesenen allgemeinen Kurse einer Person mit Rolle `reviewer`. */
export async function listAssignedCourses(userId: string): Promise<AssignedCourse[]> {
  return getDb()
    .select({ id: certifications.id, slug: certifications.slug, name: certifications.name, catalogStatus: certifications.catalogStatus })
    .from(courseReviewers)
    .innerJoin(users, eq(users.id, courseReviewers.userId))
    .innerJoin(certifications, eq(certifications.id, courseReviewers.certificationId))
    .where(and(eq(courseReviewers.userId, userId), eq(users.role, "reviewer"), eq(certifications.kind, "general")))
    .orderBy(asc(certifications.name));
}

/* ------------------------------------------------------------------ Zuweisung */

async function requireGeneralCourses(ids: string[]) {
  if (ids.length === 0) return;
  const rows = await getDb().select({ id: certifications.id, kind: certifications.kind }).from(certifications).where(inArray(certifications.id, ids));
  if (rows.length !== new Set(ids).size || rows.some((r) => r.kind !== "general")) throw new NotAGeneralCourseError();
}

/** Weist einen Prüfer einem allgemeinen Kurs zu (nie einem internen Lernpfad), exklusiv: hat er schon einen anderen Kurs, wird nichts geändert. Idempotent. */
export async function assignReviewer(input: { certificationId: string; userId: string; assignedByUserId: string }): Promise<void> {
  await requireGeneralCourses([input.certificationId]);
  const [user] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user || user.role !== "reviewer") throw new NotAReviewerError();
  const [existing] = await getDb().select({ certificationId: courseReviewers.certificationId }).from(courseReviewers).where(eq(courseReviewers.userId, input.userId)).limit(1);
  if (existing && existing.certificationId !== input.certificationId) throw new ReviewerAlreadyAssignedError();
  await getDb().insert(courseReviewers).values({ certificationId: input.certificationId, userId: input.userId, assignedByUserId: input.assignedByUserId }).onConflictDoNothing();
  await assignUnassignedSamples(input.certificationId, input.userId).catch((error) => console.error("Offene Zweitprüfungen konnten nicht zugewiesen werden:", error));
  await recordAuditEvent({ actorUserId: input.assignedByUserId, action: "reviewer.assigned", targetType: "certification", targetId: input.certificationId, metadata: { reviewerUserId: input.userId } }).catch(logAuditFailure);
}

export async function unassignReviewer(input: { certificationId: string; userId: string; actorUserId: string }): Promise<boolean> {
  const rows = await getDb().delete(courseReviewers).where(and(eq(courseReviewers.certificationId, input.certificationId), eq(courseReviewers.userId, input.userId))).returning({ id: courseReviewers.id });
  if (rows.length === 0) return false;
  await recordAuditEvent({ actorUserId: input.actorUserId, action: "reviewer.unassigned", targetType: "certification", targetId: input.certificationId, metadata: { reviewerUserId: input.userId } }).catch(logAuditFailure);
  return true;
}

/* ------------------------------------------------------------------ Einladung */

/** Legt eine Einladung an (Token wird einmalig zurückgegeben, gespeichert wird nur der Hash). Eine offene Einladung derselben E-Mail wird widerrufen. */
export async function createReviewerInvitation(input: { email: string; certificationIds: string[]; createdByUserId: string; now?: Date }): Promise<{ id: string; token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  const certificationIds = [...new Set(input.certificationIds)];
  if (certificationIds.length !== 1) throw new InvalidInvitationError();
  await requireGeneralCourses(certificationIds);
  const token = randomBytes(32).toString("base64url");
  const db = getDb();
  const row = await db.transaction(async (tx) => {
    await tx.update(reviewerInvitations).set({ revokedAt: now }).where(and(eq(reviewerInvitations.email, email), isNull(reviewerInvitations.acceptedAt), isNull(reviewerInvitations.revokedAt)));
    const [inserted] = await tx
      .insert(reviewerInvitations)
      .values({ email, tokenHash: hashReviewerToken(token), certificationIds, expiresAt: new Date(now.getTime() + REVIEWER_INVITATION_TTL_MS), createdByUserId: input.createdByUserId })
      .returning({ id: reviewerInvitations.id, expiresAt: reviewerInvitations.expiresAt });
    return inserted;
  });
  await recordAuditEvent({ actorUserId: input.createdByUserId, action: "reviewer_invitation.created", targetType: "reviewer_invitation", targetId: row.id, metadata: { courses: certificationIds.length } }).catch(logAuditFailure);
  return { id: row.id, token, expiresAt: row.expiresAt };
}

export async function revokeReviewerInvitation(id: string, actorUserId: string, now: Date = new Date()): Promise<boolean> {
  const rows = await getDb().update(reviewerInvitations).set({ revokedAt: now }).where(and(eq(reviewerInvitations.id, id), isNull(reviewerInvitations.acceptedAt), isNull(reviewerInvitations.revokedAt))).returning({ id: reviewerInvitations.id });
  if (rows.length === 0) return false;
  await recordAuditEvent({ actorUserId, action: "reviewer_invitation.revoked", targetType: "reviewer_invitation", targetId: id }).catch(logAuditFailure);
  return true;
}

const openInvitation = (now: Date) => and(isNull(reviewerInvitations.acceptedAt), isNull(reviewerInvitations.revokedAt), gt(reviewerInvitations.expiresAt, now));

/** Hat diese E-Mail eine offene Prüfer-Einladung? (Lässt die Registrierung zu.) */
export async function hasPendingReviewerInvitationForEmail(email: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await getDb().select({ id: reviewerInvitations.id }).from(reviewerInvitations).where(and(eq(reviewerInvitations.email, normalizeEmail(email)), openInvitation(now))).limit(1);
  return Boolean(row);
}

/** Vorschau für die öffentliche Einladungsseite. Unbekannt, benutzt, widerrufen und abgelaufen sehen von außen gleich aus (null). */
export async function getReviewerInvitationPreview(token: string, now: Date = new Date()): Promise<{ email: string; courses: string[] } | null> {
  const [row] = await getDb().select().from(reviewerInvitations).where(and(eq(reviewerInvitations.tokenHash, hashReviewerToken(token)), openInvitation(now))).limit(1);
  if (!row) return null;
  const courses = row.certificationIds.length ? await getDb().select({ name: certifications.name }).from(certifications).where(inArray(certifications.id, row.certificationIds)) : [];
  return { email: row.email, courses: courses.map((c) => c.name) };
}

export type AcceptReviewerResult = { ok: true; courses: number } | { ok: false; reason: "invalid" | "email_mismatch" };

/** Nimmt eine Einladung an: Die angemeldete Person muss genau die eingeladene E-Mail haben. Sie wird Prüfer (Admins bleiben Admin) und bekommt die Kurse zugewiesen. */
export async function acceptReviewerInvitation(token: string, userId: string, now: Date = new Date()): Promise<AcceptReviewerResult> {
  const db = getDb();
  const [invitation] = await db.select().from(reviewerInvitations).where(and(eq(reviewerInvitations.tokenHash, hashReviewerToken(token)), openInvitation(now))).limit(1);
  if (!invitation) return { ok: false, reason: "invalid" };
  const [user] = await db.select({ email: users.email, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || normalizeEmail(user.email) !== invitation.email) return { ok: false, reason: "email_mismatch" };
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.update(reviewerInvitations).set({ acceptedAt: now }).where(and(eq(reviewerInvitations.id, invitation.id), isNull(reviewerInvitations.acceptedAt), isNull(reviewerInvitations.revokedAt))).returning({ id: reviewerInvitations.id });
    if (rows.length === 0) return false;
    if (user.role === "learner") await tx.update(users).set({ role: "reviewer" }).where(eq(users.id, userId));
    for (const certificationId of invitation.certificationIds) {
      await tx.insert(courseReviewers).values({ certificationId, userId, assignedByUserId: invitation.createdByUserId }).onConflictDoNothing();
    }
    return true;
  });
  if (!claimed) return { ok: false, reason: "invalid" };
  await recordAuditEvent({ actorUserId: userId, action: "reviewer_invitation.accepted", targetType: "reviewer_invitation", targetId: invitation.id, metadata: { courses: invitation.certificationIds.length } }).catch(logAuditFailure);
  return { ok: true, courses: invitation.certificationIds.length };
}

/* ------------------------------------------------------------------ Kommentare */

/** Gehört der Abschnitt bzw. die Frage zu diesem Kurs? */
async function targetBelongsToCourse(certificationId: string, targetType: ReviewerCommentTarget, targetId: string): Promise<boolean> {
  const db = getDb();
  if (targetType === "section") {
    const [row] = await db.select({ id: sections.id }).from(sections).innerJoin(objectives, eq(objectives.id, sections.objectiveId)).innerJoin(domains, eq(domains.id, objectives.domainId)).where(and(eq(sections.id, targetId), eq(domains.certificationId, certificationId))).limit(1);
    return Boolean(row);
  }
  const [row] = await db.select({ id: questions.id }).from(questions).innerJoin(objectives, eq(objectives.id, questions.objectiveId)).innerJoin(domains, eq(domains.id, objectives.domainId)).where(and(eq(questions.id, targetId), eq(domains.certificationId, certificationId))).limit(1);
  return Boolean(row);
}

/** Kommentar oder Fehlermeldung eines Prüfers. Die Prüfung der Zuweisung macht der Aufrufer (canReviewCourse). */
export async function addReviewerComment(input: { certificationId: string; reviewerUserId: string; targetType: ReviewerCommentTarget; targetId: string; kind: ReviewerCommentKind; text: string }): Promise<{ id: string }> {
  const text = input.text.trim();
  if (text.length < 3 || text.length > MAX_COMMENT_LENGTH) throw new InvalidCommentError();
  if (input.kind === "faulty" && input.targetType !== "question") throw new InvalidCommentError(); // „fehlerhaft“ gibt es für Fragen
  if (!(await targetBelongsToCourse(input.certificationId, input.targetType, input.targetId))) throw new TargetNotInCourseError();
  const [row] = await getDb().insert(reviewerComments).values({ certificationId: input.certificationId, reviewerUserId: input.reviewerUserId, targetType: input.targetType, targetId: input.targetId, kind: input.kind, text }).returning({ id: reviewerComments.id });
  return row;
}

export type CommentView = { id: string; certificationId: string; courseName: string; targetType: ReviewerCommentTarget; targetId: string; kind: ReviewerCommentKind; text: string; status: "open" | "resolved"; reviewerName: string | null; createdAt: Date };

/** Offene Prüfer-Kommentare für die Admin-Übersicht, neueste zuerst. */
export async function listOpenReviewerComments(): Promise<CommentView[]> {
  return getDb()
    .select({
      id: reviewerComments.id,
      certificationId: reviewerComments.certificationId,
      courseName: certifications.name,
      targetType: reviewerComments.targetType,
      targetId: reviewerComments.targetId,
      kind: reviewerComments.kind,
      text: reviewerComments.text,
      status: reviewerComments.status,
      reviewerName: users.name,
      createdAt: reviewerComments.createdAt,
    })
    .from(reviewerComments)
    .innerJoin(certifications, eq(certifications.id, reviewerComments.certificationId))
    .leftJoin(users, eq(users.id, reviewerComments.reviewerUserId))
    .where(eq(reviewerComments.status, "open"))
    .orderBy(desc(reviewerComments.createdAt));
}

/** Eigene Kommentare eines Prüfers zu einem Kurs (so sieht er, was er schon gemeldet hat und was erledigt ist). */
export async function listOwnComments(certificationId: string, reviewerUserId: string) {
  return getDb().select({ id: reviewerComments.id, targetType: reviewerComments.targetType, targetId: reviewerComments.targetId, kind: reviewerComments.kind, text: reviewerComments.text, status: reviewerComments.status, createdAt: reviewerComments.createdAt }).from(reviewerComments).where(and(eq(reviewerComments.certificationId, certificationId), eq(reviewerComments.reviewerUserId, reviewerUserId))).orderBy(desc(reviewerComments.createdAt));
}

export async function resolveReviewerComment(id: string, adminUserId: string, now: Date = new Date()): Promise<boolean> {
  const rows = await getDb().update(reviewerComments).set({ status: "resolved", resolvedByUserId: adminUserId, resolvedAt: now }).where(and(eq(reviewerComments.id, id), eq(reviewerComments.status, "open"))).returning({ id: reviewerComments.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ Admin-Übersicht */

export type ReviewerOverview = {
  reviewers: Array<{ id: string; email: string; name: string | null; courses: Array<{ id: string; name: string }> }>;
  invitations: Array<{ id: string; email: string; courses: number; expiresAt: Date }>;
};

export async function getReviewerOverview(now: Date = new Date()): Promise<ReviewerOverview> {
  const db = getDb();
  const people = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.role, "reviewer")).orderBy(asc(users.email));
  const assignments = people.length
    ? await db.select({ userId: courseReviewers.userId, id: certifications.id, name: certifications.name }).from(courseReviewers).innerJoin(certifications, eq(certifications.id, courseReviewers.certificationId)).where(inArray(courseReviewers.userId, people.map((p) => p.id))).orderBy(asc(certifications.name))
    : [];
  const open = await db.select({ id: reviewerInvitations.id, email: reviewerInvitations.email, certificationIds: reviewerInvitations.certificationIds, expiresAt: reviewerInvitations.expiresAt }).from(reviewerInvitations).where(openInvitation(now)).orderBy(asc(reviewerInvitations.createdAt));
  return {
    reviewers: people.map((p) => ({ ...p, courses: assignments.filter((a) => a.userId === p.id).map((a) => ({ id: a.id, name: a.name })) })),
    invitations: open.map((o) => ({ id: o.id, email: o.email, courses: o.certificationIds.length, expiresAt: o.expiresAt })),
  };
}
