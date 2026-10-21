import { repairLearningBlocks, validateLearningBlocks } from "@/lib/markdown/validate";
import type {
  CourseBlueprintDomain,
  CourseBlueprintObjective,
  CourseBlueprintV1,
  ObjectiveContentResponse,
} from "./schemas";
import type { SourceExcerpt } from "./sources";
import { nearDuplicate } from "./variety";

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
/**
 * Kommt ein erforderliches Konzept im Text vor? Blueprint-Konzepte sind oft Beschreibungen mit Zusätzen
 * („Hybride Speicherlösungen (z. B. AWS Storage Gateway)“), die so nie wörtlich im Lerntext stehen. Es zählt deshalb:
 * die ganze Angabe, die Angabe ohne Klammerzusatz, der Klammerzusatz selbst oder – bei mehreren Wörtern – wenn die
 * Mehrheit der bedeutungstragenden Wörter (ab 4 Buchstaben) vorkommt.
 */
export function conceptPresent(concept: string, haystack: string): boolean {
  const text = haystack.toLowerCase();
  const whole = concept.toLowerCase().trim();
  if (text.includes(whole)) return true;
  const withoutParens = whole.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (withoutParens && text.includes(withoutParens)) return true;
  const inParens = [...whole.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].replace(/^(z\.?\s?b\.?|e\.?g\.?|i\.?e\.?|bzw\.?)\s*/i, "").trim()).filter((x) => x.length >= 3);
  if (inParens.some((x) => text.includes(x))) return true;
  const words = [...new Set(withoutParens.split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length >= 4))];
  if (words.length < 2) return false;
  const hits = words.filter((w) => text.includes(w)).length;
  return hits / words.length >= 0.6;
}

export function validateObjectiveContent(
  objective: CourseBlueprintObjective,
  content: ObjectiveContentResponse,
  sourceExcerpts: SourceExcerpt[],
  /** false: Lernpfad ohne Fragen, die Fragenregeln entfallen. */
  options: { withQuestions?: boolean } = {},
): string[] {
  const errors: string[] = [];
  const withQuestions = options.withQuestions !== false;

  if (withQuestions && content.questions.length < objective.recommendedQuestions) {
    errors.push(
      `Nur ${content.questions.length} von ${objective.recommendedQuestions} empfohlenen Fragen erhalten.`,
    );
  }

  content.questions.forEach((question, index) => {
    const priorIndex = content.questions.slice(0, index).findIndex((prior) => sameQuestion(prior.question.en, question.question.en));
    if (priorIndex >= 0) errors.push(`Frage ${index + 1} ist (nahezu) identisch mit Frage ${priorIndex + 1}.`);
  });

  content.sections.forEach((section, index) => {
    for (const lang of ["de", "en"] as const) {
      // Einsprachig erzeugte Kurse tragen denselben Text in beiden Feldern: nur einmal prüfen, sonst doppelte Meldungen.
      if (lang === "en" && section.content.en === section.content.de) continue;
      for (const problem of validateLearningBlocks(section.content[lang])) {
        errors.push(`Lektion ${index + 1} (${lang}): ${problem}`);
      }
    }
  });

  const haystack = [
    ...content.sections.flatMap((section) => [section.content.en, section.content.de]),
    ...content.questions.flatMap((question) => [question.question.en, question.explanation.en, question.question.de, question.explanation.de]),
  ]
    .join(" ")
    .toLowerCase();
  for (const concept of objective.requiredConcepts) {
    if (!conceptPresent(concept, haystack)) {
      errors.push(`Erforderliches Konzept "${concept}" kommt in keiner Lektion/Frage vor.`);
    }
  }

  if (withQuestions && objective.complexity === "high" && !content.questions.some((q) => q.type === "scenario")) {
    errors.push("Komplexes Objective ohne mindestens eine Szenario-Frage (type: scenario).");
  }

  // Ein ungenauer Quellenverweis einer Frage (Schreibweise, Dateiname-Zusatz) ist kein Grund, den ganzen Lernbaustein zu verwerfen:
  // der Verweis wird nirgends weiterverwendet. Fehlerhaft ist nur ein Verweis, der gar nichts mit den Quellen zu tun hat,
  // und auch das nur, wenn überhaupt Quellen bekannt sind und der Verweis weder ein bekannter noch ein Teilstring ist.
  // Der Worker setzt solche Verweise vorher per autoFixObjectiveContent() auf null; die Regel bleibt als Absicherung.
  content.questions.forEach((question, index) => {
    if (!locatorKnown(question.sourceLocator, sourceExcerpts)) {
      errors.push(`Frage ${index + 1} zitiert unbekannten Locator "${question.sourceLocator}".`);
    }
  });

  return errors;
}

function normalizeQuestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Gleich oder fast gleich (dieselbe Frage umformuliert, siehe variety.ts). */
function sameQuestion(a: string, b: string): boolean {
  return normalizeQuestionText(a) === normalizeQuestionText(b) || nearDuplicate(a, b);
}

/** Passt der Quellenverweis zu einem mitgelieferten Ausschnitt (exakt oder als Teilstring)? `null` gilt als passend. */
function locatorKnown(locator: string | null, sourceExcerpts: SourceExcerpt[]): boolean {
  if (locator === null) return true;
  const known = sourceExcerpts.map((excerpt) => excerpt.locator.trim().toLowerCase());
  if (known.length === 0) return true;
  const cited = locator.trim().toLowerCase();
  return !cited || known.some((k) => k === cited || k.includes(cited) || cited.includes(k));
}

/**
 * Behebt, was sich ohne KI beheben lässt, statt dafür ein komplettes Lernziel neu erzeugen zu lassen (jede Reparatur
 * schickt Quellen und alte Antwort erneut und lässt alles neu schreiben):
 * - unbekannter Quellenverweis einer Frage → `null` (der Verweis wird nirgends weiterverwendet),
 * - (nahezu) doppelte Fragen → die spätere fällt weg; fehlen danach Fragen, liefert der Worker nur diese nach,
 * - ungültige Lernblöcke → aufgelöst bzw. geschlossen (repairLearningBlocks).
 */
export function autoFixObjectiveContent(
  content: ObjectiveContentResponse,
  sourceExcerpts: SourceExcerpt[],
): { content: ObjectiveContentResponse; fixes: string[] } {
  const fixes: string[] = [];
  const kept: string[] = [];
  const questions = content.questions.flatMap((question, index) => {
    if (kept.some((k) => sameQuestion(k, question.question.en))) {
      fixes.push(`Frage ${index + 1} war doppelt und wurde entfernt.`);
      return [];
    }
    kept.push(question.question.en);
    if (!locatorKnown(question.sourceLocator, sourceExcerpts)) {
      fixes.push(`Unbekannter Quellenverweis "${question.sourceLocator}" bei Frage ${index + 1} wurde entfernt.`);
      return [{ ...question, sourceLocator: null }];
    }
    return [question];
  });
  // Fehlerhafte Lernblöcke (z. B. `:::steps` mit nur einem Schritt) auflösen bzw. schließen, statt das Lernziel deshalb
  // komplett neu erzeugen zu lassen. Das war die häufigste Ursache für Reparaturrunden und gestoppte Läufe.
  const sections = content.sections.map((section, index) => {
    const de = repairLearningBlocks(section.content.de);
    const en = section.content.en === section.content.de ? de : repairLearningBlocks(section.content.en);
    if (de === section.content.de && en === section.content.en) return section;
    fixes.push(`Lernblöcke in Lektion ${index + 1} repariert.`);
    return { ...section, content: { de, en } };
  });
  return { content: { ...content, sections, questions }, fixes };
}

/**
 * Betreffen die verbleibenden Fehler nur fehlende Fragen (Anzahl, Szenario-Frage)? Dann reicht es, genau diese Fragen
 * nachzuliefern; die Lektionen bleiben unangetastet. Liefert, wie viele Fragen fehlen und ob eine Szenario-Frage nötig ist.
 */
export function missingQuestionsOnly(
  objective: CourseBlueprintObjective,
  content: ObjectiveContentResponse,
  errors: string[],
): { count: number; requireScenario: boolean } | null {
  const questionOnly = errors.every((e) => e.startsWith("Nur ") || e.startsWith("Komplexes Objective ohne"));
  if (!questionOnly || errors.length === 0) return null;
  const requireScenario = errors.some((e) => e.startsWith("Komplexes Objective ohne"));
  const shortfall = Math.max(0, objective.recommendedQuestions - content.questions.length);
  const count = Math.max(shortfall, requireScenario ? 1 : 0);
  return count > 0 ? { count, requireScenario } : null;
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
