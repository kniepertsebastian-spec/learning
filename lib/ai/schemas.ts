import { z } from "zod";

export const localizedStringSchema = z.object({
  de: z.string().min(1),
  en: z.string().min(1),
});

export const localizedStringArraySchema = z.object({
  de: z.array(z.string().min(1)).min(2),
  en: z.array(z.string().min(1)).min(2),
});

/** Quizfrage, wie sie von der KI geliefert wird (ohne `id` - die wird lokal vergeben). */
export const generatedQuizQuestionSchema = z.object({
  question: localizedStringSchema,
  options: localizedStringArraySchema,
  correctIndex: z.number().int().min(0),
  explanation: localizedStringSchema,
});

export const curriculumRequestSchema = z.object({
  certName: z.string().min(1),
  totalDays: z.number().int().min(1).max(180),
});

export const curriculumModuleSchema = z.object({
  day: z.number().int().min(1),
  title: localizedStringSchema,
  summary: localizedStringSchema,
});

export const curriculumResponseSchema = z.object({
  modules: z.array(curriculumModuleSchema).min(1),
});

export const chapterRequestSchema = z.object({
  certName: z.string().min(1),
  day: z.number().int().min(1),
  moduleTitle: localizedStringSchema,
});

export const chapterResponseSchema = z.object({
  contentMarkdown: localizedStringSchema,
  questions: z.array(generatedQuizQuestionSchema).length(5),
});

export const mockExamRequestSchema = z.object({
  certName: z.string().min(1),
  questionCount: z.number().int().min(1).max(100),
  focusAreas: z.array(z.string().min(1)).optional(),
});

export const mockExamResponseSchema = z.object({
  questions: z.array(generatedQuizQuestionSchema).min(1),
});
