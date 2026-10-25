import { z } from "zod";
import { localizedStringArraySchema, localizedStringSchema } from "@/lib/ai/schemas";
import { lenientDifficultySchema, lenientQuestionTypeSchema } from "@/lib/ai/generate";

/**
 * Phase 1 (course_generation.md, Abschnitt 5): versionierte Datenverträge für
 * die vollautomatische Kursgenerierung. `CourseBlueprintV1` ist der fachliche
 * Bauplan (von der Claude-Pro-Routine erzeugt), `CoursePackageV1` erweitert
 * ihn um die fertig ausgearbeiteten Inhalte (von Haiku erzeugt) - siehe
 * `importCoursePackage()` in ./importer.ts für den einzigen Konsumenten von
 * `CoursePackageV1`.
 *
 * Bewusste Ergänzungen gegenüber der TS-Skizze in course_generation.md
 * Abschnitt 5.1 (die dort ausdrücklich als "noch nicht alle ausformulierten
 * Inhalte" beschrieben ist, keine feste Spezifikation):
 * - `provider` auf Blueprint-Ebene: `certifications.provider` ist eine
 *   NOT-NULL-Spalte (z. B. "CompTIA", "AWS") - ohne dieses Feld könnte der
 *   Importer sie nicht befüllen.
 * - `code` je Objective zusätzlich zu `id`: `objectives.code` ist die
 *   offizielle Prüfungs-Notation (z. B. "1.2") und in JEDEM anderen
 *   Objective-Schema dieses Projekts vorhanden (siehe
 *   lib/server/ai/schemas.ts); `id` bleibt die blueprint-interne
 *   Referenz-ID für den Worker (siehe CourseGenerationObjective.objectiveId
 *   in course_generation.md Abschnitt 6), unabhängig von der echten DB-UUID,
 *   die erst beim Import entsteht.
 * - `examQuestionCount`/`examDurationMinutes`/`passingScore`/`scoreScale`:
 *   dieselben optionalen, NICHT geratenen Prüfungsformat-Felder wie im
 *   bestehenden `blueprintExtractionSchema` (R1.2) - "nicht raten"-Konvention
 *   dieses Projekts, siehe dort.
 */

export const COURSE_BLUEPRINT_SCHEMA_VERSION = "1.0" as const;
export const COURSE_PACKAGE_SCHEMA_VERSION = "1.0" as const;

export const courseSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().optional(),
  /** ISO-8601-Zeitstempel des Abrufs (Abschnitt 14: "Abrufdatum dokumentieren"). */
  retrievedAt: z.string().min(1),
});

export const courseBlueprintObjectiveSchema = z.object({
  /** Blueprint-interne Referenz-ID (siehe Dateikommentar oben) - z. B. "obj-1-2". */
  id: z.string().min(1),
  /** Offizielle Prüfungs-Notation, z. B. "1.2" (siehe Dateikommentar oben). */
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  /** Anteil am Gesamtprüfungsgewicht dieses Objectives, 0-1 (siehe
   * course_generation.md Abschnitt 4 Beispiel: "examWeight": 0.8). */
  examWeight: z.number().min(0).max(1),
  complexity: z.enum(["low", "medium", "high"]),
  requiredConcepts: z.array(z.string().min(1)).min(1),
  commonMisconceptions: z.array(z.string().min(1)),
  /** Grobe Gliederung der Lektion(en) dieses Objectives - wird beim Ausbau
   * (Phase 5) zu vollständigen `sections` mit Lerninhalt. */
  lessonPlan: z.array(z.string().min(1)).min(1),
  sourceLocators: z.array(z.string().min(1)),
  recommendedQuestions: z.number().int().min(1).max(15),
  /**
   * Kapitel-Quiz: Fragenzahl, die erzeugt werden soll, damit der Pool des Kapitels mindestens 30 Fragen erreicht. Nur ein Wunsch an die KI
   * (Prompt); geprüft wird weiter `recommendedQuestions`. Fehlende Fragen füllt der Qualitätsbericht („Fragenpool je Kapitel auffüllen“) nach.
   */
  poolQuestions: z.number().int().min(1).max(15).optional(),
  requiredScenarios: z.array(z.string().min(1)),
});
export type CourseBlueprintObjective = z.infer<typeof courseBlueprintObjectiveSchema>;

export const courseBlueprintDomainSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** Anteil am Gesamtprüfungsgewicht dieser Domain, 0-1 - beim Import in
   * `domains.weightPercent` (0-100) umgerechnet, siehe importer.ts. */
  weight: z.number().min(0).max(1),
  objectives: z.array(courseBlueprintObjectiveSchema).min(1),
});
export type CourseBlueprintDomain = z.infer<typeof courseBlueprintDomainSchema>;

export const courseBlueprintV1Schema = z.object({
  schemaVersion: z.literal(COURSE_BLUEPRINT_SCHEMA_VERSION),
  requestId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  language: z.enum(["de", "en"]),
  provider: z.string().min(1),
  certificationVersion: z.string().min(1).optional(),
  examQuestionCount: z.number().int().min(1).nullable(),
  examDurationMinutes: z.number().int().min(1).nullable(),
  passingScore: z.number().min(0).nullable(),
  scoreScale: z.string().min(1).nullable(),
  sources: z.array(courseSourceSchema),
  domains: z.array(courseBlueprintDomainSchema).min(1),
});
export type CourseBlueprintV1 = z.infer<typeof courseBlueprintV1Schema>;

/**
 * Merkzettel einer Lektion. Bewusst nachsichtig: fehlt er oder ist er unbrauchbar (null, leer, nur eine Sprache), wird er
 * weggelassen, statt die ganze Erzeugung scheitern zu lassen. Die Lektion selbst ist das Wichtige.
 */
const lenientCheatSheetSchema = z.unknown().transform((value): { de: string; en: string } | undefined => {
  const parsed = localizedStringSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
});

export const coursePackageSectionSchema = z.object({
  title: localizedStringSchema,
  estimatedMinutes: z.number().int().min(5).max(120),
  difficulty: lenientDifficultySchema,
  content: localizedStringSchema,
  keyTakeaways: localizedStringArraySchema,
  examFocusPoints: localizedStringArraySchema,
  cheatSheet: lenientCheatSheetSchema.optional(),
});
export type CoursePackageSection = z.infer<typeof coursePackageSectionSchema>;

export const coursePackageQuestionOptionSchema = z.object({
  text: localizedStringSchema,
  isCorrect: z.boolean(),
  /** Warum diese FALSCHE Option nicht passt (UI U4); fehlt bei der richtigen Option und bei älteren Paketen. */
  rationale: localizedStringSchema.optional(),
});

const exactlyOneCorrectOption = (q: { options: { isCorrect: boolean }[] }) =>
  q.options.filter((o) => o.isCorrect).length === 1;
const exactlyOneCorrectOptionMessage = { message: "Exakt eine Option muss isCorrect=true sein." };

export const coursePackageQuestionSchema = z
  .object({
    difficulty: lenientDifficultySchema,
    type: lenientQuestionTypeSchema,
    question: localizedStringSchema,
    options: z.array(coursePackageQuestionOptionSchema).length(4),
    explanation: localizedStringSchema,
    /** Locator eines der Blueprint-`sources`, der diese Frage belegt - `null`,
     * wenn keine Quelle sie belegt (R1.4-Konvention, siehe groundedDraftQuestionSchema). */
    sourceLocator: z.string().min(1).nullable(),
  })
  .refine(exactlyOneCorrectOption, exactlyOneCorrectOptionMessage);
export type CoursePackageQuestion = z.infer<typeof coursePackageQuestionSchema>;

export const coursePackageObjectiveSchema = courseBlueprintObjectiveSchema.extend({
  sections: z.array(coursePackageSectionSchema).min(1),
  // Lernpfade ohne Lektionstests und Abschlussprüfung haben keine Fragen; bei allen anderen erzwingt der Worker die
  // empfohlene Fragenanzahl (validateObjectiveContent).
  questions: z.array(coursePackageQuestionSchema),
});
export type CoursePackageObjective = z.infer<typeof coursePackageObjectiveSchema>;

export const coursePackageDomainSchema = courseBlueprintDomainSchema.extend({
  objectives: z.array(coursePackageObjectiveSchema).min(1),
});
export type CoursePackageDomain = z.infer<typeof coursePackageDomainSchema>;

export const coursePackageGenerationMetadataSchema = z.object({
  blueprintProvider: z.string().min(1),
  blueprintModel: z.string().min(1),
  contentProvider: z.string().min(1),
  contentModel: z.string().min(1),
  promptVersion: z.string().min(1),
  generatedAt: z.string().min(1),
});

export const coursePackageV1Schema = courseBlueprintV1Schema.extend({
  schemaVersion: z.literal(COURSE_PACKAGE_SCHEMA_VERSION),
  domains: z.array(coursePackageDomainSchema).min(1),
  generation: coursePackageGenerationMetadataSchema,
});
export type CoursePackageV1 = z.infer<typeof coursePackageV1Schema>;

/**
 * Phase 4/5: Antwortformate für die tatsächlichen KI-Aufrufe.
 * `courseBlueprintGenerationResponseSchema` lässt `requestId` weg - das setzt
 * die App selbst, die KI kennt den Job nicht. `objectiveContentResponseSchema`
 * ist bewusst NUR sections+questions - der Provider bekommt die restlichen
 * Objective-Felder (title, requiredConcepts, ...) bereits aus dem Blueprint
 * und soll sie nicht neu erfinden/wiederholen (spart Output-Tokens).
 */
export const courseBlueprintGenerationResponseSchema = courseBlueprintV1Schema.omit({
  requestId: true,
});
/**
 * Was die KI beim Blueprint tatsächlich liefern muss: ohne `sources`. Die Quellen (ID, Titel, Adresse, Abrufdatum)
 * kennt die App selbst; die KI hat daran nichts zu erfinden und ließ `retrievedAt` im Praxislauf weg (Gate 3).
 * Der Provider setzt die echten Quellen nach dem Aufruf ein.
 */
export const courseBlueprintAiResponseSchema = courseBlueprintGenerationResponseSchema
  .omit({ sources: true })
  .extend({ sources: z.array(z.unknown()).optional() });

export type CourseBlueprintGenerationResponse = z.infer<
  typeof courseBlueprintGenerationResponseSchema
>;

export const objectiveContentResponseSchema = z.object({
  sections: z.array(coursePackageSectionSchema).min(1),
  questions: z.array(coursePackageQuestionSchema).min(1),
});
export type ObjectiveContentResponse = z.infer<typeof objectiveContentResponseSchema>;

/** Antwortformat für Lernpfade ohne Fragen (nur Lektionen): `questions` darf fehlen oder leer sein. */
export const objectiveContentNoQuestionsResponseSchema = z.object({
  sections: z.array(coursePackageSectionSchema).min(1),
  questions: z.array(coursePackageQuestionSchema).default([]),
});

/**
 * Antwortformat der KI für EIN Lernziel, einsprachig. Die Kursgenerierung schreibt jeden Text nur noch in der Sprache
 * des Auftrags (`job.language`) statt in Deutsch UND Englisch - das halbiert ungefähr die Ausgabe-Token, den teuersten
 * Teil jedes Aufrufs. `toBilingualObjectiveContent()` legt den Text danach in beide Sprachfelder des bestehenden
 * Datenformats, damit Import, Offline-Paket und Oberfläche unverändert bleiben (die Oberfläche zeigt einen Kurs damit
 * immer in seiner Kurssprache).
 */
const lenientMonoCheatSheetSchema = z.unknown().transform((value): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined,
);

export const monoSectionSchema = z.object({
  title: z.string().min(1),
  estimatedMinutes: z.number().int().min(5).max(120),
  difficulty: lenientDifficultySchema,
  content: z.string().min(1),
  keyTakeaways: z.array(z.string().min(1)).min(2),
  examFocusPoints: z.array(z.string().min(1)).min(2),
  /** Nur die erste Section eines Lernziels trägt den Merkzettel (einer pro Lernziel statt pro Section). */
  cheatSheet: lenientMonoCheatSheetSchema.optional(),
});

export const monoQuestionSchema = z
  .object({
    difficulty: lenientDifficultySchema,
    type: lenientQuestionTypeSchema,
    question: z.string().min(1),
    options: z
      .array(z.object({ text: z.string().min(1), isCorrect: z.boolean(), rationale: z.string().min(1).nullable().optional() }))
      .length(4),
    explanation: z.string().min(1),
    sourceLocator: z.string().min(1).nullable(),
  })
  .refine(exactlyOneCorrectOption, exactlyOneCorrectOptionMessage);

export const objectiveContentAiResponseSchema = z.object({
  sections: z.array(monoSectionSchema).min(1),
  questions: z.array(monoQuestionSchema).min(1),
});
export const objectiveContentNoQuestionsAiResponseSchema = z.object({
  sections: z.array(monoSectionSchema).min(1),
  questions: z.array(monoQuestionSchema).default([]),
});
/** Nur Fragen: zum gezielten Nachliefern fehlender Fragen, ohne die Lektionen neu zu schreiben. */
export const questionsOnlyAiResponseSchema = z.object({ questions: z.array(monoQuestionSchema).min(1) });

export type MonoSection = z.infer<typeof monoSectionSchema>;
export type MonoQuestion = z.infer<typeof monoQuestionSchema>;
export type ObjectiveContentAiResponse = z.infer<typeof objectiveContentAiResponseSchema>;

const both = (text: string) => ({ de: text, en: text });
const bothList = (list: string[]) => ({ de: list, en: list });

export function toBilingualQuestion(q: MonoQuestion): CoursePackageQuestion {
  return {
    difficulty: q.difficulty,
    type: q.type,
    question: both(q.question),
    options: q.options.map((o) => ({
      text: both(o.text),
      isCorrect: o.isCorrect,
      ...(!o.isCorrect && o.rationale ? { rationale: both(o.rationale) } : {}),
    })),
    explanation: both(q.explanation),
    sourceLocator: q.sourceLocator,
  };
}

export function toBilingualObjectiveContent(content: { sections: MonoSection[]; questions: MonoQuestion[] }): ObjectiveContentResponse {
  return {
    sections: content.sections.map((s) => ({
      title: both(s.title),
      estimatedMinutes: s.estimatedMinutes,
      difficulty: s.difficulty,
      content: both(s.content),
      keyTakeaways: bothList(s.keyTakeaways),
      examFocusPoints: bothList(s.examFocusPoints),
      ...(s.cheatSheet ? { cheatSheet: both(s.cheatSheet) } : {}),
    })),
    questions: content.questions.map(toBilingualQuestion),
  };
}

/** Umkehrung für Reparatur-Prompts: nur die eine Sprachfassung zurück an die KI schicken, nicht beide. */
export function toMonoObjectiveContent(content: ObjectiveContentResponse, language: "de" | "en") {
  return {
    sections: content.sections.map((s) => ({
      title: s.title[language],
      estimatedMinutes: s.estimatedMinutes,
      difficulty: s.difficulty,
      content: s.content[language],
      keyTakeaways: s.keyTakeaways[language],
      examFocusPoints: s.examFocusPoints[language],
      ...(s.cheatSheet ? { cheatSheet: s.cheatSheet[language] } : {}),
    })),
    questions: content.questions.map((q) => ({
      difficulty: q.difficulty,
      type: q.type,
      question: q.question[language],
      options: q.options.map((o) => ({ text: o.text[language], isCorrect: o.isCorrect, ...(o.rationale ? { rationale: o.rationale[language] } : {}) })),
      explanation: q.explanation[language],
      sourceLocator: q.sourceLocator,
    })),
  };
}
