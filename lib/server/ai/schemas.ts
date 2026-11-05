import { z } from "zod";
import { localizedStringArraySchema, localizedStringSchema } from "@/lib/ai/schemas";
import { lenientDifficultySchema, lenientQuestionTypeSchema } from "@/lib/ai/generate";

/**
 * Lesson- und Question-Generierung (roadmap2.md Dev-Order Schritt 6-7), gebatcht
 * pro Objective (alle Sections dieses Objectives in einem Call) statt pro
 * einzelner Section - weniger API-Calls, robuster gegenüber Free-Tier-Rate-Limits,
 * siehe Phase 20/21 (Cost Optimization / Caching).
 */
export const draftLessonSchema = z.object({
  /** Muss `sections.orderNum` der Ziel-Section entsprechen. */
  sectionOrderNum: z.number().int().min(1),
  content: localizedStringSchema,
  keyTakeaways: localizedStringArraySchema,
  examFocusPoints: localizedStringArraySchema,
});

export const draftQuestionOptionSchema = z.object({
  text: localizedStringSchema,
  isCorrect: z.boolean(),
  /** Warum diese FALSCHE Option nicht passt (UI U4). */
  rationale: localizedStringSchema.optional(),
});

const exactlyOneCorrectOption = (q: { options: { isCorrect: boolean }[] }) =>
  q.options.filter((o) => o.isCorrect).length === 1;
const exactlyOneCorrectOptionMessage = { message: "Exakt eine Option muss isCorrect=true sein." };

/** Ungeprüfte Basisform der generierten Frage; groundedDraftQuestionSchema (R1.4, mit Quellenbezug) erweitert sie per
 * `.extend()` - ein `.refine()`-Ergebnis (ZodEffects) hat kein `.extend()` mehr, daher getrennt von der Validierung. */
const draftQuestionBaseSchema = z.object({
  difficulty: lenientDifficultySchema,
  type: lenientQuestionTypeSchema,
  question: localizedStringSchema,
  options: z.array(draftQuestionOptionSchema).length(4),
  explanation: localizedStringSchema,
});

/** Frage mit genau einer richtigen Option (Remediation-Übungsfragen; die quellengebundenen Fragen unten erweitern die Basisform). */
const draftQuestionSchema = draftQuestionBaseSchema.refine(exactlyOneCorrectOption, exactlyOneCorrectOptionMessage);

/**
 * R1.4 (roadmap.md): quellengebundene Variante - "Aussagen ohne ausreichende
 * Grundlage verwerfen oder als Review-Fall markieren". `grounded` sagt pro
 * Lesson/Frage, ob der Inhalt durch die mitgelieferten Quellenausschnitte
 * belegt ist; `sourceLocator` bei Fragen zitiert den konkret genutzten
 * Ausschnitt (oder `null`, wenn keiner passt). Der Aufrufer (siehe
 * lib/server/lessons/stale-regeneration.ts) verwirft ungegroundete Fragen
 * und markiert ungegroundete Lessons als reviewStatus "needs_review" statt
 * sie unmarkiert zu übernehmen.
 */
export const groundedDraftLessonSchema = draftLessonSchema.extend({
  grounded: z.boolean(),
});

export const groundedDraftQuestionSchema = draftQuestionBaseSchema
  .extend({
    /** Locator eines der mitgelieferten Quellenausschnitte (z. B. "S. 4"),
     * der die Antwort belegt - `null`, wenn kein Ausschnitt sie belegt. */
    sourceLocator: z.string().min(1).nullable(),
    grounded: z.boolean(),
  })
  .refine(exactlyOneCorrectOption, exactlyOneCorrectOptionMessage);

export const groundedLessonsAndQuestionsResponseSchema = z.object({
  lessons: z.array(groundedDraftLessonSchema).min(1),
  questions: z.array(groundedDraftQuestionSchema).min(5).max(10),
});

/**
 * Remediation lesson (Dev-Order Schritt 11) - shorter, focused re-explanation
 * targeting common misconceptions, plus 3-5 simple practice questions.
 */
export const remediationLessonSchema = z.object({
  title: localizedStringSchema,
  explanation: localizedStringSchema,
  keyPoints: localizedStringArraySchema,
  commonMisconceptions: localizedStringArraySchema,
});

export const remediationResponseSchema = z.object({
  lesson: remediationLessonSchema,
  questions: z.array(draftQuestionSchema).min(3).max(5),
});

/**
 * R1.2 (roadmap.md): strukturierte Extraktion aus einer hochgeladenen
 * offiziellen Quelle (R1.1) - im Unterschied zu einem freien KI-Entwurf
 * MUSS jedes Feld aus dem gelieferten Quelltext stammen (kein freier
 * KI-Entwurf), daher `locator` (Seitenbezug) und `confidence` pro Objective.
 * Bewusst kein bilinguales `Localized<T>` hier - das sind Referenzdaten aus
 * dem offiziellen (meist englischen) Exam-Dokument, nicht lernerseitige Prosa.
 */
export const blueprintObjectiveSchema = z.object({
  /** Offizieller Objective-Code, z. B. "1.2". */
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  /** Seiten-/Abschnittsbezug in der Quelle, z. B. "S. 4" - muss sich auf eine
   * der `== Seite N ==`-Markierungen im Quelltext beziehen. */
  locator: z.string().min(1),
  /** 0 = geraten/aus Kontext abgeleitet, 1 = wörtlich und eindeutig im Text gefunden. */
  confidence: z.number().min(0).max(1),
});

export const blueprintDomainSchema = z.object({
  name: z.string().min(1),
  /** Offizielle Gewichtung in Prozent, falls im Text angegeben - sonst null
   * (nicht raten, siehe R1.2-Plausibilitätsprüfung). */
  weightPercent: z.number().min(0).max(100).nullable(),
  objectives: z.array(blueprintObjectiveSchema).min(1),
});

export const blueprintExtractionSchema = z.object({
  certificationName: z.string().min(1),
  provider: z.string().min(1),
  examCode: z.string().min(1),
  /** Prüfungsrealismus-Ergänzung zu R1.2: reales Prüfungsformat, falls im
   * Text angegeben - sonst exakt `null` (dieselbe "nicht raten"-Regel wie
   * bei domain.weightPercent oben), damit der Exam-Generator nicht mit
   * erfundenen Werten arbeitet. */
  examQuestionCount: z.number().int().min(1).nullable(),
  examDurationMinutes: z.number().int().min(1).nullable(),
  passingScore: z.number().min(0).nullable(),
  scoreScale: z.string().min(1).nullable(),
  domains: z.array(blueprintDomainSchema).min(1),
});
