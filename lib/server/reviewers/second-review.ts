import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { pickSample, pickSecondReviewer, sampleSize, secondReviewShare } from "@/lib/reviewers/second-review";
import { buildSolution } from "@/lib/questions/answer-formats";
import { getDb } from "@/lib/server/db/client";
import { certifications, courseApprovals, courseReviewers, questionOptions, questions, secondReviews, users } from "@/lib/server/db/schema";
import type { ReviewQuestion } from "./course-view";

/**
 * Zweitprüfung als Stichprobe (docs/roadmaps/archiv/roadmap_pruefer.md, Phase 6): bei jeder Freigabe wird ein Anteil der Fragen einem zweiten Prüfer
 * des Kurses vorgelegt. Er sieht Frage, Lösung und Erklärung und urteilt „stimmt“ oder „stimmt nicht“ (mit Begründung). Abweichungen landen beim Admin,
 * eine automatische Folge gibt es nicht. Die Auswahl steht in lib/reviewers/second-review.ts.
 */

/** Legt die Stichprobe zu einer Freigabe an (idempotent). Gibt die Zahl der neu angelegten Einträge zurück. */
export async function createSecondReviewSample(approvalId: string, share: number = secondReviewShare()): Promise<number> {
  const db = getDb();
  const [approval] = await db.select().from(courseApprovals).where(eq(courseApprovals.id, approvalId)).limit(1);
  if (!approval || approval.kind !== "approval") return 0;
  const questionIds = Object.keys(approval.fingerprints.questions);
  const picked = pickSample(approval.id, questionIds, sampleSize(questionIds.length, share));
  if (picked.length === 0) return 0;
  const reviewers = await db.select({ userId: courseReviewers.userId }).from(courseReviewers).where(eq(courseReviewers.certificationId, approval.certificationId));
  const second = pickSecondReviewer(approval.id, reviewers.map((r) => r.userId), approval.reviewerUserId);
  const rows = await db
    .insert(secondReviews)
    .values(picked.map((questionId) => ({ approvalId: approval.id, questionId, reviewerUserId: second })))
    .onConflictDoNothing()
    .returning({ id: secondReviews.id });
  return rows.length;
}

/** Wird ein Prüfer einem Kurs zugewiesen: offene Stichproben ohne zweiten Prüfer bekommen ihn (nicht den Freigebenden der jeweiligen Freigabe). */
export async function assignUnassignedSamples(certificationId: string, reviewerUserId: string): Promise<number> {
  const db = getDb();
  const open = await db
    .select({ id: secondReviews.id, approverUserId: courseApprovals.reviewerUserId })
    .from(secondReviews)
    .innerJoin(courseApprovals, eq(courseApprovals.id, secondReviews.approvalId))
    .where(and(eq(courseApprovals.certificationId, certificationId), isNull(secondReviews.reviewerUserId), eq(secondReviews.status, "pending")));
  const eligible = open.filter((o) => o.approverUserId !== reviewerUserId).map((o) => o.id);
  if (eligible.length === 0) return 0;
  const rows = await db.update(secondReviews).set({ reviewerUserId }).where(inArray(secondReviews.id, eligible)).returning({ id: secondReviews.id });
  return rows.length;
}

export interface SecondReviewItem {
  id: string;
  courseName: string;
  versionLabel: string;
  question: ReviewQuestion;
}

/** Die offenen Zweitprüfungen einer Person, älteste zuerst. */
export async function listPendingSecondReviews(reviewerUserId: string): Promise<SecondReviewItem[]> {
  const db = getDb();
  const rows = await db
    .select({ id: secondReviews.id, questionId: secondReviews.questionId, versionLabel: courseApprovals.versionLabel, courseName: certifications.name })
    .from(secondReviews)
    .innerJoin(courseApprovals, eq(courseApprovals.id, secondReviews.approvalId))
    .innerJoin(certifications, eq(certifications.id, courseApprovals.certificationId))
    .where(and(eq(secondReviews.reviewerUserId, reviewerUserId), eq(secondReviews.status, "pending")))
    .orderBy(asc(secondReviews.createdAt), asc(secondReviews.id));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.questionId);
  const [qs, opts] = await Promise.all([
    db.select({ id: questions.id, humanId: questions.humanId, question: questions.question, explanation: questions.explanation, answerFormat: questions.answerFormat, answerData: questions.answerData }).from(questions).where(inArray(questions.id, ids)),
    db.select().from(questionOptions).where(inArray(questionOptions.questionId, ids)).orderBy(asc(questionOptions.orderNum)),
  ]);
  return rows.flatMap((r) => {
    const q = qs.find((x) => x.id === r.questionId);
    if (!q) return [];
    const question: ReviewQuestion = {
      id: q.id,
      humanId: q.humanId,
      question: q.question,
      explanation: q.explanation,
      options: opts.filter((o) => o.questionId === q.id).map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, rationale: o.rationale ?? null })),
      ...(q.answerFormat !== "choice" && q.answerData ? { solution: buildSolution(q.answerFormat, q.answerData) } : {}),
    };
    return [{ id: r.id, courseName: r.courseName, versionLabel: r.versionLabel, question }];
  });
}

export async function countPendingSecondReviews(reviewerUserId: string): Promise<number> {
  const rows = await getDb().select({ id: secondReviews.id }).from(secondReviews).where(and(eq(secondReviews.reviewerUserId, reviewerUserId), eq(secondReviews.status, "pending")));
  return rows.length;
}

export type DecideResult = "ok" | "not_found" | "already_decided" | "comment_required";

/** Das Urteil des zweiten Prüfers. Nur der zugewiesene Prüfer, nur einmal; „stimmt nicht“ braucht eine Begründung. */
export async function decideSecondReview(input: { id: string; reviewerUserId: string; verdict: "agree" | "disagree"; comment?: string | null; now?: Date }): Promise<DecideResult> {
  const comment = input.comment?.trim() || null;
  if (input.verdict === "disagree" && (!comment || comment.length < 3)) return "comment_required";
  const [row] = await getDb().select().from(secondReviews).where(and(eq(secondReviews.id, input.id), eq(secondReviews.reviewerUserId, input.reviewerUserId))).limit(1);
  if (!row) return "not_found";
  if (row.status !== "pending") return "already_decided";
  const updated = await getDb()
    .update(secondReviews)
    .set({ status: input.verdict === "agree" ? "agreed" : "deviated", comment: comment ? comment.slice(0, 2000) : null, decidedAt: input.now ?? new Date() })
    .where(and(eq(secondReviews.id, input.id), eq(secondReviews.status, "pending")))
    .returning({ id: secondReviews.id });
  return updated.length > 0 ? "ok" : "already_decided";
}

export interface SecondReviewOverview {
  agreed: number;
  pending: number;
  /** Stichproben, denen noch kein zweiter Prüfer zugewiesen ist (der Kurs hat nur einen Prüfer). */
  unassigned: number;
  deviations: Array<{ id: string; courseName: string; versionLabel: string; questionId: string; questionHumanId: string; secondReviewerName: string | null; comment: string | null; decidedAt: Date | null }>;
}

/** Für Admins: Stand der Zweitprüfungen und die Abweichungen (neueste zuerst, höchstens 50). */
export async function getSecondReviewOverview(): Promise<SecondReviewOverview> {
  const db = getDb();
  const all = await db.select({ status: secondReviews.status, reviewerUserId: secondReviews.reviewerUserId }).from(secondReviews);
  const deviationRows = await db
    .select({ id: secondReviews.id, comment: secondReviews.comment, decidedAt: secondReviews.decidedAt, questionId: secondReviews.questionId, humanId: questions.humanId, versionLabel: courseApprovals.versionLabel, courseName: certifications.name, reviewerName: users.name, reviewerEmail: users.email })
    .from(secondReviews)
    .innerJoin(courseApprovals, eq(courseApprovals.id, secondReviews.approvalId))
    .innerJoin(certifications, eq(certifications.id, courseApprovals.certificationId))
    .innerJoin(questions, eq(questions.id, secondReviews.questionId))
    .leftJoin(users, eq(users.id, secondReviews.reviewerUserId))
    .where(eq(secondReviews.status, "deviated"))
    .orderBy(desc(secondReviews.decidedAt), desc(secondReviews.id))
    .limit(50);
  return {
    agreed: all.filter((r) => r.status === "agreed").length,
    pending: all.filter((r) => r.status === "pending").length,
    unassigned: all.filter((r) => r.status === "pending" && r.reviewerUserId === null).length,
    deviations: deviationRows.map((r) => ({ id: r.id, courseName: r.courseName, versionLabel: r.versionLabel, questionId: r.questionId, questionHumanId: r.humanId, secondReviewerName: r.reviewerName ?? r.reviewerEmail ?? null, comment: r.comment, decidedAt: r.decidedAt })),
  };
}
