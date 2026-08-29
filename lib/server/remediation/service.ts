import { eq, and } from "drizzle-orm";
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
   * Generates remediation content for an objective and stores it in database.
   * Returns the remediation session ID.
   */
  static async generateRemediationSession(
    userId: string,
    objectiveId: string,
    quizAttemptId?: string,
  ): Promise<string> {
    const db = getDb();

    // Fetch objective details
    const obj = await db
      .select({
        title: objectives.title,
        description: objectives.description,
        domainId: domains.id,
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

    // Generate remediation content via AI
    const remediation = await generateRemediationForObjective(
      objData.certificationName,
      objData.title,
      objData.description || "",
    );

    // Store remediation session
    const sessionInserted = await db
      .insert(remediationSessions)
      .values({
        userId,
        objectiveId,
        quizAttemptId: quizAttemptId || null,
      })
      .returning();

    const sessionId = sessionInserted[0].id;

    // TODO: Store the generated remediation content somewhere (e.g., in a cache or temp table)
    // For now, we'll regenerate it on-the-fly when fetching, but in production you'd
    // want to persist it to avoid re-generating for the same user/objective

    return sessionId;
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
