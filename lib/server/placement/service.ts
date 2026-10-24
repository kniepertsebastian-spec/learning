/** Einstiegstest je Kapitel (roadmap_didaktik Phase 4.2): Test zusammenstellen, serverseitig auswerten, Kapitel überspringen. */
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  companyAssignments,
  domains,
  lessonCompletions,
  lessons,
  lessonSkips,
  mandatoryRules,
  objectives,
  questionOptions,
  questions,
  sections,
} from "@/lib/server/db/schema";
import { applyChapterSkip } from "@/lib/server/psrp/implicit";
import type { AnswerConfidence, Localized } from "@/lib/types";
import { evaluatePlacement, PLACEMENT_MAX_QUESTIONS, type PlacementEvaluation } from "./evaluate";

export class PlacementNotFoundError extends Error {}
export class PlacementIncompleteError extends Error {}

export interface PlacementQuestion {
  questionId: string;
  objectiveId: string;
  objectiveCode: string;
  objectiveTitle: string;
  question: Localized<string>;
  /** Ohne `isCorrect`: bewertet wird serverseitig. */
  options: Array<{ id: string; text: Localized<string>; orderNum: number }>;
}

export interface PlacementTest {
  domainId: string;
  domainName: string;
  certificationId: string;
  questions: PlacementQuestion[];
  /** false bei Firmen-Pflichtkursen, bei denen der Firmen-Admin das Überspringen nicht erlaubt hat. */
  skipAllowed: boolean;
}

/**
 * Überspringen ist erlaubt, solange der Person kein offener Firmenkurs-Auftrag für diesen Kurs zugewiesen ist, es sei denn,
 * die zugehörige Pflichtregel erlaubt es ausdrücklich. Eine Zuweisung ohne Regel zählt als Pflicht (nicht erlaubt).
 */
export async function placementSkipAllowed(userId: string, certificationId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ ruleId: companyAssignments.mandatoryRuleId, allow: mandatoryRules.allowPlacementSkip })
    .from(companyAssignments)
    .leftJoin(mandatoryRules, eq(mandatoryRules.id, companyAssignments.mandatoryRuleId))
    .where(and(eq(companyAssignments.userId, userId), eq(companyAssignments.certificationId, certificationId), ne(companyAssignments.status, "completed")));
  return rows.every((r) => r.ruleId !== null && r.allow === true);
}

async function buildTest(domainId: string): Promise<Omit<PlacementTest, "skipAllowed">> {
  const db = getDb();
  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
  if (!domain) throw new PlacementNotFoundError();
  const objectiveRows = await db.select().from(objectives).where(eq(objectives.domainId, domainId)).orderBy(asc(objectives.code));
  if (objectiveRows.length === 0) return { domainId, domainName: domain.name, certificationId: domain.certificationId, questions: [] };
  const questionRows = await db
    .select()
    .from(questions)
    .where(and(inArray(questions.objectiveId, objectiveRows.map((o) => o.id)), eq(questions.stale, false), eq(questions.probeOnly, false), eq(questions.answerFormat, "choice")))
    .orderBy(asc(questions.humanId));
  const picked: Array<{ objective: (typeof objectiveRows)[number]; question: (typeof questionRows)[number] }> = [];
  for (const objective of objectiveRows) {
    const question = questionRows.find((q) => q.objectiveId === objective.id);
    if (question) picked.push({ objective, question });
    if (picked.length >= PLACEMENT_MAX_QUESTIONS) break;
  }
  const options = picked.length
    ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, picked.map((p) => p.question.id))).orderBy(asc(questionOptions.orderNum))
    : [];
  return {
    domainId,
    domainName: domain.name,
    certificationId: domain.certificationId,
    questions: picked.map(({ objective, question }) => ({
      questionId: question.id,
      objectiveId: objective.id,
      objectiveCode: objective.code,
      objectiveTitle: objective.title,
      question: question.question,
      options: options.filter((o) => o.questionId === question.id).map((o) => ({ id: o.id, text: o.text, orderNum: o.orderNum })),
    })),
  };
}

export async function loadPlacementTest(userId: string, domainId: string): Promise<PlacementTest> {
  const test = await buildTest(domainId);
  return { ...test, skipAllowed: await placementSkipAllowed(userId, test.certificationId) };
}

export interface PlacementSubmission {
  questionId: string;
  selectedOptionId: string;
  confidence: AnswerConfidence;
}

export interface PlacementResult extends PlacementEvaluation {
  /** Wurde das Bestehen tatsächlich in Überspringen umgesetzt (false z. B. bei Pflichtkurs ohne Erlaubnis)? */
  skipApplied: boolean;
  skipAllowed: boolean;
  skippedLessons: number;
  questions: Array<{
    questionId: string;
    objectiveId: string;
    objectiveCode: string;
    objectiveTitle: string;
    isCorrect: boolean;
    selectedOptionId: string;
    correctOptionId: string;
    explanation: Localized<string>;
    confidence: AnswerConfidence;
  }>;
  /** Lernziele, die offen bleiben, mit der ersten Lektion zum Einstieg. */
  open: Array<{ objectiveId: string; objectiveCode: string; objectiveTitle: string; firstSectionId: string | null }>;
}

/** Wertet den Test aus; bei Bestehen (und erlaubtem Überspringen) werden die sicher beherrschten Lernziele übersprungen. */
export async function submitPlacement(userId: string, domainId: string, submissions: PlacementSubmission[]): Promise<PlacementResult> {
  const db = getDb();
  const test = await buildTest(domainId);
  if (test.questions.length === 0) throw new PlacementNotFoundError();
  const byQuestion = new Map(submissions.map((s) => [s.questionId, s]));
  if (!test.questions.every((q) => byQuestion.has(q.questionId))) throw new PlacementIncompleteError();

  const optionRows = await db.select().from(questionOptions).where(inArray(questionOptions.questionId, test.questions.map((q) => q.questionId)));
  const explanations = await db.select({ id: questions.id, explanation: questions.explanation }).from(questions).where(inArray(questions.id, test.questions.map((q) => q.questionId)));
  const explanationBy = new Map(explanations.map((e) => [e.id, e.explanation]));

  const graded = test.questions.map((q) => {
    const submission = byQuestion.get(q.questionId)!;
    const correct = optionRows.find((o) => o.questionId === q.questionId && o.isCorrect);
    return { q, submission, correctOptionId: correct?.id ?? "", isCorrect: Boolean(correct) && correct!.id === submission.selectedOptionId };
  });
  const evaluation = evaluatePlacement(graded.map((g) => ({ objectiveId: g.q.objectiveId, isCorrect: g.isCorrect, confidence: g.submission.confidence })));
  const skipAllowed = await placementSkipAllowed(userId, test.certificationId);
  const skipApplied = evaluation.passed && skipAllowed && evaluation.skipObjectiveIds.length > 0;

  let skippedLessons = 0;
  if (skipApplied) {
    for (const objectiveId of evaluation.skipObjectiveIds) await applyChapterSkip(userId, objectiveId);
    const sectionRows = await db
      .select({ id: sections.id })
      .from(sections)
      .innerJoin(lessons, eq(lessons.sectionId, sections.id))
      .where(inArray(sections.objectiveId, evaluation.skipObjectiveIds));
    const sectionIds = sectionRows.map((s) => s.id);
    if (sectionIds.length > 0) {
      const done = await db
        .select({ sectionId: lessonCompletions.sectionId })
        .from(lessonCompletions)
        .where(and(eq(lessonCompletions.userId, userId), inArray(lessonCompletions.sectionId, sectionIds)));
      const doneIds = new Set(done.map((d) => d.sectionId));
      const toSkip = sectionIds.filter((id) => !doneIds.has(id));
      if (toSkip.length > 0) {
        const inserted = await db
          .insert(lessonSkips)
          .values(toSkip.map((sectionId) => ({ userId, sectionId })))
          .onConflictDoNothing()
          .returning({ id: lessonSkips.id });
        skippedLessons = inserted.length;
      }
    }
  }

  // Schwach: falsch oder nur geraten. Ohne Schwachstellen bleibt alles offen, wenn nichts übersprungen wurde (z. B. zu wenig „sicher“).
  const weak = graded.filter((g) => !g.isCorrect || g.submission.confidence === "guessed").map((g) => g.q.objectiveId);
  const openIds = new Set(weak.length > 0 ? weak : skipApplied ? [] : test.questions.map((q) => q.objectiveId));
  const firstSections = openIds.size
    ? await db
        .select({ id: sections.id, objectiveId: sections.objectiveId })
        .from(sections)
        .innerJoin(lessons, eq(lessons.sectionId, sections.id))
        .where(inArray(sections.objectiveId, [...openIds]))
        .orderBy(asc(sections.orderNum))
    : [];
  return {
    ...evaluation,
    skipApplied,
    skipAllowed,
    skippedLessons,
    questions: graded.map((g) => ({
      questionId: g.q.questionId,
      objectiveId: g.q.objectiveId,
      objectiveCode: g.q.objectiveCode,
      objectiveTitle: g.q.objectiveTitle,
      isCorrect: g.isCorrect,
      selectedOptionId: g.submission.selectedOptionId,
      correctOptionId: g.correctOptionId,
      explanation: explanationBy.get(g.q.questionId) ?? { de: "", en: "" },
      confidence: g.submission.confidence,
    })),
    open: test.questions
      .filter((q) => openIds.has(q.objectiveId))
      .map((q) => ({ objectiveId: q.objectiveId, objectiveCode: q.objectiveCode, objectiveTitle: q.objectiveTitle, firstSectionId: firstSections.find((s) => s.objectiveId === q.objectiveId)?.id ?? null })),
  };
}
