import { and, count, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, feedbackReports, objectives, sections, type FeedbackCategory, type FeedbackStatus } from "@/lib/server/db/schema";

export class FeedbackInvalidError extends Error {}
export class FeedbackRateLimitError extends Error {}

export const FEEDBACK_MAX_LENGTH = 2000;
export const FEEDBACK_MIN_LENGTH = 5;
/** Höchstens so viele Meldungen je Person und 24 Stunden (Schutz vor Missbrauch). */
export const FEEDBACK_DAILY_LIMIT = 10;

export interface FeedbackInput {
  userId: string;
  certificationId: string;
  domainId?: string | null;
  sectionId?: string | null;
  category: FeedbackCategory;
  message: string;
}

/**
 * Meldung speichern. Kapitel und Lektion müssen zum Kurs gehören (der Kontext ist sonst wertlos); fehlt das Kapitel bei einer Lektion,
 * wird es aus der Lektion abgeleitet. Interne Lernpfade einer Firma nimmt der Betreiber nicht entgegen (der Aufrufer prüft das).
 */
export async function submitFeedback(input: FeedbackInput, now: Date = new Date()): Promise<{ id: string }> {
  const db = getDb();
  const message = input.message.trim();
  if (message.length < FEEDBACK_MIN_LENGTH || message.length > FEEDBACK_MAX_LENGTH) throw new FeedbackInvalidError("Bitte beschreibe das Problem kurz (mindestens ein paar Wörter).");
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const [{ n }] = await db.select({ n: count() }).from(feedbackReports).where(and(eq(feedbackReports.reporterUserId, input.userId), gt(feedbackReports.createdAt, since)));
  if (Number(n) >= FEEDBACK_DAILY_LIMIT) throw new FeedbackRateLimitError();

  let domainId = input.domainId ?? null;
  const sectionId = input.sectionId ?? null;
  if (sectionId) {
    const [row] = await db
      .select({ domainId: domains.id, certificationId: domains.certificationId })
      .from(sections)
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(sections.id, sectionId))
      .limit(1);
    if (!row || row.certificationId !== input.certificationId) throw new FeedbackInvalidError("Die Lektion gehört nicht zu diesem Kurs.");
    if (domainId && domainId !== row.domainId) throw new FeedbackInvalidError("Lektion und Kapitel passen nicht zusammen.");
    domainId = row.domainId;
  } else if (domainId) {
    const [row] = await db.select({ certificationId: domains.certificationId }).from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!row || row.certificationId !== input.certificationId) throw new FeedbackInvalidError("Das Kapitel gehört nicht zu diesem Kurs.");
  }
  const [row] = await db
    .insert(feedbackReports)
    .values({ reporterUserId: input.userId, certificationId: input.certificationId, domainId, sectionId, category: input.category, message })
    .returning({ id: feedbackReports.id });
  return { id: row.id };
}

export interface FeedbackView {
  id: string;
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  createdAt: Date;
  domainName: string | null;
  sectionTitle: { de: string; en: string } | null;
  sectionId: string | null;
  courseSlug: string;
}

/** Offene Meldungen eines Kurses, neueste zuerst; ohne Angaben zur meldenden Person (die Rückmeldung zählt, nicht wer sie schrieb). */
export async function listOpenFeedback(certificationId: string): Promise<FeedbackView[]> {
  return getDb()
    .select({
      id: feedbackReports.id,
      category: feedbackReports.category,
      message: feedbackReports.message,
      status: feedbackReports.status,
      createdAt: feedbackReports.createdAt,
      domainName: domains.name,
      sectionTitle: sections.title,
      sectionId: feedbackReports.sectionId,
      courseSlug: certifications.slug,
    })
    .from(feedbackReports)
    .innerJoin(certifications, eq(certifications.id, feedbackReports.certificationId))
    .leftJoin(domains, eq(domains.id, feedbackReports.domainId))
    .leftJoin(sections, eq(sections.id, feedbackReports.sectionId))
    .where(and(eq(feedbackReports.certificationId, certificationId), eq(feedbackReports.status, "open")))
    .orderBy(desc(feedbackReports.createdAt));
}

export class FeedbackNotFoundError extends Error {}

export async function resolveFeedback(id: string, resolverUserId: string, status: Exclude<FeedbackStatus, "open">): Promise<void> {
  const rows = await getDb()
    .update(feedbackReports)
    .set({ status, resolvedByUserId: resolverUserId, resolvedAt: new Date() })
    .where(and(eq(feedbackReports.id, id), eq(feedbackReports.status, "open")))
    .returning({ id: feedbackReports.id });
  if (rows.length === 0) throw new FeedbackNotFoundError();
}
