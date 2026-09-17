import { CURRICULUM_MODEL, LESSONS_MODEL } from "@/lib/claude";
import type { CourseBlueprintV1, ObjectiveContentResponse } from "./schemas";
import type { BlueprintProvider, CourseContentProvider } from "./providers";

/**
 * Fakes für Tests/E2E-Verifikation ohne echten (kostenpflichtigen) API-Aufruf
 * - genau die in course_generation.md Abschnitt 0/9 vorgesehene
 * Austauschbarkeit von `BlueprintProvider`/`CourseContentProvider`.
 *
 * `onUsage` wird bewusst mit CURRICULUM_MODEL/LESSONS_MODEL (nicht einem
 * erfundenen "fake-..."-Namen) gemeldet: estimateCostUsd() (siehe
 * lib/server/admin/content-generation.ts) kennt nur diese beiden Modelle und
 * würde bei einem Fake-Namen immer `null` liefern - das würde
 * Budget-/Kostenlogik im E2E-Test unbeaufsichtigt lassen. `.name`/`.model`
 * bleiben trotzdem als "fake-..."-Kennung sichtbar (courseGenerationObjectives.model),
 * damit ein echter vs. simulierter Lauf in der DB unterscheidbar bleibt.
 */
export function createFakeBlueprintProvider(
  blueprint: Omit<CourseBlueprintV1, "requestId">,
): BlueprintProvider {
  return {
    name: "fake-blueprint",
    model: "fake-sonnet",
    async generateBlueprint(_input, onUsage) {
      onUsage?.({ model: CURRICULUM_MODEL, promptTokens: 500, completionTokens: 800 });
      return blueprint;
    },
  };
}

export interface FakeObjectivePlan {
  result: ObjectiveContentResponse;
  /** Anzahl Versuche (generate + repair zusammen), die absichtlich mit
   * unzureichendem Inhalt scheitern, bevor `result` geliefert wird - simuliert
   * Reparaturbedarf für Canary-/Circuit-Breaker-Tests. */
  failFirstAttempts?: number;
}

const INSUFFICIENT_RESULT: ObjectiveContentResponse = {
  sections: [
    {
      title: { de: "Unvollständig", en: "Incomplete" },
      estimatedMinutes: 5,
      difficulty: "beginner",
      content: { de: "Absichtlich unvollständiger Testinhalt.", en: "Deliberately incomplete test content." },
      keyTakeaways: { de: ["a", "b"], en: ["a", "b"] },
      examFocusPoints: { de: ["a", "b"], en: ["a", "b"] },
    },
  ],
  questions: [],
};

/** Liefert vordefinierte Inhalte pro Objective-ID (Schlüssel = `objective.id`
 * aus dem Blueprint), optional mit simulierten Fehlversuchen. */
export function createFakeContentProvider(
  name: string,
  plan: Record<string, FakeObjectivePlan>,
): CourseContentProvider {
  const attempts = new Map<string, number>();
  const nextResult = (objectiveId: string): ObjectiveContentResponse => {
    const entry = plan[objectiveId];
    const attempt = (attempts.get(objectiveId) ?? 0) + 1;
    attempts.set(objectiveId, attempt);
    if (!entry) return INSUFFICIENT_RESULT;
    if (entry.failFirstAttempts && attempt <= entry.failFirstAttempts) return INSUFFICIENT_RESULT;
    return entry.result;
  };

  return {
    name,
    model: "fake-model",
    async generateObjective(input, onUsage) {
      onUsage?.({ model: LESSONS_MODEL, promptTokens: 300, completionTokens: 600 });
      return nextResult(input.objective.id);
    },
    async repairObjective(input, _previous, _errors, onUsage) {
      onUsage?.({ model: LESSONS_MODEL, promptTokens: 200, completionTokens: 400 });
      return nextResult(input.objective.id);
    },
  };
}
