import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  domains,
  lessonCompletions,
  objectives,
  preAssessments,
  questionOptions,
  questions,
  quizAttempts,
  quizzes,
  sections,
  studySessions,
  type PreAssessmentDomainResult,
} from "@/lib/server/db/schema";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { needsPreAssessment, pickPreAssessmentQuestions, PRE_ASSESSMENT_SIZE, summarizeByDomain } from "@/lib/pre-assessment/logic";
import type { Localized } from "@/lib/types";

export class PreAssessmentNotFoundError extends Error {}
export class PreAssessmentInvalidError extends Error {}

export interface PreAssessmentQuestion {
  questionId: string;
  domainId: string;
  domainName: string;
  question: Localized<string>;
  /** Ohne `isCorrect`: bewertet wird serverseitig. */
  options: Array<{ id: string; text: Localized<string>; orderNum: number }>;
}

export interface PreAssessmentTest {
  certificationId: string;
  courseName: string;
  questions: PreAssessmentQuestion[];
}

export interface PreAssessmentResult {
  correct: number;
  total: number;
  domains: PreAssessmentDomainResult[];
  questions: Array<{ questionId: string; isCorrect: boolean; correctOptionId: string; selectedOptionId: string; explanation: Localized<string> }>;
}

/** Auswahlfragen mit genau einer richtigen Antwort, die Lernende sehen dürfen (aktuell, keine reinen Probe-Fragen). */
async function candidateRows(certificationId: string) {
  return getDb()
    .select({ id: questions.id, domainId: objectives.domainId })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(domains.certificationId, certificationId), eq(questions.stale, false), eq(questions.probeOnly, false), eq(questions.answerFormat, "choice")));
}

export async function getPreAssessmentRecord(userId: string, certificationId: string): Promise<typeof preAssessments.$inferSelect | null> {
  const [row] = await getDb()
    .select()
    .from(preAssessments)
    .where(and(eq(preAssessments.userId, userId), eq(preAssessments.certificationId, certificationId)))
    .limit(1);
  return row ?? null;
}

/** Hat die Person in diesem Kurs schon etwas gelernt? (Lektion abgeschlossen, Quiz abgelegt oder Session gebaut.) */
async function hasProgress(userId: string, certificationId: string): Promise<boolean> {
  const db = getDb();
  const [lesson] = await db
    .select({ id: lessonCompletions.id })
    .from(lessonCompletions)
    .innerJoin(sections, eq(sections.id, lessonCompletions.sectionId))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(lessonCompletions.userId, userId), eq(domains.certificationId, certificationId)))
    .limit(1);
  if (lesson) return true;
  const [attempt] = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.userId, userId), eq(quizzes.certificationId, certificationId), isNotNull(quizAttempts.completedAt)))
    .limit(1);
  if (attempt) return true;
  const [session] = await db
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.certificationId, certificationId)))
    .limit(1);
  return Boolean(session);
}

/**
 * Soll der Einstufungstest jetzt angeboten werden? Einmalig nach der Kurswahl, solange nichts gelernt wurde, nur bei Kursen
 * mit Tests und nur, wenn es Auswahlfragen gibt (Flag `pretest_questions`, standardmäßig an).
 */
export async function shouldOfferPreAssessment(userId: string, certificationId: string): Promise<boolean> {
  if (!isFeatureEnabled("pretest_questions", userId)) return false;
  const [cert] = await getDb().select({ quizEnabled: certifications.includeSectionQuizzes }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  if (!cert) return false;
  const [record, progress, candidates] = await Promise.all([getPreAssessmentRecord(userId, certificationId), hasProgress(userId, certificationId), candidateRows(certificationId)]);
  return needsPreAssessment({ hasRecord: Boolean(record), hasProgress: progress, testsEnabled: cert.quizEnabled, availableQuestions: candidates.length });
}

/** Stellt den Test zusammen: 10 Auswahlfragen quer durch die Kapitel (ohne Lösungen). */
export async function loadPreAssessment(certificationId: string): Promise<PreAssessmentTest> {
  const db = getDb();
  const [cert] = await db.select({ id: certifications.id, name: certifications.name }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  if (!cert) throw new PreAssessmentNotFoundError();
  const domainRows = await db.select().from(domains).where(eq(domains.certificationId, certificationId)).orderBy(asc(domains.orderNum));
  const picked = pickPreAssessmentQuestions(
    await candidateRows(certificationId),
    domainRows.map((d) => ({ id: d.id, orderNum: d.orderNum, weight: d.weightPercent === null ? null : Number(d.weightPercent) })),
  );
  const ids = picked.map((q) => q.id);
  const [questionRows, optionRows] = ids.length
    ? await Promise.all([db.select().from(questions).where(inArray(questions.id, ids)), db.select().from(questionOptions).where(inArray(questionOptions.questionId, ids)).orderBy(asc(questionOptions.orderNum))])
    : [[], []];
  const domainName = new Map(domainRows.map((d) => [d.id, d.name]));
  return {
    certificationId,
    courseName: cert.name,
    questions: picked.flatMap((p) => {
      const q = questionRows.find((r) => r.id === p.id);
      return q
        ? [{ questionId: q.id, domainId: p.domainId, domainName: domainName.get(p.domainId) ?? "", question: q.question, options: optionRows.filter((o) => o.questionId === q.id).map((o) => ({ id: o.id, text: o.text, orderNum: o.orderNum })) }]
        : [];
    }),
  };
}

export interface PreAssessmentSubmission {
  questionId: string;
  selectedOptionId: string;
}

/** Wertet den Einstufungstest aus und speichert das Ergebnis (einmalig; ein zweiter Versuch ändert nichts). */
export async function submitPreAssessment(userId: string, certificationId: string, submissions: PreAssessmentSubmission[]): Promise<PreAssessmentResult> {
  const db = getDb();
  if (await getPreAssessmentRecord(userId, certificationId)) throw new PreAssessmentInvalidError("Der Einstufungstest wurde schon abgelegt.");
  const ids = [...new Set(submissions.map((s) => s.questionId))];
  if (ids.length === 0 || ids.length > PRE_ASSESSMENT_SIZE || ids.length !== submissions.length) throw new PreAssessmentInvalidError("Ungültige Antworten.");
  const valid = new Map((await candidateRows(certificationId)).map((c) => [c.id, c.domainId]));
  if (!ids.every((id) => valid.has(id))) throw new PreAssessmentInvalidError("Unbekannte Frage.");

  const [optionRows, questionRows, domainRows] = await Promise.all([
    db.select().from(questionOptions).where(inArray(questionOptions.questionId, ids)),
    db.select({ id: questions.id, explanation: questions.explanation }).from(questions).where(inArray(questions.id, ids)),
    db.select({ id: domains.id, name: domains.name }).from(domains).where(eq(domains.certificationId, certificationId)).orderBy(asc(domains.orderNum)),
  ]);
  const graded = submissions.map((s) => {
    const correct = optionRows.find((o) => o.questionId === s.questionId && o.isCorrect);
    const chosen = optionRows.find((o) => o.id === s.selectedOptionId && o.questionId === s.questionId);
    return {
      questionId: s.questionId,
      domainId: valid.get(s.questionId)!,
      selectedOptionId: chosen?.id ?? "",
      correctOptionId: correct?.id ?? "",
      isCorrect: Boolean(correct) && correct!.id === chosen?.id,
      explanation: questionRows.find((q) => q.id === s.questionId)?.explanation ?? { de: "", en: "" },
    };
  });
  const byDomain = summarizeByDomain(graded, domainRows);
  const correct = graded.filter((g) => g.isCorrect).length;
  await db
    .insert(preAssessments)
    .values({ userId, certificationId, status: "completed", correctCount: correct, totalCount: graded.length, domainResults: byDomain })
    .onConflictDoNothing();
  return {
    correct,
    total: graded.length,
    domains: byDomain,
    questions: graded.map((g) => ({ questionId: g.questionId, isCorrect: g.isCorrect, correctOptionId: g.correctOptionId, selectedOptionId: g.selectedOptionId, explanation: g.explanation })),
  };
}

/** Einstufungstest überspringen: wird nicht noch einmal angeboten. */
export async function skipPreAssessment(userId: string, certificationId: string): Promise<void> {
  await getDb().insert(preAssessments).values({ userId, certificationId, status: "skipped" }).onConflictDoNothing();
}
