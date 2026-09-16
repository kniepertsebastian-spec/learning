import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  contentReports,
  domains,
  objectives,
  questions,
  type ContentReportReason,
  type ContentReportStatus,
  type ContentReportTargetType,
} from "@/lib/server/db/schema";
import type { Localized } from "@/lib/types";

export class ContentReportNotFoundError extends Error {}

/**
 * R6 (roadmap.md): "Inhalte als falsch, unklar oder veraltet melden" - jede
 * Meldung ist ein eigenständiges Signal (siehe Schema-Kommentar auf
 * contentReports), daher ein reiner Insert statt eines Upserts wie bei
 * sessionRecommendationFeedback.
 */
export async function reportContent(input: {
  reporterUserId: string;
  targetType: ContentReportTargetType;
  targetId: string;
  reason: ContentReportReason;
}): Promise<void> {
  await getDb().insert(contentReports).values({
    reporterUserId: input.reporterUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
  });
}

export interface OpenQuestionReport {
  id: string;
  reason: ContentReportReason;
  createdAt: Date;
  questionId: string;
  humanId: string;
  question: Localized<string>;
}

/**
 * R6: "Review-Queue" - offene Fragen-Meldungen für eine Zertifizierung,
 * neueste zuerst. Bewusst auf Fragen beschränkt (noch keine Lesson-Melde-UI,
 * siehe QuizQuestionCard) - Lesson-Meldungen werden bei Bedarf ergänzt, statt
 * hier spekulativ mit abgefragt zu werden.
 */
export async function listOpenQuestionReports(certificationId: string): Promise<OpenQuestionReport[]> {
  const rows = await getDb()
    .select({
      id: contentReports.id,
      reason: contentReports.reason,
      createdAt: contentReports.createdAt,
      questionId: questions.id,
      humanId: questions.humanId,
      question: questions.question,
    })
    .from(contentReports)
    .innerJoin(questions, eq(questions.id, contentReports.targetId))
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(
      and(
        eq(contentReports.targetType, "question"),
        eq(contentReports.status, "open"),
        eq(domains.certificationId, certificationId),
      ),
    )
    .orderBy(desc(contentReports.createdAt));
  return rows;
}

/** R6: Admin entscheidet je gemeldetem Eintrag "erledigt" oder "verworfen" -
 * beides schließt die Meldung ab (verlässt die offene Queue), der
 * Unterschied ist rein informativ für spätere Auswertung. */
export async function resolveContentReport(
  reportId: string,
  resolverUserId: string,
  status: Extract<ContentReportStatus, "resolved" | "dismissed">,
): Promise<void> {
  const result = await getDb()
    .update(contentReports)
    .set({ status, resolvedByUserId: resolverUserId, resolvedAt: new Date() })
    .where(and(eq(contentReports.id, reportId), eq(contentReports.status, "open")))
    .returning({ id: contentReports.id });
  if (result.length === 0) {
    throw new ContentReportNotFoundError(`Offene Meldung ${reportId} nicht gefunden.`);
  }
}
