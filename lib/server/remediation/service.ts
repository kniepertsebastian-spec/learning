import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  remediationSessions,
  objectives,
  domains,
  certifications,
  questionOptions,
  questions,
} from "@/lib/server/db/schema";
import { ObjectiveProgressService } from "@/lib/server/progress/service";
import { generateRemediationForObjective } from "@/lib/server/ai/service";

interface ObjectiveForRemediation {
  objectiveId: string;
  objectiveTitle: string;
  objectiveDescription: string;
  certificationName: string;
}

export class RemediationService {
  /**
   * Finds objectives that need remediation (mastery < 60%) for a given user.
   * Returns the objective details needed for AI generation.
   */
  static async findObjectivesNeedingRemediation(
    userId: string,
  ): Promise<ObjectiveForRemediation[]> {
    const db = getDb();

    // Get all objectives with progress < 60% (LEARNING status or poor performance)
    const needRemediationData = await db
      .select({
        objectiveId: objectives.id,
        objectiveTitle: objectives.title,
        objectiveDescription: objectives.description,
        certificationName: certifications.name,
      })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .innerJoin(certifications, eq(certifications.id, domains.certificationId))
      .where(eq(domains.certificationId, certifications.id)); // temp join for structure

    // Now filter by checking progress service for each
    const result: ObjectiveForRemediation[] = [];
    for (const obj of needRemediationData) {
      const mastery = await ObjectiveProgressService.calculateObjectiveMastery(userId, obj.objectiveId);
      if (mastery.masteryScore < 60 && mastery.totalAttempts >= 2) {
        // At least 2 attempts before suggesting remediation
        result.push({
          objectiveId: obj.objectiveId,
          objectiveTitle: obj.objectiveTitle,
          objectiveDescription: obj.objectiveDescription || "",
          certificationName: obj.certificationName,
        });
      }
    }

    return result;
  }

  /**
   * Returns an existing, unfinished remediation session for this user +
   * objective if one exists (reuses its cached content, no AI call), or
   * generates one once and persists the content. Previously this generated
   * fresh content on every call (and the API route generated ANOTHER copy on
   * top of that) - two live, billed Gemini calls per page load, discarded
   * after use. Now: one AI call per user+objective, ever, unless the learner
   * explicitly asks for a fresh one via `forceRegenerate`.
   */
  static async getOrCreateRemediationSession(
    userId: string,
    objectiveId: string,
    options: { quizAttemptId?: string; forceRegenerate?: boolean } = {},
  ): Promise<{ sessionId: string; lesson: unknown; questions: unknown }> {
    const db = getDb();

    if (!options.forceRegenerate) {
      const existing = await db
        .select()
        .from(remediationSessions)
        .where(
          and(
            eq(remediationSessions.userId, userId),
            eq(remediationSessions.objectiveId, objectiveId),
          ),
        )
        .orderBy(desc(remediationSessions.createdAt))
        .limit(1);

      if (existing.length > 0 && existing[0].content) {
        const content = existing[0].content as { lesson: unknown; questions: unknown };
        return { sessionId: existing[0].id, lesson: content.lesson, questions: content.questions };
      }
    }

    // Fetch objective details
    const obj = await db
      .select({
        title: objectives.title,
        description: objectives.description,
        certificationName: certifications.name,
      })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .innerJoin(certifications, eq(certifications.id, domains.certificationId))
      .where(eq(objectives.id, objectiveId))
      .limit(1);

    if (!obj.length) {
      throw new Error("Objective not found");
    }

    const objData = obj[0];

    // Generate remediation content via AI - the ONE call for this session
    const remediation = await generateRemediationForObjective(
      objData.certificationName,
      objData.title,
      objData.description || "",
    );

    const sessionInserted = await db
      .insert(remediationSessions)
      .values({
        userId,
        objectiveId,
        quizAttemptId: options.quizAttemptId || null,
        content: remediation as unknown as Record<string, unknown>,
      })
      .returning();

    return {
      sessionId: sessionInserted[0].id,
      lesson: remediation.lesson,
      questions: remediation.questions,
    };
  }

  /**
   * Checks if a learner has improved after completing remediation.
   * Compares mastery before and after remediation.
   */
  static async checkRemediationImprovement(
    userId: string,
    objectiveId: string,
    beforeMastery: number,
  ): Promise<boolean> {
    const mastery = await ObjectiveProgressService.calculateObjectiveMastery(userId, objectiveId);
    // Improved if score increased by at least 10%
    return mastery.masteryScore >= beforeMastery + 10;
  }

  /**
   * Marks a remediation session as improved/not improved
   */
  static async updateRemediationOutcome(
    remediationSessionId: string,
    improved: boolean,
  ): Promise<void> {
    const db = getDb();
    await db
      .update(remediationSessions)
      .set({ improved })
      .where(eq(remediationSessions.id, remediationSessionId));
  }
}
