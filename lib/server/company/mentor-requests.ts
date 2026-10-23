import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyAssignments,
  mentorRequests,
  onboardingPlans,
  onboardings,
  users,
  type CompanyRole,
  type MentorRequestStatus,
} from "@/lib/server/db/schema";
import { appUrl, getMailConfig } from "@/lib/server/mail/config";
import { sendMail } from "@/lib/server/mail/mailer";
import { mentorRequestMessage } from "@/lib/server/mail/templates";

/**
 * „Mentor fragen“ / „Ich hänge fest“: nur durch die lernende Person ausgelöst. Die Person sieht und bearbeitet die Zusammenfassung vor
 * dem Senden; der Server speichert genau diesen Text und sonst nichts (keine Fehlversuche, Antworten oder Lernzeit). Zugestellt wird an
 * den Mentor des Onboarding-Plans der Person: als Anfrage im Firmenbereich, zusätzlich als Hinweis-Mail ohne Inhalt, wenn Versand eingerichtet ist.
 */

export const MAX_TOPIC = 200;
export const MAX_MESSAGE = 2000;
export const MIN_MESSAGE = 10;
export const MAX_ANSWER = 1000;
/** Kennzahlen für die Firma erst ab so vielen verschiedenen Fragenden. */
export const STATS_MIN_ASKERS = 5;

export class InvalidMentorRequestError extends Error {}
export class NoMentorError extends Error {}
export class MentorRequestNotFoundError extends Error {}
export class AlreadyAnsweredError extends Error {}
export class SelfAnswerError extends Error {}

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

/** Mentor der Person: der Mentor ihres (neuesten) Onboarding-Plans; null ohne Plan, ohne Mentor oder wenn die Person selbst Mentor ist. */
export async function findMentorUserId(organizationId: string, userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ mentorUserId: onboardingPlans.mentorUserId })
    .from(onboardings)
    .innerJoin(onboardingPlans, eq(onboardingPlans.id, onboardings.planId))
    .where(and(eq(onboardings.organizationId, organizationId), eq(onboardings.userId, userId), isNull(onboardingPlans.archivedAt)))
    .orderBy(desc(onboardings.startedAt))
    .limit(1);
  const mentor = row?.mentorUserId ?? null;
  return mentor && mentor !== userId ? mentor : null;
}

export async function createMentorRequest(input: {
  organizationId: string;
  userId: string;
  certificationId?: string | null;
  topic: string;
  message: string;
}): Promise<{ id: string }> {
  const topic = clean(input.topic);
  const message = clean(input.message);
  if (!topic || topic.length > MAX_TOPIC || message.length < MIN_MESSAGE || message.length > MAX_MESSAGE) throw new InvalidMentorRequestError();
  const db = getDb();
  const mentorUserId = await findMentorUserId(input.organizationId, input.userId);
  if (!mentorUserId) throw new NoMentorError();

  // Der Lernpfad zählt nur, wenn er der Person zugewiesen ist.
  let certificationId: string | null = null;
  if (input.certificationId) {
    const [assigned] = await db
      .select({ id: companyAssignments.id })
      .from(companyAssignments)
      .where(and(eq(companyAssignments.organizationId, input.organizationId), eq(companyAssignments.userId, input.userId), eq(companyAssignments.certificationId, input.certificationId)))
      .limit(1);
    certificationId = assigned ? input.certificationId : null;
  }
  const [row] = await db
    .insert(mentorRequests)
    .values({ organizationId: input.organizationId, userId: input.userId, mentorUserId, certificationId, topic, message })
    .returning({ id: mentorRequests.id });
  void notifyMentor(mentorUserId, input.userId, topic);
  return row;
}

/** Hinweis-Mail ohne Inhalt; Fehler und fehlender Versand ändern nichts an der gespeicherten Anfrage. */
async function notifyMentor(mentorUserId: string, learnerUserId: string, topic: string): Promise<void> {
  try {
    const config = getMailConfig();
    if (!config) return;
    const [mentor] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, mentorUserId)).limit(1);
    const [learner] = await getDb().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, learnerUserId)).limit(1);
    if (!mentor) return;
    await sendMail(mentorRequestMessage(mentor.email, { learner: learner?.name ?? learner?.email ?? "Eine lernende Person", topic, link: appUrl("/company", config) }));
  } catch (err) {
    console.error("Benachrichtigung zur Mentor-Anfrage fehlgeschlagen:", err);
  }
}

export interface MentorRequestView {
  id: string;
  learner: string;
  topic: string;
  message: string;
  learningPath: string | null;
  createdAt: Date;
}

/** Offene Anfragen: der Mentor sieht seine, der Firmen-Admin die der ganzen Firma. */
export async function listOpenMentorRequests(organizationId: string, userId: string, role: CompanyRole): Promise<MentorRequestView[]> {
  if (role === "learner") return [];
  const rows = await getDb()
    .select({
      id: mentorRequests.id,
      learnerName: users.name,
      learnerEmail: users.email,
      topic: mentorRequests.topic,
      message: mentorRequests.message,
      learningPath: certifications.name,
      createdAt: mentorRequests.createdAt,
    })
    .from(mentorRequests)
    .innerJoin(users, eq(users.id, mentorRequests.userId))
    .leftJoin(certifications, eq(certifications.id, mentorRequests.certificationId))
    .where(and(eq(mentorRequests.organizationId, organizationId), eq(mentorRequests.status, "open"), role === "mentor" ? eq(mentorRequests.mentorUserId, userId) : undefined))
    .orderBy(asc(mentorRequests.createdAt));
  return rows.map((r) => ({ id: r.id, learner: r.learnerName ?? r.learnerEmail, topic: r.topic, message: r.message, learningPath: r.learningPath, createdAt: r.createdAt }));
}

/** Mentor (Empfänger) oder Firmen-Admin markiert die Anfrage als beantwortet, optional mit kurzer Antwort. */
export async function answerMentorRequest(input: { organizationId: string; requestId: string; userId: string; role: CompanyRole; note?: string | null }): Promise<void> {
  const note = clean(input.note);
  if (note.length > MAX_ANSWER) throw new InvalidMentorRequestError();
  const db = getDb();
  const [request] = await db
    .select()
    .from(mentorRequests)
    .where(and(eq(mentorRequests.id, input.requestId), eq(mentorRequests.organizationId, input.organizationId)))
    .limit(1);
  const allowed = request && (input.role === "company_admin" || (input.role === "mentor" && request.mentorUserId === input.userId));
  if (!request || !allowed) throw new MentorRequestNotFoundError();
  if (request.userId === input.userId) throw new SelfAnswerError();
  if (request.status === "answered") throw new AlreadyAnsweredError();
  await db
    .update(mentorRequests)
    .set({ status: "answered", answerNote: note || null, answeredByUserId: input.userId, answeredAt: new Date() })
    .where(and(eq(mentorRequests.id, request.id), eq(mentorRequests.status, "open")));
}

export interface MyMentorRequest {
  id: string;
  topic: string;
  status: MentorRequestStatus;
  answerNote: string | null;
  createdAt: Date;
}

export async function listMyMentorRequests(organizationId: string, userId: string, limit = 5): Promise<MyMentorRequest[]> {
  return getDb()
    .select({ id: mentorRequests.id, topic: mentorRequests.topic, status: mentorRequests.status, answerNote: mentorRequests.answerNote, createdAt: mentorRequests.createdAt })
    .from(mentorRequests)
    .where(and(eq(mentorRequests.organizationId, organizationId), eq(mentorRequests.userId, userId)))
    .orderBy(desc(mentorRequests.createdAt))
    .limit(limit);
}

export interface MentorRequestStats {
  requests: number;
  answered: number;
  /** Median in Stunden; null, solange nichts beantwortet ist. */
  medianHoursToAnswer: number | null;
}

/** Anonyme Kennzahl je Firma: nur ab `STATS_MIN_ASKERS` verschiedenen Fragenden, sonst null. Keine Namen, keine Inhalte. */
export async function mentorRequestStats(organizationId: string): Promise<MentorRequestStats | null> {
  const [row] = await getDb()
    .select({
      askers: sql<number>`count(distinct ${mentorRequests.userId})::int`,
      requests: sql<number>`count(*)::int`,
      answered: sql<number>`count(*) filter (where ${mentorRequests.status} = 'answered')::int`,
      median: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${mentorRequests.answeredAt} - ${mentorRequests.createdAt})) / 3600) filter (where ${mentorRequests.answeredAt} is not null)`,
    })
    .from(mentorRequests)
    .where(eq(mentorRequests.organizationId, organizationId));
  if (!row || Number(row.askers) < STATS_MIN_ASKERS) return null;
  return { requests: Number(row.requests), answered: Number(row.answered), medianHoursToAnswer: row.median === null ? null : Math.round(Number(row.median) * 10) / 10 };
}
