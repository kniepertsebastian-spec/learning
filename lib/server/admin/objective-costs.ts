import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, objectiveGenerationCosts, objectives } from "@/lib/server/db/schema";
import { estimateCostUsd } from "./content-generation";

export interface ObjectiveGenerationUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  acceptedLessonCount: number;
  acceptedQuestionCount: number;
}

/**
 * R6 (roadmap.md): "Kosten je veröffentlichter Lesson, Mission und
 * akzeptierter Frage" - Snapshot je Objective, siehe Kommentar auf
 * objectiveGenerationCosts in lib/server/db/schema.ts für die
 * Zuordnungs-Entscheidung (objectiveId statt jobId). Aufgerufen vom
 * generierenden Skript selbst (scripts/generate-lessons-and-questions.ts),
 * NICHT über einen stdout-USAGE-Zeilen-Parser wie das Job-Level-Tracking in
 * content-generation.ts - das Skript hat ohnehin direkten DB-Zugriff und
 * kennt die akzeptierten Lesson-/Fragen-Zahlen erst NACH den
 * Qualitätsprüfungen, die im selben Prozess laufen.
 */
export async function recordObjectiveGenerationCost(
  objectiveId: string,
  usage: ObjectiveGenerationUsage,
): Promise<void> {
  const totalTokens = usage.promptTokens + usage.completionTokens;
  const estimatedCostUsd = estimateCostUsd(usage.promptTokens, usage.completionTokens, usage.model);

  await getDb()
    .insert(objectiveGenerationCosts)
    .values({
      objectiveId,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens,
      estimatedCostUsd: estimatedCostUsd !== null ? estimatedCostUsd.toString() : null,
      acceptedLessonCount: usage.acceptedLessonCount,
      acceptedQuestionCount: usage.acceptedQuestionCount,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: objectiveGenerationCosts.objectiveId,
      set: {
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens,
        estimatedCostUsd: estimatedCostUsd !== null ? estimatedCostUsd.toString() : null,
        acceptedLessonCount: usage.acceptedLessonCount,
        acceptedQuestionCount: usage.acceptedQuestionCount,
        updatedAt: new Date(),
      },
    });
}

export interface ObjectiveCostRow {
  objectiveId: string;
  objectiveCode: string;
  objectiveTitle: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  acceptedLessonCount: number;
  acceptedQuestionCount: number;
  /** Abgeleitet, nicht gespeichert (siehe Modul-Kommentar oben) - null, wenn
   * estimatedCostUsd unbekannt ist oder keine Elemente akzeptiert wurden. */
  estimatedCostPerItemUsd: number | null;
  updatedAt: Date;
}

/**
 * Reine Funktion (kein DB-Zugriff), damit sie ohne Postgres testbar ist -
 * siehe Modul-Kommentar oben zur bewussten Entscheidung, keinen erfundenen
 * Einzelpreis zu SPEICHERN, sondern ihn abgeleitet zu berechnen.
 */
export function deriveCostPerItem(
  estimatedCostUsd: number | null,
  acceptedLessonCount: number,
  acceptedQuestionCount: number,
): number | null {
  const itemCount = acceptedLessonCount + acceptedQuestionCount;
  if (estimatedCostUsd === null || itemCount <= 0) return null;
  return estimatedCostUsd / itemCount;
}

/** Für die Admin-Ansicht: Kosten-Snapshot je Objective einer Zertifizierung,
 * inklusive der Objectives ohne (bisherigen) Snapshot (z. B. noch nicht
 * generiert oder vor Einführung dieser Tabelle generiert). */
export async function getObjectiveCostsForCertification(
  certificationId: string,
): Promise<ObjectiveCostRow[]> {
  const db = getDb();

  const certDomains = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.certificationId, certificationId));
  if (certDomains.length === 0) return [];

  const certObjectives = await db
    .select({ id: objectives.id, code: objectives.code, title: objectives.title })
    .from(objectives)
    .where(
      inArray(
        objectives.domainId,
        certDomains.map((d) => d.id),
      ),
    )
    .orderBy(objectives.code);
  if (certObjectives.length === 0) return [];

  const costs = await db
    .select()
    .from(objectiveGenerationCosts)
    .where(
      inArray(
        objectiveGenerationCosts.objectiveId,
        certObjectives.map((o) => o.id),
      ),
    );
  const costByObjectiveId = new Map(costs.map((c) => [c.objectiveId, c]));

  return certObjectives.map((objective) => {
    const cost = costByObjectiveId.get(objective.id);
    const estimatedCostUsd = cost?.estimatedCostUsd != null ? Number(cost.estimatedCostUsd) : null;
    const acceptedLessonCount = cost?.acceptedLessonCount ?? 0;
    const acceptedQuestionCount = cost?.acceptedQuestionCount ?? 0;

    return {
      objectiveId: objective.id,
      objectiveCode: objective.code,
      objectiveTitle: objective.title,
      model: cost?.model ?? null,
      promptTokens: cost?.promptTokens ?? 0,
      completionTokens: cost?.completionTokens ?? 0,
      totalTokens: cost?.totalTokens ?? 0,
      estimatedCostUsd,
      acceptedLessonCount,
      acceptedQuestionCount,
      estimatedCostPerItemUsd: deriveCostPerItem(estimatedCostUsd, acceptedLessonCount, acceptedQuestionCount),
      updatedAt: cost?.updatedAt ?? new Date(0),
    };
  });
}
