import { and, asc, eq, gt, inArray, like, sql } from "drizzle-orm";
import { z, type ZodType } from "zod";
import { generateStructured, type AIUsage } from "@/lib/ai/generate";
import { CURRICULUM_MODEL } from "@/lib/gemini";
import { extractSimulationSources } from "@/lib/markdown/simulation";
import { repairLearningBlocks, validateLearningBlocks } from "@/lib/markdown/validate";
import { estimateCostUsd, getAiBudgetStatus } from "@/lib/server/admin/content-generation";
import { shuffleOptions } from "@/lib/server/course-generation/variety";
import { MAX_ACCEPTED_ANSWERS, MAX_MATCHING_PAIRS, MAX_ORDERING_STEPS, normalizeShortAnswer, validateAnswerData, type AnswerData } from "@/lib/questions/answer-formats";
import { clientFor } from "@/lib/server/course-translation/service";
import { isAutoTranslateEnabled, startCourseTranslation } from "@/lib/server/course-translation/runner";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  contentReports,
  courseCheckpoints,
  domains,
  examAnswers,
  lessons,
  objectives,
  questionOptions,
  questions,
  quizAnswers,
  sections,
  type ContentReportReason,
} from "@/lib/server/db/schema";
import type { Locale, Localized } from "@/lib/types";
import {
  AI_ACTION_LABELS,
  MAX_INSTRUCTION,
  MAX_NEW_QUESTIONS,
  QUESTION_AI_ACTIONS,
  SECTION_AI_ACTIONS,
  type AiAction,
  type AiEstimate,
  type QuestionAiAction,
  type SectionAiAction,
} from "@/lib/workshop-ai";
import {
  formatQuestionsSystemPrompt,
  newQuestionsSystemPrompt,
  newQuestionsUserPrompt,
  objectiveSystemPrompt,
  objectiveUserPrompt,
  questionSystemPrompt,
  questionUserPrompt,
  sectionSystemPrompt,
  sectionUserPrompt,
  type CourseFacts,
} from "./ai-prompt";
import { createCheckpoint, EditorNotFoundError, EditValidationError, getSectionForEditor, nextHumanId, readQuestion } from "./service";
import { DIFFICULTIES, fingerprint, normalizeSection, QUESTION_TYPES, type NewQuestion, type QuestionSnapshot, type SectionSnapshot } from "./snapshots";

/**
 * KI-Nachbesserung in der Kurs-Werkstatt (roadmap3.md, Schritt 3). Grundsätze:
 * - Die KI liefert immer nur einen Vorschlag; gespeichert wird erst, wenn die Redaktion ihn übernimmt (unverändert oder
 *   angepasst) über die normalen Speicherwege des Editors, mit Herkunft „KI“ in den Versionen.
 * - Vor der ersten übernommenen KI-Änderung merkt sich die Werkstatt automatisch den ganzen Kurs (höchstens alle
 *   AUTO_CHECKPOINT_HOURS Stunden einer).
 * - Die KI schreibt in der Kurssprache. Ist der Inhalt schon übersetzt, wird die andere Sprache als veraltet markiert und
 *   über den Übersetzungslauf nachgezogen; bis dahin sehen Lernende die bisherige Übersetzung.
 * - Vorher gibt es eine Kostenschätzung, danach die tatsächlichen Kosten; sie summieren sich am Kurs (aiEditCostUsd).
 */

export const AI_EDIT_MODEL = CURRICULUM_MODEL;
export const AUTO_CHECKPOINT_PREFIX = "Automatisch vor KI-Überarbeitung";
const AUTO_CHECKPOINT_HOURS = 6;

export class AiEditError extends Error {}

const instruction = z.string().trim().max(MAX_INSTRUCTION).optional();
const uuid = z.string().uuid();

export const aiRequestSchema = z
  .discriminatedUnion("target", [
    z.object({ target: z.literal("section"), id: uuid, action: z.enum(SECTION_AI_ACTIONS), instruction }),
    z.object({ target: z.literal("question"), id: uuid, action: z.enum(QUESTION_AI_ACTIONS), instruction }),
    z.object({ target: z.literal("objective"), id: uuid, action: z.enum(["add_questions", "add_format_questions"]), count: z.number().int().min(1).max(MAX_NEW_QUESTIONS), instruction }),
    z.object({ target: z.literal("missing-objective"), domainId: uuid, code: z.string().trim().min(1).max(40), title: z.string().trim().min(1).max(300), action: z.literal("add_objective"), instruction }),
  ])
  .refine((r) => r.action !== "custom" || Boolean(r.instruction), { message: "Bei „Eigene Anweisung“ fehlt die Anweisung.", path: ["instruction"] });
export type AiRequest = z.infer<typeof aiRequestSchema>;

/* ------------------------------------------------------------------ Antwortschemas der KI (einsprachig) */

const line = z.string().trim().min(1).max(500);
const sectionAiSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(200_000),
  keyTakeaways: z.array(line).max(20),
  examFocusPoints: z.array(line).max(20),
  cheatSheet: z.string().max(20_000).nullable(),
  changes: z.string().max(1000),
});
type SectionAi = z.infer<typeof sectionAiSchema>;

const optionAiSchema = z.object({ text: z.string().trim().min(1).max(2000), isCorrect: z.boolean(), rationale: z.string().max(4000).nullable() });
const questionAiSchema = z.object({
  question: z.string().trim().min(1).max(20_000),
  explanation: z.string().trim().min(1).max(20_000),
  difficulty: z.enum(DIFFICULTIES),
  type: z.enum(QUESTION_TYPES),
  options: z.array(optionAiSchema).min(2).max(8),
  changes: z.string().max(1000),
});
type QuestionAi = z.infer<typeof questionAiSchema>;
const newQuestionAiSchema = questionAiSchema.omit({ changes: true }).extend({ options: z.array(optionAiSchema).length(4) });
const newQuestionsAiSchema = z.object({ questions: z.array(newQuestionAiSchema).min(1).max(MAX_NEW_QUESTIONS) });

/** Flach statt Union: nur das Feld des gewählten Formats ist gefüllt (einfacher für strukturierte KI-Antworten). */
const formatQuestionAiSchema = z.object({
  format: z.enum(["ordering", "short_answer", "matching"]),
  question: z.string().trim().min(1).max(20_000),
  explanation: z.string().trim().min(1).max(20_000),
  difficulty: z.enum(DIFFICULTIES),
  type: z.enum(QUESTION_TYPES),
  steps: z.array(z.string().trim().min(1).max(300)).max(MAX_ORDERING_STEPS),
  accepted: z.array(z.string().trim().min(1).max(200)).max(MAX_ACCEPTED_ANSWERS),
  pairs: z.array(z.object({ left: z.string().trim().min(1).max(300), right: z.string().trim().min(1).max(300) })).max(MAX_MATCHING_PAIRS),
});
const newFormatQuestionsAiSchema = z.object({ questions: z.array(formatQuestionAiSchema).min(1).max(MAX_NEW_QUESTIONS) });

const objectiveAiSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(1000),
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        estimatedMinutes: z.number().int().min(1).max(240),
        difficulty: z.enum(DIFFICULTIES),
        content: z.string().trim().min(1).max(200_000),
        keyTakeaways: z.array(line).max(20),
        examFocusPoints: z.array(line).max(20),
      }),
    )
    .min(1)
    .max(4),
  questions: z.array(newQuestionAiSchema).min(1).max(MAX_NEW_QUESTIONS),
});

/* ------------------------------------------------------------------ Vorschläge (an die Werkstatt) */

export type SectionProposal = { kind: "section"; sectionId: string; snapshot: SectionSnapshot; baseFingerprint: string; changes: string; repaired: boolean };
export type QuestionProposal = { kind: "question"; questionId: string; snapshot: QuestionSnapshot; baseFingerprint: string; changes: string };
export type QuestionsProposal = { kind: "questions"; objectiveId: string; questions: NewQuestion[] };
export type ObjectiveProposal = { kind: "objective"; domainId: string; code: string; title: string; description: string; sections: SectionSnapshot[]; questions: NewQuestion[]; repaired: boolean };
export type AiProposal = (SectionProposal | QuestionProposal | QuestionsProposal | ObjectiveProposal) & {
  action: AiAction;
  /** Sprache, in der die KI geschrieben hat (Kurssprache). */
  locale: Locale;
  costUsd: number | null;
  totalCostUsd: number | null;
};

export type Generate = <T>(system: string, user: string, schema: ZodType<T>) => Promise<T>;

/* ------------------------------------------------------------------ Hilfen */

type Cert = { id: string; name: string; locale: Locale; kind: string; ownerOrganizationId: string | null; translatedAt: Date | null; aiEditCostUsd: string | null };

async function loadCert(certId: string): Promise<Cert> {
  const [c] = await getDb()
    .select({ id: certifications.id, name: certifications.name, contentLocale: certifications.contentLocale, kind: certifications.kind, ownerOrganizationId: certifications.ownerOrganizationId, translatedAt: certifications.translatedAt, aiEditCostUsd: certifications.aiEditCostUsd })
    .from(certifications)
    .where(eq(certifications.id, certId))
    .limit(1);
  if (!c) throw new EditorNotFoundError("Kurs nicht gefunden.");
  return { ...c, locale: c.contentLocale === "en" ? "en" : "de" };
}

async function objectiveFacts(cert: Cert, objectiveId: string): Promise<CourseFacts> {
  const [o] = await getDb()
    .select({ code: objectives.code, title: objectives.title, description: objectives.description, domain: domains.name, certId: domains.certificationId })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(objectives.id, objectiveId))
    .limit(1);
  if (!o || o.certId !== cert.id) throw new EditorNotFoundError("Lernziel nicht gefunden.");
  return { name: cert.name, locale: cert.locale, objective: { code: o.code, title: o.title, description: o.description }, domain: o.domain };
}

async function openReports(targetType: "lesson" | "question", targetId: string): Promise<Partial<Record<ContentReportReason, number>>> {
  const rows = await getDb()
    .select({ reason: contentReports.reason, n: sql<number>`count(*)::int` })
    .from(contentReports)
    .where(and(eq(contentReports.targetType, targetType), eq(contentReports.targetId, targetId), eq(contentReports.status, "open")))
    .groupBy(contentReports.reason);
  return Object.fromEntries(rows.map((r) => [r.reason, Number(r.n)]));
}

/** Gleicher Text in beiden Sprachen? Dann ist der Inhalt noch nicht übersetzt und beide Felder bekommen den neuen Text. */
const same = <T>(l: Localized<T> | null) => !l || JSON.stringify(l.de) === JSON.stringify(l.en);
export const sectionIsLinked = (s: SectionSnapshot) => same(s.title) && same(s.content) && same(s.keyTakeaways) && same(s.examFocusPoints) && same(s.cheatSheet);
export const questionIsLinked = (q: QuestionSnapshot) => same(q.question) && same(q.explanation) && q.options.every((o) => same(o.text) && same(o.rationale));

/** Neuer Wert in der Kurssprache; bei verknüpften Sprachen in beiden, sonst bleibt die andere (veraltet) stehen. */
function put<T>(current: Localized<T> | null, value: T, locale: Locale, linked: boolean): Localized<T> {
  if (linked || !current) return { de: value, en: value };
  return { ...current, [locale]: value };
}
const both = <T>(v: T): Localized<T> => ({ de: v, en: v });

const tokens = (chars: number) => Math.ceil(chars / 3.5);
const SYSTEM_TOKENS = 3500;

function estimate(action: AiAction, inputChars: number, outputChars: number): AiEstimate {
  const inputTokens = SYSTEM_TOKENS + tokens(inputChars);
  const outputTokens = tokens(outputChars) + 300;
  return { action, usd: estimateCostUsd(inputTokens, outputTokens, AI_EDIT_MODEL), inputTokens, outputTokens };
}

const OUTPUT_FACTOR: Record<SectionAiAction, [number, number]> = {
  lively: [1.15, 0],
  expand: [2, 1500],
  example: [1, 1800],
  simulation: [1, 4500],
  possible: [1, 400],
  exam: [1, 400],
  fix_reports: [1, 0],
  custom: [1.2, 500],
};

/* ------------------------------------------------------------------ Kostenschätzung */

/** Geschätzte Kosten je Aktion für ein Ziel (ohne KI-Aufruf). */
export async function estimateAi(certId: string, target: { target: "section" | "question" | "objective" | "missing-objective"; id?: string; count?: number }): Promise<AiEstimate[]> {
  if (target.target === "section") {
    const { snapshot } = await getSectionForEditor(certId, target.id!);
    const chars = JSON.stringify({ c: snapshot.content.de, k: snapshot.keyTakeaways?.de, e: snapshot.examFocusPoints?.de, s: snapshot.cheatSheet?.de }).length;
    return SECTION_AI_ACTIONS.map((a) => estimate(a, chars + 600, chars * OUTPUT_FACTOR[a][0] + OUTPUT_FACTOR[a][1]));
  }
  if (target.target === "question") {
    const q = await readQuestion(getDb(), target.id!);
    if (!q) throw new EditorNotFoundError("Frage nicht gefunden.");
    const chars = JSON.stringify(q).length / 2;
    return QUESTION_AI_ACTIONS.map((a) => estimate(a, chars + 400, chars * 1.1));
  }
  if (target.target === "objective") {
    const n = Math.min(Math.max(target.count ?? 4, 1), MAX_NEW_QUESTIONS);
    return [estimate("add_questions", 12_000, n * 1600), estimate("add_format_questions", 12_000, n * 1200)];
  }
  return [estimate("add_objective", 1500, 3 * 7000 + 5 * 1600)];
}

/* ------------------------------------------------------------------ Vorschlag erzeugen */

function checkSection(content: string, cheat: string | null): string[] {
  return [...validateLearningBlocks(content), ...(cheat ? validateLearningBlocks(cheat).map((p) => `Merkzettel: ${p}`) : [])];
}

async function proposeSection(cert: Cert, sectionId: string, action: SectionAiAction, instr: string | null, generate: Generate): Promise<Omit<SectionProposal, "kind">> {
  const editor = await getSectionForEditor(cert.id, sectionId);
  const facts = await objectiveFacts(cert, editor.objectiveId);
  const [lesson] = await getDb().select({ id: lessons.id }).from(lessons).where(eq(lessons.sectionId, sectionId)).limit(1);
  const siblings = await getDb().select({ title: sections.title }).from(sections).where(eq(sections.objectiveId, editor.objectiveId)).orderBy(asc(sections.orderNum));
  const s = editor.snapshot;
  const l = cert.locale;
  const current = { title: s.title[l], content: s.content[l], keyTakeaways: s.keyTakeaways?.[l] ?? [], examFocusPoints: s.examFocusPoints?.[l] ?? [], cheatSheet: s.cheatSheet?.[l] || null };
  const input = { facts, siblings: siblings.map((x) => x.title[l]), current, reports: await openReports("lesson", lesson.id), instruction: instr };
  const system = sectionSystemPrompt(facts, action);

  let result: SectionAi = sectionAiSchema.parse(await generate(system, sectionUserPrompt(input), sectionAiSchema));
  let problems = checkSection(result.content, result.cheatSheet);
  if (problems.length) {
    result = sectionAiSchema.parse(await generate(system, sectionUserPrompt({ ...input, current: result, problems }), sectionAiSchema));
    problems = checkSection(result.content, result.cheatSheet);
  }
  let repaired = false;
  if (problems.length) {
    // Lieber den Rest des Vorschlags zeigen als nichts: kaputte Blöcke (z. B. halbe Simulation) fallen weg, das steht im Vorschlag.
    result = { ...result, content: repairLearningBlocks(result.content), cheatSheet: result.cheatSheet ? repairLearningBlocks(result.cheatSheet) : null };
    repaired = true;
  }
  if (action === "simulation" && extractSimulationSources(result.content).length === 0) throw new AiEditError("Die KI hat keine gültige Simulation geliefert. Bitte noch einmal versuchen oder eine Anweisung ergänzen.");

  const linked = sectionIsLinked(s);
  const snapshot = normalizeSection({
    title: put(s.title, result.title, l, linked),
    estimatedMinutes: s.estimatedMinutes,
    difficulty: s.difficulty,
    content: put(s.content, result.content, l, linked),
    keyTakeaways: put(s.keyTakeaways, result.keyTakeaways, l, linked),
    examFocusPoints: put(s.examFocusPoints, result.examFocusPoints, l, linked),
    // Kein Merkzettel vorher → nur einer, wenn die KI einen liefert; die andere Sprache bekommt ihn bis zur Übersetzung mit.
    cheatSheet: result.cheatSheet?.trim() ? (s.cheatSheet ? put(s.cheatSheet, result.cheatSheet, l, linked) : both(result.cheatSheet)) : s.cheatSheet,
  });
  return { sectionId, snapshot, baseFingerprint: editor.fingerprint, changes: result.changes, repaired };
}

function toOptions(q: QuestionAi | z.infer<typeof newQuestionAiSchema>) {
  const correct = q.options.filter((o) => o.isCorrect).length;
  if (correct !== 1) throw new AiEditError("Die KI hat keine Frage mit genau einer richtigen Antwort geliefert. Bitte noch einmal versuchen.");
  return q.options.map((o) => ({ ...o, rationale: o.isCorrect || !o.rationale?.trim() ? null : o.rationale }));
}

async function answerStats(questionId: string) {
  const db = getDb();
  const [a] = await db.select({ n: sql<number>`count(*)::int`, c: sql<number>`count(*) filter (where ${quizAnswers.isCorrect})::int` }).from(quizAnswers).where(eq(quizAnswers.questionId, questionId));
  const [b] = await db.select({ n: sql<number>`count(*)::int`, c: sql<number>`count(*) filter (where ${examAnswers.isCorrect})::int` }).from(examAnswers).where(eq(examAnswers.questionId, questionId));
  return { n: Number(a.n) + Number(b.n), correct: Number(a.c) + Number(b.c) };
}

async function proposeQuestion(cert: Cert, questionId: string, action: QuestionAiAction, instr: string | null, generate: Generate): Promise<Omit<QuestionProposal, "kind">> {
  const [row] = await getDb()
    .select({ objectiveId: questions.objectiveId, certId: domains.certificationId })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!row || row.certId !== cert.id) throw new EditorNotFoundError("Frage nicht gefunden.");
  const facts = await objectiveFacts(cert, row.objectiveId);
  const q = (await readQuestion(getDb(), questionId))!;
  if (q.format) throw new AiEditError("Fragen mit Reihenfolge, Kurzantwort oder Zuordnung lassen sich nicht per KI überarbeiten; bitte von Hand bearbeiten.");
  const l = cert.locale;
  const current = { question: q.question[l], explanation: q.explanation[l], difficulty: q.difficulty, type: q.type, options: q.options.map((o) => ({ text: o.text[l], isCorrect: o.isCorrect, rationale: o.rationale?.[l] || null })) };
  const result = questionAiSchema.parse(
    await generate(questionSystemPrompt(facts, action, q.options.length), questionUserPrompt({ facts, current, reports: await openReports("question", questionId), instruction: instr, stats: await answerStats(questionId) }), questionAiSchema),
  );
  if (result.options.length !== q.options.length) throw new AiEditError("Die KI hat die Anzahl der Antwortoptionen geändert. Bitte noch einmal versuchen.");
  const opts = toOptions(result);
  const linked = questionIsLinked(q);
  const snapshot: QuestionSnapshot = {
    question: put(q.question, result.question, l, linked),
    explanation: put(q.explanation, result.explanation, l, linked),
    difficulty: result.difficulty,
    type: result.type,
    // Optionen behalten ihre IDs und Plätze (Antworten der Lernenden hängen daran).
    options: q.options.map((o, i) => ({
      ...o,
      text: put(o.text, opts[i].text, l, linked),
      isCorrect: opts[i].isCorrect,
      rationale: opts[i].rationale ? put(o.rationale, opts[i].rationale!, l, linked) : opts[i].isCorrect ? null : o.rationale,
    })),
  };
  return { questionId, snapshot, baseFingerprint: fingerprint(q), changes: result.changes };
}

const toNewQuestion = (q: z.infer<typeof newQuestionAiSchema>): NewQuestion => ({
  question: both(q.question),
  explanation: both(q.explanation),
  difficulty: q.difficulty,
  type: q.type,
  // Gemischt wie beim Import, damit die richtige Antwort nicht immer vorn steht.
  options: shuffleOptions(
    toOptions(q).map((o) => ({ text: both(o.text), isCorrect: o.isCorrect, rationale: o.rationale ? both(o.rationale) : null })),
    both(q.explanation),
    q.question,
  ),
});

async function proposeQuestions(cert: Cert, objectiveId: string, count: number, instr: string | null, generate: Generate): Promise<Omit<QuestionsProposal, "kind">> {
  const facts = await objectiveFacts(cert, objectiveId);
  const l = cert.locale;
  const db = getDb();
  const lessonRows = await db.select({ title: sections.title, content: lessons.content }).from(sections).innerJoin(lessons, eq(lessons.sectionId, sections.id)).where(eq(sections.objectiveId, objectiveId)).orderBy(asc(sections.orderNum));
  const existing = await db.select({ question: questions.question }).from(questions).where(and(eq(questions.objectiveId, objectiveId), eq(questions.stale, false)));
  // Lektionen gekürzt: die Fragen sollen sich daraus beantworten lassen, mehr braucht die KI nicht.
  const budget = Math.floor(30_000 / Math.max(lessonRows.length, 1));
  const lessonsText = lessonRows.map((r) => `## ${r.title[l]}\n${r.content[l].slice(0, budget)}`);
  const result = newQuestionsAiSchema.parse(
    await generate(newQuestionsSystemPrompt(facts), newQuestionsUserPrompt({ facts, lessons: lessonsText, existing: existing.map((q) => q.question[l].slice(0, 300)), count, instruction: instr }), newQuestionsAiSchema),
  );
  return { objectiveId, questions: result.questions.slice(0, count).map(toNewQuestion) };
}

/** KI-Antwort → Formatfrage (in beiden Sprachen gleich, bis die Übersetzung läuft). Unbrauchbare Lösungsdaten werden verworfen. */
export function toFormatQuestion(q: z.infer<typeof formatQuestionAiSchema>): NewQuestion | null {
  const data: AnswerData =
    q.format === "ordering"
      ? { steps: q.steps.map((t, i) => ({ id: `s${i + 1}`, text: both(t) })) }
      : q.format === "short_answer"
        ? { accepted: q.accepted.filter((a, i, all) => all.findIndex((b) => normalizeShortAnswer(b) === normalizeShortAnswer(a)) === i) }
        : { pairs: q.pairs.map((p, i) => ({ id: `p${i + 1}`, left: both(p.left), right: both(p.right) })) };
  if (validateAnswerData(q.format, data).length > 0) return null;
  return { question: both(q.question), explanation: both(q.explanation), difficulty: q.difficulty, type: q.type, options: [], format: q.format, answerData: data };
}

async function proposeFormatQuestions(cert: Cert, objectiveId: string, count: number, instr: string | null, generate: Generate): Promise<Omit<QuestionsProposal, "kind">> {
  const facts = await objectiveFacts(cert, objectiveId);
  const l = cert.locale;
  const db = getDb();
  const lessonRows = await db.select({ title: sections.title, content: lessons.content }).from(sections).innerJoin(lessons, eq(lessons.sectionId, sections.id)).where(eq(sections.objectiveId, objectiveId)).orderBy(asc(sections.orderNum));
  const existing = await db.select({ question: questions.question }).from(questions).where(and(eq(questions.objectiveId, objectiveId), eq(questions.stale, false)));
  const budget = Math.floor(30_000 / Math.max(lessonRows.length, 1));
  const lessonsText = lessonRows.map((r) => `## ${r.title[l]}\n${r.content[l].slice(0, budget)}`);
  const result = newFormatQuestionsAiSchema.parse(
    await generate(formatQuestionsSystemPrompt(facts), newQuestionsUserPrompt({ facts, lessons: lessonsText, existing: existing.map((q) => q.question[l].slice(0, 300)), count, instruction: instr }), newFormatQuestionsAiSchema),
  );
  const usable = result.questions.slice(0, count).map(toFormatQuestion).filter((q): q is NewQuestion => q !== null);
  if (usable.length === 0) throw new AiEditError("Die KI hat keine brauchbaren Formatfragen geliefert. Bitte noch einmal versuchen oder eine Anweisung ergänzen.");
  return { objectiveId, questions: usable };
}

async function proposeObjective(cert: Cert, req: Extract<AiRequest, { target: "missing-objective" }>, generate: Generate): Promise<Omit<ObjectiveProposal, "kind">> {
  const db = getDb();
  const [dom] = await db.select().from(domains).where(and(eq(domains.id, req.domainId), eq(domains.certificationId, cert.id))).limit(1);
  if (!dom) throw new EditorNotFoundError("Domain nicht gefunden.");
  await assertCodeFree(cert.id, req.code);
  const neighbours = await db.select({ code: objectives.code, title: objectives.title }).from(objectives).where(eq(objectives.domainId, dom.id)).orderBy(asc(objectives.code));
  const system = objectiveSystemPrompt({ name: cert.name, locale: cert.locale, domain: dom.name });
  const input = { code: req.code, title: req.title, domain: dom.name, neighbours: neighbours.map((n) => `${n.code} ${n.title}`), instruction: req.instruction || null };
  let result = objectiveAiSchema.parse(await generate(system, objectiveUserPrompt(input), objectiveAiSchema));
  let problems = result.sections.flatMap((s) => validateLearningBlocks(s.content).map((p) => `${s.title}: ${p}`));
  if (problems.length) {
    result = objectiveAiSchema.parse(await generate(system, objectiveUserPrompt({ ...input, problems }), objectiveAiSchema));
    problems = result.sections.flatMap((s) => validateLearningBlocks(s.content));
  }
  const repaired = problems.length > 0;
  return {
    domainId: dom.id,
    code: req.code,
    title: result.title,
    description: result.description,
    sections: result.sections.map((s) =>
      normalizeSection({
        title: both(s.title),
        estimatedMinutes: s.estimatedMinutes,
        difficulty: s.difficulty,
        content: both(repaired ? repairLearningBlocks(s.content) : s.content),
        keyTakeaways: both(s.keyTakeaways),
        examFocusPoints: both(s.examFocusPoints),
        cheatSheet: null,
      }),
    ),
    questions: result.questions.map(toNewQuestion),
    repaired,
  };
}

async function assertCodeFree(certId: string, code: string) {
  const [taken] = await getDb()
    .select({ id: objectives.id })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(domains.certificationId, certId), eq(objectives.code, code)))
    .limit(1);
  if (taken) throw new EditValidationError([`Das Lernziel ${code} gibt es im Kurs schon.`]);
}

/**
 * Vorschlag der KI für eine Aktion. Speichert nichts außer den Kosten am Kurs. `deps.generate` ersetzt in Tests den
 * KI-Aufruf.
 */
export async function proposeAi(certId: string, req: AiRequest, deps: { generate?: Generate } = {}): Promise<AiProposal> {
  const cert = await loadCert(certId);
  const budget = deps.generate ? null : await getAiBudgetStatus();
  if (budget?.exceeded) throw new AiEditError(`Das KI-Budget ist ausgeschöpft (${budget.spentUsd.toFixed(2)} von ${budget.limitUsd.toFixed(2)} USD).`);

  let costUsd: number | null = null;
  const onUsage = (u: AIUsage) => {
    const c = estimateCostUsd(u.promptTokens, u.completionTokens, u.model, u.cachedTokens);
    if (c !== null) costUsd = (costUsd ?? 0) + c;
  };
  const client = deps.generate ? undefined : await clientFor(cert);
  const generate: Generate = deps.generate ?? ((system, user, schema) => generateStructured(system, user, schema, AI_EDIT_MODEL, onUsage, client));
  const instr = req.instruction || null;

  let proposal: AiProposal;
  const meta = { action: req.action, locale: cert.locale, costUsd: null, totalCostUsd: null };
  if (req.target === "section") proposal = { kind: "section", ...(await proposeSection(cert, req.id, req.action, instr, generate)), ...meta };
  else if (req.target === "question") proposal = { kind: "question", ...(await proposeQuestion(cert, req.id, req.action, instr, generate)), ...meta };
  else if (req.target === "objective") proposal = { kind: "questions", ...(await (req.action === "add_format_questions" ? proposeFormatQuestions : proposeQuestions)(cert, req.id, req.count, instr, generate)), ...meta };
  else proposal = { kind: "objective", ...(await proposeObjective(cert, req, generate)), ...meta };

  const total = (Number(cert.aiEditCostUsd) || 0) + (costUsd ?? 0);
  if (costUsd !== null) await getDb().update(certifications).set({ aiEditCostUsd: String(total) }).where(eq(certifications.id, certId));
  return { ...proposal, costUsd, totalCostUsd: cert.aiEditCostUsd !== null || costUsd !== null ? total : null };
}

/* ------------------------------------------------------------------ Übernehmen */

export const aiAcceptSchema = z.object({ action: z.enum(Object.keys(AI_ACTION_LABELS) as [AiAction, ...AiAction[]]), resolveReports: z.boolean().optional() });
export type AiAccept = z.infer<typeof aiAcceptSchema>;

export const aiNote = (action: AiAction, note?: string | null) => [`KI: ${AI_ACTION_LABELS[action].de}`, note].filter(Boolean).join(" · ");

/**
 * Vor der ersten übernommenen KI-Änderung den ganzen Kurs merken, damit sich eine Überarbeitungsrunde als Ganzes
 * zurücknehmen lässt. Höchstens ein automatischer Stand alle AUTO_CHECKPOINT_HOURS Stunden.
 */
export async function ensureAiCheckpoint(certId: string, userId: string | null, now = new Date()): Promise<{ created: boolean; name: string | null }> {
  const since = new Date(now.getTime() - AUTO_CHECKPOINT_HOURS * 3600_000);
  const [recent] = await getDb()
    .select({ id: courseCheckpoints.id, name: courseCheckpoints.name })
    .from(courseCheckpoints)
    .where(and(eq(courseCheckpoints.certificationId, certId), like(courseCheckpoints.name, `${AUTO_CHECKPOINT_PREFIX}%`), gt(courseCheckpoints.createdAt, since)))
    .limit(1);
  if (recent) return { created: false, name: recent.name };
  const name = `${AUTO_CHECKPOINT_PREFIX} (${now.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" })})`;
  await createCheckpoint(certId, name, userId);
  return { created: true, name };
}

export type AiAcceptResult = { checkpoint: string | null; translation: "started" | "running" | "not_needed" | "off" };

/**
 * Nach dem Speichern eines übernommenen Vorschlags: bereits übersetzte Inhalte als veraltet markieren, gemeldete Fehler
 * auf Wunsch als erledigt schließen und – wenn der Kurs übersetzt ist – den Übersetzungslauf anstoßen (er übersetzt nur
 * Veraltetes und noch Einsprachiges).
 */
export async function finishAiAccept(
  certId: string,
  changed: { sections?: string[]; questions?: string[] },
  opts: { userId: string | null; resolveReports?: boolean; checkpoint: string | null; startTranslation?: boolean },
): Promise<AiAcceptResult> {
  const db = getDb();
  let outdated = false;
  for (const id of changed.sections ?? []) {
    const { snapshot } = await getSectionForEditor(certId, id);
    const translated = !sectionIsLinked(snapshot);
    await db.update(lessons).set({ translationOutdated: translated }).where(eq(lessons.sectionId, id));
    outdated ||= translated;
    if (opts.resolveReports) {
      const [lesson] = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.sectionId, id)).limit(1);
      await resolveOpen("lesson", [lesson.id], opts.userId);
    }
  }
  for (const id of changed.questions ?? []) {
    const q = await readQuestion(db, id);
    if (!q) continue;
    const translated = !questionIsLinked(q);
    await db.update(questions).set({ translationOutdated: translated }).where(eq(questions.id, id));
    outdated ||= translated;
  }
  if (opts.resolveReports && changed.questions?.length) await resolveOpen("question", changed.questions, opts.userId);

  const cert = await loadCert(certId);
  // Einsprachige Kurse bleiben einsprachig; in übersetzten Kursen kommen Veraltetes und Neues gleich in die Übersetzung.
  if (!cert.translatedAt && !outdated) return { checkpoint: opts.checkpoint, translation: "not_needed" };
  if (!isAutoTranslateEnabled() || opts.startTranslation === false) return { checkpoint: opts.checkpoint, translation: "off" };
  const started = await startCourseTranslation(certId);
  return { checkpoint: opts.checkpoint, translation: started === "already_running" ? "running" : "started" };
}

async function resolveOpen(targetType: "lesson" | "question", ids: string[], userId: string | null) {
  if (!ids.length) return;
  await getDb()
    .update(contentReports)
    .set({ status: "resolved", resolvedByUserId: userId, resolvedAt: new Date() })
    .where(and(eq(contentReports.targetType, targetType), inArray(contentReports.targetId, ids), eq(contentReports.status, "open")));
}

/** Fehlendes Lernziel samt Lektionen und Fragen anlegen (übernommener Vorschlag, ggf. angepasst). */
export const objectiveAcceptSchema = z.object({
  domainId: uuid,
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(1000),
});

export async function createObjectiveWithContent(
  certId: string,
  input: z.infer<typeof objectiveAcceptSchema> & { sections: SectionSnapshot[]; questions: NewQuestion[] },
): Promise<{ objectiveId: string; sectionIds: string[]; questionIds: string[] }> {
  const problems = input.sections.flatMap((s, i) => validateLearningBlocks(s.content.de).map((p) => `Lektion ${i + 1}: ${p}`));
  if (problems.length) throw new EditValidationError(problems);
  if (!input.sections.length) throw new EditValidationError(["Mindestens eine Lektion."]);
  await assertCodeFree(certId, input.code);
  return getDb().transaction(async (tx) => {
    const [dom] = await tx.select({ id: domains.id }).from(domains).where(and(eq(domains.id, input.domainId), eq(domains.certificationId, certId))).limit(1);
    if (!dom) throw new EditorNotFoundError("Domain nicht gefunden.");
    const [obj] = await tx.insert(objectives).values({ domainId: dom.id, code: input.code, title: input.title, description: input.description || null }).returning({ id: objectives.id });
    const sectionIds: string[] = [];
    for (const [i, raw] of input.sections.entries()) {
      const s = normalizeSection(raw);
      const [sec] = await tx.insert(sections).values({ objectiveId: obj.id, orderNum: i + 1, title: s.title, estimatedMinutes: s.estimatedMinutes, difficulty: s.difficulty }).returning({ id: sections.id });
      await tx.insert(lessons).values({ sectionId: sec.id, content: s.content, keyTakeaways: s.keyTakeaways, examFocusPoints: s.examFocusPoints, cheatSheet: s.cheatSheet, modelVersion: "ai-edit" });
      sectionIds.push(sec.id);
    }
    const questionIds: string[] = [];
    for (const q of input.questions) {
      const [row] = await tx
        .insert(questions)
        .values({ humanId: await nextHumanId(tx, certId, obj.id, input.code), objectiveId: obj.id, difficulty: q.difficulty, type: q.type, question: q.question, explanation: q.explanation })
        .returning({ id: questions.id });
      await tx.insert(questionOptions).values(q.options.map((o, k) => ({ questionId: row.id, orderNum: k + 1, text: o.text, isCorrect: o.isCorrect, rationale: o.rationale })));
      questionIds.push(row.id);
    }
    await tx.update(certifications).set({ updatedAt: new Date() }).where(eq(certifications.id, certId));
    return { objectiveId: obj.id, sectionIds, questionIds };
  });
}
