import { and, eq, gt, inArray, ne } from "drizzle-orm";
import { getDb, inTransaction } from "@/lib/server/db/client";
import {
  domains,
  itemVariants,
  lessons,
  objectiveProgress,
  objectives,
  questionOptions,
  questions,
  quizAnswers,
  quizAttempts,
  quizzes,
  sections,
} from "@/lib/server/db/schema";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { ObjectiveProgressService } from "@/lib/server/progress/service";
import { recordReviewOutcomes } from "@/lib/server/review/service";
import { answerTime, type ReviewTiming } from "@/lib/server/sync/effective-time";
import { sanitizeAnswer, type AnswerPayload } from "@/lib/questions/answer-formats";
import { gradeQuestionAnswer } from "@/lib/server/questions/grading";
import { parseConfidence } from "@/lib/answer-confidence";
import type { AnswerConfidence } from "@/lib/types";

export class SectionNotFoundError extends Error {}

export interface SectionQuizAnswerInput {
  questionId: string;
  selectedOptionId: string;
  /** Antwort bei den neuen Formaten (Reihenfolge, Kurzantwort, Zuordnung); `selectedOptionId` ist dann leer. */
  answer?: AnswerPayload | null;
  /** R2 (roadmap.md): "Sicherheit der eigenen Antwort abfragen" - optional,
   * fehlt z. B. bei alten, noch nicht aktualisierten Offline-Paketen. */
  confidence?: AnswerConfidence;
  /** Eingewebte Frage aus einer früheren Lektion (Flag `woven_reviews`): zählt nicht für das Ergebnis dieser Lektion, nur als Review. */
  woven?: boolean;
  /** Modus „Antwort zuerst überlegen“ war aktiv (nur für die Auswertung). */
  thinkFirst?: boolean;
  /** Zeitpunkt der Antwort auf dem Gerät (ISO); nur im Sync-Pfad ausgewertet, siehe lib/server/sync/effective-time.ts. */
  answeredAt?: string;
}

export interface SectionQuizAttemptResult {
  /** Antworten auf Fragen, die es inzwischen nicht mehr gibt (nach dem Download gelöscht): übersprungen statt die Verbuchung scheitern zu lassen. */
  skipped?: number;
  /** Offline aufgezeichneter Versuch, der älter ist als ein bereits vorhandener: protokolliert, Wiederholungen verbucht, der Lernzielstand verschlechtert sich nie. */
  late?: boolean;
  score: number;
  results: Array<{ questionId: string; isCorrect: boolean; correctOptionId: string }>;
  attemptId: string;
}

/**
 * Gemeinsame Grading-Logik für Abschnittsquiz-Versuche - genutzt vom Live-
 * Endpunkt (app/api/sections/[id]/attempt/route.ts) UND vom R4.3-Sync-
 * Endpunkt (lib/server/sync/service.ts) für offline aufgezeichnete
 * Versuche, damit beide Pfade exakt dieselben Seiteneffekte auslösen
 * (Objective-Progress, Review-Zustand).
 */
export async function recordSectionQuizAttempt(
  userId: string,
  sectionId: string,
  allAnswers: SectionQuizAnswerInput[],
  options: { timing?: ReviewTiming } = {},
): Promise<SectionQuizAttemptResult> {
  // Aufgabe 03b (Review 12.11.2026): Versuch, Antworten, Lernzielstand und Wiederholungen gemeinsam oder gar nicht. Bricht etwas
  // ab, bleibt kein halber Versuch stehen, und ein erneutes Senden verbucht jede Antwort genau einmal.
  return inTransaction(() => recordSectionQuizAttemptInTransaction(userId, sectionId, allAnswers, options));
}

async function recordSectionQuizAttemptInTransaction(
  userId: string,
  sectionId: string,
  allAnswers: SectionQuizAnswerInput[],
  options: { timing?: ReviewTiming },
): Promise<SectionQuizAttemptResult> {
  const db = getDb();
  const wovenAnswers = isFeatureEnabled("woven_reviews", userId) ? allAnswers.filter((a) => a.woven) : [];

  const certInfo = await db
    .select({ certificationId: domains.certificationId, objectiveId: sections.objectiveId })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (!certInfo.length) {
    throw new SectionNotFoundError(`Section ${sectionId} nicht gefunden.`);
  }

  const existingQuiz = await db.select().from(quizzes).where(eq(quizzes.sectionId, sectionId)).limit(1);
  let quizId: string;
  if (existingQuiz.length) {
    quizId = existingQuiz[0].id;
  } else {
    const inserted = await db
      .insert(quizzes)
      .values({ sectionId, certificationId: certInfo[0].certificationId })
      .returning();
    quizId = inserted[0].id;
  }

  const result = await recordQuizAttemptCore(userId, quizId, allAnswers, options.timing);
  if (wovenAnswers.length > 0) await recordWovenAnswers(userId, sectionId, certInfo[0], wovenAnswers, options.timing);
  return result;
}

/**
 * Kapitel-Quiz („Sitzt das?“ am Kapitelende): gleiche Verbuchung wie beim Lektionstest (Lernzielstand, Wiederholungen), aber das
 * Quiz hängt am Kapitel. Der Pool umfasst alle Lernziele des Kapitels; gezogene Fragen kommen aus `chapter-quiz.ts`.
 */
export async function recordChapterQuizAttempt(
  userId: string,
  domainId: string,
  allAnswers: SectionQuizAnswerInput[],
  options: { timing?: ReviewTiming } = {},
): Promise<SectionQuizAttemptResult> {
  // Wie beim Lektionstest (Aufgabe 03b): alles in einer Transaktion.
  return inTransaction(() => recordChapterQuizAttemptInTransaction(userId, domainId, allAnswers, options));
}

async function recordChapterQuizAttemptInTransaction(
  userId: string,
  domainId: string,
  allAnswers: SectionQuizAnswerInput[],
  options: { timing?: ReviewTiming },
): Promise<SectionQuizAttemptResult> {
  const db = getDb();
  const [domain] = await db.select({ certificationId: domains.certificationId }).from(domains).where(eq(domains.id, domainId)).limit(1);
  if (!domain) throw new SectionNotFoundError(`Kapitel ${domainId} nicht gefunden.`);
  // Ein Quiz je Kapitel (eindeutiger Index auf domain_id); parallele erste Versuche treffen dasselbe.
  const [existing] = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.domainId, domainId)).limit(1);
  let quizId = existing?.id;
  if (!quizId) {
    await db.insert(quizzes).values({ domainId, certificationId: domain.certificationId }).onConflictDoNothing();
    quizId = (await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.domainId, domainId)).limit(1))[0].id;
  }
  // Eingewebte Antworten gibt es im Kapitel-Quiz nicht.
  return recordQuizAttemptCore(userId, quizId, allAnswers.filter((a) => !a.woven), options.timing);
}

/** Auswertung und Verbuchung eines Versuchs für ein vorhandenes Quiz (Lektion oder Kapitel). */
async function recordQuizAttemptCore(
  userId: string,
  quizId: string,
  allAnswers: SectionQuizAnswerInput[],
  timing?: ReviewTiming,
): Promise<SectionQuizAttemptResult> {
  const db = getDb();
  // Eingewebte Antworten zählen nicht für Ergebnis und Lernzielstand dieser Lektion (nur wenn das Flag gilt, sonst werden sie verworfen).
  // Unbekannte Selbsteinschätzungen (Sync-Warteschlange alter Geräte) entfallen, die Antwort zählt (Aufgabe 04b).
  const candidates = allAnswers.filter((a) => !a.woven).map((a) => ({ ...a, confidence: parseConfidence(a.confidence) ?? undefined }));
  const candidateIds = [...new Set(candidates.map((a) => a.questionId))];
  const existingIds = new Set(candidateIds.length > 0 ? (await db.select({ id: questions.id }).from(questions).where(inArray(questions.id, candidateIds))).map((q) => q.id) : []);
  const answers = candidates.filter((a) => existingIds.has(a.questionId));
  const skipped = candidates.length - answers.length;

  const completedAt = timing?.completedAt ?? new Date();
  const attemptInserted = await db
    .insert(quizAttempts)
    .values({ quizId, userId, startedAt: completedAt, completedAt })
    .returning();
  const attemptId = attemptInserted[0].id;

  const questionIds = answers.map((a) => a.questionId);
  const [optionRows, formatRows] = await Promise.all([
    questionIds.length > 0 ? db.select().from(questionOptions).where(inArray(questionOptions.questionId, questionIds)) : Promise.resolve([]),
    questionIds.length > 0 ? db.select({ id: questions.id, answerFormat: questions.answerFormat, answerData: questions.answerData }).from(questions).where(inArray(questions.id, questionIds)) : Promise.resolve([]),
  ]);
  const formatOf = new Map(formatRows.map((q) => [q.id, q]));

  const results: SectionQuizAttemptResult["results"] = [];
  let correctCount = 0;
  for (const answer of answers) {
    const format = formatOf.get(answer.questionId);
    const grade = gradeQuestionAnswer(
      { answerFormat: format?.answerFormat ?? "choice", answerData: format?.answerData ?? null },
      optionRows.filter((o) => o.questionId === answer.questionId),
      { selectedOptionId: answer.selectedOptionId, answer: answer.answer },
    );
    if (grade.correct) correctCount++;
    results.push({
      questionId: answer.questionId,
      isCorrect: grade.correct,
      correctOptionId: grade.correctOptionId,
    });
  }

  if (answers.length > 0) {
    await db.insert(quizAnswers).values(
      answers.map((a) => ({
        quizAttemptId: attemptId,
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId || null,
        answer: sanitizeAnswer(a.answer),
        isCorrect: results.find((r) => r.questionId === a.questionId)?.isCorrect ?? false,
        confidence: a.confidence ?? null,
      })),
    );
  }

  const score = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;
  await db.update(quizAttempts).set({ score: String(score) }).where(eq(quizAttempts.id, attemptId));

  // Ein verspätet synchronisierter Versuch (inzwischen gibt es einen neueren) darf den Lernzielstand nur verbessern, nie verschlechtern.
  const late = timing
    ? (await db.select({ id: quizAttempts.id }).from(quizAttempts).where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, userId), gt(quizAttempts.completedAt, completedAt))).limit(1)).length > 0
    : false;
  const touched = late ? await touchedObjectiveProgress(userId, questionIds) : [];
  await ObjectiveProgressService.updateProgressForQuizAttempt(userId, attemptId);
  for (const before of touched) await restoreIfWorse(before);
  await recordReviewOutcomes(
    userId,
    results.map((r) => ({
      questionId: r.questionId,
      isCorrect: r.isCorrect,
      confidence: answers.find((a) => a.questionId === r.questionId)?.confidence ?? null,
      thinkFirst: answers.find((a) => a.questionId === r.questionId)?.thinkFirst === true,
      ...(timing ? answerTime(timing, answers.find((a) => a.questionId === r.questionId)?.answeredAt) : {}),
    })),
  );

  return { score, results, attemptId, ...(late ? { late: true } : {}), ...(skipped > 0 ? { skipped } : {}) };
}

/**
 * Eine eingewebte Frage nach einer gelösten Simulation (Flag `woven_reviews`): wird wie im Lektionstest als Review des Original-Items
 * gebucht, ohne Auswirkung auf Lernziel oder Ergebnis. Gibt false zurück, wenn die Lektion fehlt oder das Flag aus ist.
 */
export async function recordSimulationWovenAnswer(userId: string, sectionId: string, answer: { questionId: string; selectedOptionId: string; confidence?: AnswerConfidence }): Promise<boolean> {
  if (!isFeatureEnabled("woven_reviews", userId)) return false;
  const [section] = await getDb()
    .select({ certificationId: domains.certificationId, objectiveId: sections.objectiveId })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (!section) return false;
  await inTransaction(() => recordWovenAnswers(userId, sectionId, section, [{ ...answer, woven: true }]));
  return true;
}

/**
 * Eingewebte Antworten als Reviews des Original-Items (`interleaved`, mit der Lektion, in der sie gestellt wurden). Nur Fragen
 * desselben Kurses aus einem anderen Lernziel; alles andere wird ignoriert.
 */
async function recordWovenAnswers(userId: string, sectionId: string, section: { certificationId: string; objectiveId: string }, answers: SectionQuizAnswerInput[], timing?: ReviewTiming): Promise<void> {
  const db = getDb();
  const shownIds = [...new Set(answers.map((a) => a.questionId))];
  const valid = await db
    .select({ id: questions.id })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(inArray(questions.id, shownIds), eq(domains.certificationId, section.certificationId), ne(questions.objectiveId, section.objectiveId)));
  const validIds = new Set(valid.map((v) => v.id));
  const [variantRows, optionRows, [lesson]] = await Promise.all([
    db.select({ itemId: itemVariants.itemId, questionId: itemVariants.questionId }).from(itemVariants).where(and(inArray(itemVariants.questionId, shownIds), ne(itemVariants.itemId, itemVariants.questionId))),
    db.select().from(questionOptions).where(inArray(questionOptions.questionId, shownIds)),
    db.select({ id: lessons.id }).from(lessons).where(eq(lessons.sectionId, sectionId)).limit(1),
  ]);
  const itemOf = new Map(variantRows.map((v) => [v.questionId, v.itemId]));
  await recordReviewOutcomes(
    userId,
    answers
      .filter((a) => validIds.has(a.questionId))
      .map((a) => {
        const correct = optionRows.find((o) => o.questionId === a.questionId && o.isCorrect);
        const itemId = itemOf.get(a.questionId) ?? a.questionId;
        return {
          questionId: itemId,
          variantQuestionId: itemId !== a.questionId ? a.questionId : null,
          isCorrect: !!correct && correct.id === a.selectedOptionId,
          confidence: a.confidence ?? null,
          reviewType: "interleaved" as const,
          wovenIntoLessonId: lesson?.id ?? null,
          ...(timing ? answerTime(timing, a.answeredAt) : {}),
        };
      }),
  );
}

/** Stand des Lernziels vor einem verspäteten Versuch, für alle berührten Lernziele mit vorhandenem Stand. */
async function touchedObjectiveProgress(userId: string, questionIds: string[]): Promise<Array<typeof objectiveProgress.$inferSelect>> {
  if (questionIds.length === 0) return [];
  const db = getDb();
  const objectiveIds = [...new Set((await db.select({ objectiveId: questions.objectiveId }).from(questions).where(inArray(questions.id, questionIds))).map((r) => r.objectiveId))];
  if (objectiveIds.length === 0) return [];
  return db.select().from(objectiveProgress).where(and(eq(objectiveProgress.userId, userId), inArray(objectiveProgress.objectiveId, objectiveIds)));
}

async function restoreIfWorse(before: typeof objectiveProgress.$inferSelect): Promise<void> {
  const db = getDb();
  const [after] = await db.select().from(objectiveProgress).where(eq(objectiveProgress.id, before.id)).limit(1);
  if (!after || Number(after.masteryScore) >= Number(before.masteryScore)) return;
  await db.update(objectiveProgress).set({ masteryScore: before.masteryScore, status: before.status, lastAttemptAt: before.lastAttemptAt }).where(eq(objectiveProgress.id, before.id));
}
