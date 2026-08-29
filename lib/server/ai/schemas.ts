import { z } from "zod";
import { localizedStringArraySchema, localizedStringSchema } from "@/lib/ai/schemas";

/**
 * Struktur für einen KI-Entwurf von Objectives + Sections EINER Domain
 * (roadmap2.md Dev-Order Schritt 3-5). Objective-Code/Titel/Beschreibung bleiben
 * bewusst einsprachig (Englisch) - das ist Referenzdaten-Fachsprache aus dem
 * offiziellen Exam, keine lernerseitige Prosa. Section-Titel sind bilingual wie
 * der Rest der lernerseitigen Inhalte.
 *
 * WICHTIG: Dies ist ein KI-Entwurf, KEINE offiziellen CompTIA-Objectives -
 * siehe roadmap2.md Phase 2/28 und den offenen Follow-up in Schritt 1 des
 * Trackers. certifications.lastVerifiedDate bleibt entsprechend NULL, bis ein
 * echter Abgleich mit dem offiziellen Dokument stattgefunden hat.
 */
export const draftSectionSchema = z.object({
  title: localizedStringSchema,
  estimatedMinutes: z.number().int().min(5).max(120),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
});

export const draftObjectiveSchema = z.object({
  /** Objective-Code im Stil der offiziellen Objectives, z. B. "1.2". */
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  sections: z.array(draftSectionSchema).min(1).max(6),
});

export const curriculumDraftForDomainResponseSchema = z.object({
  objectives: z.array(draftObjectiveSchema).min(1).max(10),
});

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
});

export const draftQuestionSchema = z
  .object({
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    type: z.enum([
      "knowledge",
      "comprehension",
      "application",
      "scenario",
      "troubleshooting",
    ]),
    question: localizedStringSchema,
    options: z.array(draftQuestionOptionSchema).length(4),
    explanation: localizedStringSchema,
  })
  .refine((q) => q.options.filter((o) => o.isCorrect).length === 1, {
    message: "Exakt eine Option muss isCorrect=true sein.",
  });

/**
 * Lessons + Questions in EINEM Call statt zwei (Dev-Order Schritt 6+7 kombiniert)
 * - Gemini's Free-Tier hat ein hartes Limit von 20 Requests/Tag pro Modell,
 * gemessen live über einen 429 "RESOURCE_EXHAUSTED" (Metric
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, quotaValue 20). Halbiert
 * die Anzahl nötiger Calls (23 statt 46 für alle Objectives).
 */
export const lessonsAndQuestionsForObjectiveResponseSchema = z.object({
  lessons: z.array(draftLessonSchema).min(1),
  questions: z.array(draftQuestionSchema).min(5).max(10),
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
