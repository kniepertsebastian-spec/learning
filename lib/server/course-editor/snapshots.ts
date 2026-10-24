import { createHash } from "node:crypto";
import { z } from "zod";
import { validateAnswerData, type AnswerData } from "@/lib/questions/answer-formats";
import type { Localized } from "@/lib/types";

/**
 * Bearbeitbarer Stand einer Lektion und einer Frage in der Kurs-Werkstatt (roadmap3.md, Schritt 1). Dieselben Formen
 * dienen als Eingabe beim Speichern und als Inhalt einer Revision (content_revisions.data), damit Zurücksetzen genau
 * das zurückschreibt, was der Editor auch speichern würde.
 */

const text = (max: number) => z.string().max(max);
const localized = (max: number) => z.object({ de: text(max).trim().min(1), en: text(max).trim().min(1) });
const localizedList = z.object({ de: z.array(text(500).trim().min(1)).max(20), en: z.array(text(500).trim().min(1)).max(20) });

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export const QUESTION_TYPES = ["knowledge", "comprehension", "application", "scenario", "troubleshooting"] as const;

export const sectionSnapshotSchema = z.object({
  title: localized(200),
  estimatedMinutes: z.number().int().min(1).max(240).nullable(),
  difficulty: z.string().max(40).nullable(),
  content: localized(200_000),
  keyTakeaways: localizedList.nullable(),
  examFocusPoints: localizedList.nullable(),
  cheatSheet: z.object({ de: text(20_000), en: text(20_000) }).nullable(),
});
export type SectionSnapshot = z.infer<typeof sectionSnapshotSchema>;

export const questionOptionSnapshotSchema = z.object({
  id: z.string().uuid(),
  orderNum: z.number().int(),
  text: localized(2000),
  isCorrect: z.boolean(),
  rationale: z.object({ de: text(4000), en: text(4000) }).nullable(),
});

/** Neue Antwortformate (Auswahlfragen haben kein Format): Optionen bleiben leer, die Lösung steht in `answerData`. */
export const FORMAT_QUESTION_FORMATS = ["ordering", "short_answer", "matching"] as const;
const formatFields = { format: z.enum(FORMAT_QUESTION_FORMATS).optional(), answerData: z.custom<AnswerData>((v) => v === undefined || (typeof v === "object" && v !== null)).optional() };

/** Auswahlfrage: 2 bis 8 Optionen, genau eine richtig. Formatfrage: keine Optionen, gültige Lösungsdaten. */
function checkQuestionShape(q: { format?: (typeof FORMAT_QUESTION_FORMATS)[number]; answerData?: AnswerData; options: Array<{ isCorrect: boolean }> }, ctx: z.RefinementCtx) {
  if (q.format) {
    if (q.options.length > 0) ctx.addIssue({ code: "custom", message: "Fragen mit diesem Antwortformat haben keine Antwortoptionen." });
    for (const problem of validateAnswerData(q.format, q.answerData)) ctx.addIssue({ code: "custom", message: problem });
    return;
  }
  if (q.answerData !== undefined) ctx.addIssue({ code: "custom", message: "Auswahlfragen haben keine zusätzlichen Lösungsdaten." });
  if (q.options.length < 2) ctx.addIssue({ code: "custom", message: "Mindestens zwei Antwortoptionen nötig." });
  if (q.options.filter((o) => o.isCorrect).length !== 1) ctx.addIssue({ code: "custom", message: "Genau eine Antwortoption muss richtig sein." });
}

export const questionSnapshotSchema = z
  .object({
    question: localized(20_000),
    explanation: localized(20_000),
    difficulty: z.enum(DIFFICULTIES),
    type: z.enum(QUESTION_TYPES),
    options: z.array(questionOptionSnapshotSchema).max(8),
    ...formatFields,
  })
  .superRefine(checkQuestionShape);
export type QuestionSnapshot = z.infer<typeof questionSnapshotSchema>;

/** Neue Frage: Optionen noch ohne ID (bekommen sie beim Anlegen). */
export const newQuestionSchema = z
  .object({
    question: localized(20_000),
    explanation: localized(20_000),
    difficulty: z.enum(DIFFICULTIES),
    type: z.enum(QUESTION_TYPES),
    options: z.array(z.object({ text: localized(2000), isCorrect: z.boolean(), rationale: z.object({ de: text(4000), en: text(4000) }).nullable() })).max(8),
    ...formatFields,
  })
  .superRefine(checkQuestionShape);
export type NewQuestion = z.infer<typeof newQuestionSchema>;

/** Stabile Darstellung (Schlüssel sortiert), damit gleicher Inhalt immer denselben Fingerabdruck ergibt. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]));
  return value;
}

/**
 * Fingerabdruck eines Stands. Der Editor schickt den Fingerabdruck mit, auf dem er aufbaut; weicht der aktuelle ab
 * (jemand anderes oder ein Skript hat inzwischen gespeichert), wird nicht überschrieben.
 */
export function fingerprint(snapshot: SectionSnapshot | QuestionSnapshot): string {
  return createHash("sha256").update(JSON.stringify(stable(snapshot))).digest("hex").slice(0, 24);
}

/** Optionalen Merkzettel/Listen leer → null, damit „nichts eingetragen“ und „gibt es nicht“ gleich gespeichert werden. */
export function normalizeSection(s: SectionSnapshot): SectionSnapshot {
  const emptyList = (l: { de: string[]; en: string[] } | null) => (l && (l.de.length || l.en.length) ? l : null);
  const cheat = s.cheatSheet && (s.cheatSheet.de.trim() || s.cheatSheet.en.trim()) ? s.cheatSheet : null;
  return { ...s, keyTakeaways: emptyList(s.keyTakeaways), examFocusPoints: emptyList(s.examFocusPoints), cheatSheet: cheat };
}

export type { Localized };
