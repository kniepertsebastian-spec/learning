import type {
  CourseBlueprintDomain,
  CourseBlueprintObjective,
  CourseBlueprintV1,
  ObjectiveContentResponse,
} from "./schemas";
import type { SourceExcerpt } from "./sources";

/**
 * course_generation.md Abschnitt 10 "Frühzeitige Freigabegates" / Gate B:
 * Blueprint-Prüfung VOR dem ersten Ausbau-Aufruf. Reine Struktur-/
 * Plausibilitätsprüfung (kein KI-Aufruf) - dieselbe Rolle wie
 * validateBlueprintDraft() für das bestehende R1-Blueprint-Format, aber für
 * das reichhaltigere CourseBlueprintV1.
 */
export function validateBlueprint(blueprint: CourseBlueprintV1): string[] {
  const errors: string[] = [];

  const domainWeightSum = blueprint.domains.reduce((sum, d) => sum + d.weight, 0);
  if (Math.abs(domainWeightSum - 1) > 0.1) {
    errors.push(`Domain-Gewichte ergeben ${domainWeightSum.toFixed(2)}, nicht ungefähr 1.`);
  }

  const seenCodes = new Set<string>();
  for (const domain of blueprint.domains) {
    if (domain.objectives.length === 0) {
      errors.push(`Domain "${domain.title}" hat keine Objectives.`);
      continue;
    }
    for (const objective of domain.objectives) {
      if (seenCodes.has(objective.code)) {
        errors.push(`Objective-Code "${objective.code}" ist mehrfach vergeben.`);
      }
      seenCodes.add(objective.code);
      if (objective.requiredConcepts.length === 0) {
        errors.push(`Objective "${objective.code}": keine requiredConcepts angegeben.`);
      }
      if (objective.lessonPlan.length === 0) {
        errors.push(`Objective "${objective.code}": leerer lessonPlan.`);
      }
    }
  }

  return errors;
}

/**
 * Gate C/D + Abschnitt 6 "validationErrorsJson": deterministische Prüfung
 * EINES generierten Objective-Inhalts gegen sein Blueprint-Objective. Läuft
 * NACH der Zod-Schema-Validierung (die bereits generateStructured() intern
 * erzwingt) - das hier sind zusätzliche, objective-kontextabhängige Regeln,
 * die ein generisches Schema nicht ausdrücken kann (z. B. "matcht die
 * Fragenanzahl die Blueprint-Vorgabe", "wird jedes requiredConcept
 * erwähnt"). Bewusst NUR maschinell prüfbare Heuristiken - "Distraktoren
 * plausibel"/"Erklärung begründet die Antwort" (Abschnitt 10) brauchen
 * KI-Urteil und sind hier nicht enthalten.
 */
export function validateObjectiveContent(
  objective: CourseBlueprintObjective,
  content: ObjectiveContentResponse,
  sourceExcerpts: SourceExcerpt[],
): string[] {
  const errors: string[] = [];

  if (content.questions.length < objective.recommendedQuestions) {
    errors.push(
      `Nur ${content.questions.length} von ${objective.recommendedQuestions} empfohlenen Fragen erhalten.`,
    );
  }

  const seenQuestions = new Map<string, number>();
  content.questions.forEach((question, index) => {
    const normalized = question.question.en.trim().toLowerCase().replace(/\s+/g, " ");
    const priorIndex = seenQuestions.get(normalized);
    if (priorIndex !== undefined) {
      errors.push(`Frage ${index + 1} ist (nahezu) identisch mit Frage ${priorIndex + 1}.`);
    } else {
      seenQuestions.set(normalized, index);
    }
  });

  const haystack = [
    ...content.sections.flatMap((section) => [section.content.en, section.content.de]),
    ...content.questions.flatMap((question) => [question.question.en, question.explanation.en]),
  ]
    .join(" ")
    .toLowerCase();
  for (const concept of objective.requiredConcepts) {
    if (!haystack.includes(concept.toLowerCase())) {
      errors.push(`Erforderliches Konzept "${concept}" kommt in keiner Lektion/Frage vor.`);
    }
  }

  if (objective.complexity === "high" && !content.questions.some((q) => q.type === "scenario")) {
    errors.push("Komplexes Objective ohne mindestens eine Szenario-Frage (type: scenario).");
  }

  const knownLocators = new Set(sourceExcerpts.map((excerpt) => excerpt.locator));
  content.questions.forEach((question, index) => {
    if (question.sourceLocator !== null && !knownLocators.has(question.sourceLocator)) {
      errors.push(`Frage ${index + 1} zitiert unbekannten Locator "${question.sourceLocator}".`);
    }
  });

  return errors;
}

/**
 * Gate C (Abschnitt 3.4): "als erster Haiku-Aufruf wird bewusst nicht das
 * einfachste, sondern das komplexeste oder umfangreichste Lernziel erzeugt".
 * Sortiert nach Komplexität (high > medium > low), dann nach empfohlener
 * Fragenanzahl - der erste Eintrag ist der Canary.
 */
export function pickCanaryIndex(
  objectives: { domain: CourseBlueprintDomain; objective: CourseBlueprintObjective }[],
): number {
  const complexityRank: Record<string, number> = { high: 2, medium: 1, low: 0 };
  let bestIndex = 0;
  let bestScore = -1;
  objectives.forEach(({ objective }, index) => {
    const score = complexityRank[objective.complexity] * 1000 + objective.recommendedQuestions;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}
