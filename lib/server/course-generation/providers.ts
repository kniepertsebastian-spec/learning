import { generateStructured, type AIUsage } from "@/lib/ai/generate";
import { CURRICULUM_MODEL, LESSONS_MODEL } from "@/lib/claude";
import {
  courseBlueprintGenerationResponseSchema,
  objectiveContentResponseSchema,
  COURSE_BLUEPRINT_SCHEMA_VERSION,
  type CourseBlueprintDomain,
  type CourseBlueprintObjective,
  type CourseBlueprintV1,
  type ObjectiveContentResponse,
} from "./schemas";
import type { FetchedSource, SourceExcerpt } from "./sources";

/**
 * course_generation.md Abschnitt 9: `CourseContentProvider`/`BlueprintProvider`
 * - austauschbare Abstraktion, damit (a) Tests ein Fake statt eines echten
 * API-Aufrufs verwenden können und (b) ein späterer Providerwechsel nicht
 * den gesamten Orchestrator anfasst (siehe course_generation.md Abschnitt 0:
 * dieselbe Begründung wie beim damaligen Gemini->Claude-Wechsel).
 */
export interface BlueprintGenerationInput {
  courseTitle: string;
  courseDescription: string;
  language: "de" | "en";
  provider: string;
  certificationVersion?: string;
  sources: FetchedSource[];
}

export interface BlueprintProvider {
  readonly name: string;
  readonly model: string;
  generateBlueprint(
    input: BlueprintGenerationInput,
    onUsage?: (usage: AIUsage) => void,
  ): Promise<Omit<CourseBlueprintV1, "requestId">>;
}

export interface ObjectiveGenerationInput {
  courseTitle: string;
  language: "de" | "en";
  domain: CourseBlueprintDomain;
  objective: CourseBlueprintObjective;
  sourceExcerpts: SourceExcerpt[];
}

export interface CourseContentProvider {
  readonly name: string;
  readonly model: string;
  generateObjective(
    input: ObjectiveGenerationInput,
    onUsage?: (usage: AIUsage) => void,
  ): Promise<ObjectiveContentResponse>;
  repairObjective(
    input: ObjectiveGenerationInput,
    previous: ObjectiveContentResponse,
    errors: string[],
    onUsage?: (usage: AIUsage) => void,
  ): Promise<ObjectiveContentResponse>;
}

function formatSourcesForPrompt(sources: FetchedSource[]): string {
  return sources
    .flatMap((source) => [
      `--- Quelle "${source.title}" (${source.url}) ---`,
      ...source.excerpts.map((excerpt) => `[${excerpt.locator}]\n${excerpt.text}`),
    ])
    .join("\n\n");
}

const BLUEPRINT_SYSTEM_PROMPT = [
  "Du bist ein Curriculum-Designer und erstellst den fachlichen Bauplan (Blueprint) für einen Zertifizierungskurs.",
  "Nutze AUSSCHLIESSLICH die bereitgestellten Quellenausschnitte als Grundlage. Erfinde keine Domains, Objectives oder Gewichtungen, die sich nicht aus den Quellen ableiten lassen.",
  "",
  "Für jede Domain: Titel und Gewichtsanteil (0-1, alle Domain-Gewichte zusammen ergeben ungefähr 1).",
  "Für jedes Objective: offizielle Notation (`code`, z.B. \"1.2\"), Titel, Beschreibung, Gewichtsanteil innerhalb der Domain (0-1),",
  "Komplexität (low/medium/high), 2-6 erforderliche Kernkonzepte, häufige Missverständnisse, eine grobe Lektionsgliederung (`lessonPlan`, 2-5 Schritte),",
  "die Quellenlocator, die dieses Objective belegen, eine empfohlene Fragenanzahl (4-15, mehr für wichtigere/komplexere Objectives) und ggf. erforderliche Szenarien.",
  "Setze `provider` auf den Anbieter/die Organisation der Zertifizierung (z.B. \"CompTIA\", \"AWS\").",
  "Setze `examQuestionCount`/`examDurationMinutes`/`passingScore`/`scoreScale` NUR, wenn explizit in den Quellen angegeben - sonst exakt `null`, niemals raten.",
].join("\n");

/**
 * Erste, sofort nutzbare Implementierung von `BlueprintProvider` - nutzt den
 * bestehenden, bereits getesteten Claude-API-Pfad (CURRICULUM_MODEL =
 * claude-sonnet-4-5, siehe lib/claude.ts) statt einer Claude-Pro-Routine.
 * Funktional vollständig, aber NICHT der in course_generation.md Abschnitt 12
 * beschriebene kostenlose Pfad - siehe RoutineBlueprintProvider für den
 * eigentlichen Kosteneinsparungs-Hebel dieses Dokuments, der eine
 * eingerichtete Claude-Code-Cloud-Routine voraussetzt (Secrets aus Abschnitt
 * 14) und daher nicht ungefragt production-scharf geschaltet wird.
 */
export const anthropicSonnetBlueprintProvider: BlueprintProvider = {
  name: "anthropic-sonnet",
  model: CURRICULUM_MODEL,
  async generateBlueprint(input, onUsage) {
    const userPrompt = [
      `Erstelle den Blueprint für den Kurs "${input.courseTitle}" (${input.courseDescription}).`,
      `Sprache der Lerninhalte: ${input.language}.`,
      input.certificationVersion ? `Zertifizierungsversion: ${input.certificationVersion}.` : "",
      "",
      "Quellenausschnitte:",
      formatSourcesForPrompt(input.sources),
    ]
      .filter(Boolean)
      .join("\n");

    const result = await generateStructured(
      BLUEPRINT_SYSTEM_PROMPT,
      userPrompt,
      courseBlueprintGenerationResponseSchema,
      CURRICULUM_MODEL,
      onUsage,
    );
    return { ...result, schemaVersion: COURSE_BLUEPRINT_SCHEMA_VERSION };
  },
};

/**
 * Abschnitt 3.2-3.3/13: die eigentliche, kostenlose (innerhalb des
 * Claude-Pro-Kontingents) Blueprint-Erzeugung über eine Claude-Code-Cloud-
 * Routine. Technisch entspricht das einer über die claude-code-remote-
 * MCP-Werkzeuge erstellten Routine (siehe course_generation.md Abschnitt 0),
 * die bei Auslösung `GET /api/internal/course-generation/:id/request`
 * abruft und ihr Ergebnis an `POST .../blueprint` zurückgibt (Abschnitt 7).
 *
 * Absichtlich NICHT in dieser Session eingerichtet: das erfordert einen
 * echten, öffentlich erreichbaren Callback-Endpunkt (dieser Dev-Sandbox ist
 * nicht öffentlich erreichbar) sowie CLAUDE_ROUTINE_TRIGGER_URL/_TOKEN, die
 * erst nach dem eigentlichen Deployment sinnvoll gesetzt werden können - das
 * Anlegen einer produktiven Routine/von Secrets ohne konkrete
 * Ziel-Infrastruktur wäre eine Konsequenzhandlung ohne Nutzen. Wirft daher
 * bewusst einen klaren Fehler statt eines stillen Fallbacks, bis
 * CLAUDE_ROUTINE_TRIGGER_URL konfiguriert ist.
 */
export const routineBlueprintProvider: BlueprintProvider = {
  name: "claude-routine-sonnet",
  model: "claude-sonnet-4-5",
  async generateBlueprint() {
    if (!process.env.CLAUDE_ROUTINE_TRIGGER_URL) {
      throw new Error(
        "BLUEPRINT_PROVIDER=claude-routine-sonnet erfordert CLAUDE_ROUTINE_TRIGGER_URL/CLAUDE_ROUTINE_TRIGGER_TOKEN " +
          "(siehe course_generation.md Abschnitt 14) - noch nicht konfiguriert. Nutze BLUEPRINT_PROVIDER=anthropic-sonnet, " +
          "bis die Routine eingerichtet ist.",
      );
    }
    throw new Error(
      "Routine-Trigger ist konfiguriert, aber der HTTP-Aufruf ist noch nicht implementiert (Phase 4 Folgearbeit).",
    );
  },
};

export function resolveBlueprintProvider(name: string): BlueprintProvider {
  if (name === anthropicSonnetBlueprintProvider.name) return anthropicSonnetBlueprintProvider;
  if (name === routineBlueprintProvider.name) return routineBlueprintProvider;
  throw new Error(`Unbekannter BlueprintProvider "${name}".`);
}

const CONTENT_SYSTEM_PROMPT_TEMPLATE = (courseTitle: string) =>
  [
    `Du bist Dozent und Prüfungsfragen-Autor für den Kurs "${courseTitle}".`,
    "Erstelle Lerninhalt (eine Section pro Schritt in `lessonPlan`) und einen Fragen-Pool für GENAU das unten beschriebene Objective.",
    "Nutze bevorzugt die mitgelieferten Quellenausschnitte; ergänze sparsam mit Fachwissen, wenn ein Auszug keine Grundlage bietet.",
    "",
    "Jede Section enthält: Titel (bilingual de/en), geschätzte Dauer (5-120 Min), Schwierigkeitsgrad, Markdown-Lerninhalt (bilingual),",
    "mindestens 2 Key Takeaways und mindestens 2 Exam Focus Points (jeweils bilingual).",
    "",
    "Fragen: genau die im Objective angegebene `recommendedQuestions`-Anzahl, Mischung aus knowledge/comprehension/application/scenario/troubleshooting,",
    "genau 4 Antwortoptionen pro Frage, genau EINE davon korrekt, bilinguale Frage/Antworten/Erklärung.",
    "Jede Frage MUSS `sourceLocator` setzen (Locator eines mitgelieferten Auszugs) oder `null`, wenn kein Auszug sie belegt.",
  ].join("\n");

function objectiveUserPrompt(input: ObjectiveGenerationInput): string {
  return [
    `Objective "${input.objective.title}" (${input.objective.code}) - ${input.objective.description}`,
    `Domain: "${input.domain.title}"`,
    `Erforderliche Kernkonzepte: ${input.objective.requiredConcepts.join(", ")}`,
    input.objective.commonMisconceptions.length
      ? `Häufige Missverständnisse: ${input.objective.commonMisconceptions.join(", ")}`
      : "",
    `Lektionsgliederung: ${input.objective.lessonPlan.join(" | ")}`,
    `Empfohlene Fragenanzahl: ${input.objective.recommendedQuestions}`,
    input.objective.requiredScenarios.length
      ? `Erforderliche Szenarien: ${input.objective.requiredScenarios.join(", ")}`
      : "",
    "",
    "Quellenausschnitte für dieses Objective:",
    input.sourceExcerpts.map((e) => `[${e.locator}]\n${e.text}`).join("\n\n") || "(keine)",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Abschnitt 3.5/9: `AnthropicHaikuProvider` - die günstige Massengenerierung
 * (LESSONS_MODEL = claude-haiku-4-5, siehe lib/claude.ts). Reine Weiterleitung
 * an das bereits bestehende generateStructured() - keine zweite
 * Request-/Retry-Pipeline.
 */
export const anthropicHaikuContentProvider: CourseContentProvider = {
  name: "anthropic-haiku",
  model: LESSONS_MODEL,
  async generateObjective(input, onUsage) {
    return generateStructured(
      CONTENT_SYSTEM_PROMPT_TEMPLATE(input.courseTitle),
      objectiveUserPrompt(input),
      objectiveContentResponseSchema,
      LESSONS_MODEL,
      onUsage,
    );
  },
  async repairObjective(input, previous, errors, onUsage) {
    const repairPrompt = [
      objectiveUserPrompt(input),
      "",
      `Deine vorherige Antwort erfüllte das erwartete Schema nicht (${errors.join("; ")}):`,
      JSON.stringify(previous),
      "",
      "Bitte korrigiere ausschließlich die beanstandeten Stellen und antworte erneut vollständig.",
    ].join("\n");
    return generateStructured(
      CONTENT_SYSTEM_PROMPT_TEMPLATE(input.courseTitle),
      repairPrompt,
      objectiveContentResponseSchema,
      LESSONS_MODEL,
      onUsage,
    );
  },
};

/**
 * Abschnitt 11 Punkt 6: "Alle schwierigen Lernziele eines Kurses werden in
 * einer einzigen Sonnet-Reparaturroutine gesammelt" - nutzt CURRICULUM_MODEL
 * (claude-sonnet-4-5), aber über die metered API (nicht die Routine, siehe
 * routineBlueprintProvider-Kommentar oben zur selben Einschränkung).
 */
export const anthropicSonnetRepairProvider: CourseContentProvider = {
  name: "anthropic-sonnet-repair",
  model: CURRICULUM_MODEL,
  async generateObjective(input, onUsage) {
    return generateStructured(
      CONTENT_SYSTEM_PROMPT_TEMPLATE(input.courseTitle),
      objectiveUserPrompt(input),
      objectiveContentResponseSchema,
      CURRICULUM_MODEL,
      onUsage,
    );
  },
  async repairObjective(input, previous, errors, onUsage) {
    const repairPrompt = [
      objectiveUserPrompt(input),
      "",
      `Ein günstigeres Modell ist an diesem Objective zweimal gescheitert (${errors.join("; ")}):`,
      JSON.stringify(previous),
      "",
      "Bitte löse es sorgfältig und vollständig.",
    ].join("\n");
    return generateStructured(
      CONTENT_SYSTEM_PROMPT_TEMPLATE(input.courseTitle),
      repairPrompt,
      objectiveContentResponseSchema,
      CURRICULUM_MODEL,
      onUsage,
    );
  },
};
