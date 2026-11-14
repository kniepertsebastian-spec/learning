import { eq, inArray } from "drizzle-orm";
import { afterCommit, getDb, inTransaction } from "@/lib/server/db/client";
import { certifications, examAnswers, examAttempts, examQuestions, exams, questionOptions } from "@/lib/server/db/schema";
import { ExamScoringService, type ExamScoringResult } from "@/lib/server/exam/scoring";
import { addSkillFromCourse } from "@/lib/server/profile/service";
import { recordReviewOutcomes } from "@/lib/server/review/service";
import { passMarkPercent, recordFinalExamPass } from "@/lib/server/stats/completions";

export interface ExamAnswerInput {
  questionId: string;
  /** Leer: nicht beantwortet (zählt als falsch). */
  selectedOptionId: string;
}

export interface ExamAttemptInput {
  answers: ExamAnswerInput[];
  /** R3 (roadmap.md): "Seite 'Meine Prüfungen' mit ... Dauer" - vom Client gemessen (Zeit von Sessionstart bis Einreichen),
   * optional, damit alte Client-Versionen weiterhin funktionieren. */
  durationSeconds?: number;
}

export interface ExamAttemptResult {
  attemptId: string;
  score: number;
  passed: boolean;
  scoring: ExamScoringResult;
  /** Bewusst ohne richtige Option: die Lösung bleibt auch nach der Abgabe auf dem Server (Aufgabe 05a). */
  results: Array<{ questionId: string; isCorrect: boolean }>;
}

export class ExamNotFoundError extends Error {}

/** Die Abgabe passt nicht zur Prüfung (fremde, fehlende oder doppelte Fragen, fremde Option, falsches Format): 400. */
export class InvalidExamSubmissionError extends Error {}

/** Prüft die Form des Bodys, ohne den Inhalt zu kennen. */
export function parseExamAttemptInput(body: unknown): ExamAttemptInput {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { answers?: unknown }).answers)) {
    throw new InvalidExamSubmissionError("Antworten fehlen.");
  }
  const raw = body as { answers: unknown[]; durationSeconds?: unknown };
  const answers = raw.answers.map((a) => {
    const entry = a as { questionId?: unknown; selectedOptionId?: unknown } | null;
    if (typeof entry?.questionId !== "string" || (entry.selectedOptionId !== undefined && entry.selectedOptionId !== null && typeof entry.selectedOptionId !== "string")) {
      throw new InvalidExamSubmissionError("Ungültige Antwort.");
    }
    return { questionId: entry.questionId, selectedOptionId: typeof entry.selectedOptionId === "string" ? entry.selectedOptionId : "" };
  });
  return { answers, durationSeconds: typeof raw.durationSeconds === "number" ? raw.durationSeconds : undefined };
}

/**
 * Wertet eine Prüfungsabgabe aus (Aufgabe 05a, Nachprüfung 14.11.2026). Die Abgabe muss genau die Fragen dieser Prüfung
 * enthalten, jede einmal; der Score zählt gegen alle Prüfungsfragen, unbeantwortete zählen als falsch. Vorher reichte eine
 * einzige richtige Antwort für 100 %, und die Antwort verriet die richtige Option jeder geschickten Frage.
 *
 * Versuch, Antworten und Wiederholungen werden gemeinsam gespeichert; Abschlussstatistik und Skill folgen nach dem Commit.
 */
export async function submitExamAttempt(userId: string, examId: string, input: ExamAttemptInput, locale = "en"): Promise<ExamAttemptResult> {
  const db = getDb();
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) throw new ExamNotFoundError("Exam not found");

  const examQuestionIds = (await db.select({ questionId: examQuestions.questionId }).from(examQuestions).where(eq(examQuestions.examId, examId))).map((q) => q.questionId);
  const expected = new Set(examQuestionIds);
  const submitted = new Set<string>();
  for (const answer of input.answers) {
    if (!expected.has(answer.questionId)) throw new InvalidExamSubmissionError("Die Abgabe enthält eine Frage, die nicht zu dieser Prüfung gehört.");
    if (submitted.has(answer.questionId)) throw new InvalidExamSubmissionError("Die Abgabe enthält eine Frage mehrfach.");
    submitted.add(answer.questionId);
  }
  if (submitted.size !== expected.size) throw new InvalidExamSubmissionError("Die Abgabe muss jede Frage der Prüfung enthalten.");

  const optionRows = examQuestionIds.length > 0 ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, examQuestionIds)) : [];
  const evaluation = input.answers.map((answer) => {
    const options = optionRows.filter((o) => o.questionId === answer.questionId);
    const selected = answer.selectedOptionId || null;
    if (selected !== null && !options.some((o) => o.id === selected)) throw new InvalidExamSubmissionError("Die Abgabe enthält eine Option, die nicht zur Frage gehört.");
    const correct = options.find((o) => o.isCorrect);
    return { questionId: answer.questionId, selectedOptionId: selected, isCorrect: !!correct && correct.id === selected };
  });

  const correctCount = evaluation.filter((e) => e.isCorrect).length;
  const total = examQuestionIds.length;
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const results = evaluation.map((e) => ({ questionId: e.questionId, isCorrect: e.isCorrect }));

  const scoring = await ExamScoringService.scoreExam(userId, examId, results, locale);
  // Bestanden: Punkte erreichen die Bestehensgrenze des Kurses (offizielle Prozentgrenze, sonst 70 %).
  const [cert] = await db.select({ passingScore: certifications.passingScore }).from(certifications).where(eq(certifications.id, exam.certificationId)).limit(1);
  const passed = total > 0 && score >= passMarkPercent(cert?.passingScore);

  const attemptId = await inTransaction(async () => {
    const tx = getDb();
    const [attempt] = await tx
      .insert(examAttempts)
      .values({
        examId,
        userId,
        score: String(score),
        passed,
        readiness: scoring.readinessLevel,
        completedAt: new Date(),
        durationSeconds: typeof input.durationSeconds === "number" && input.durationSeconds >= 0 ? Math.round(input.durationSeconds) : null,
      })
      .returning({ id: examAttempts.id });

    // R3: einzelne Antworten persistieren - sonst lässt sich eine Domain-/Objective-Auswertung für diesen Versuch später nicht
    // mehr rekonstruieren (siehe Kommentar auf exam_answers in db/schema.ts).
    if (evaluation.length > 0) {
      await tx.insert(examAnswers).values(evaluation.map((e) => ({ examAttemptId: attempt.id, questionId: e.questionId, selectedOptionId: e.selectedOptionId, isCorrect: e.isCorrect })));
    }

    // R2.2: Review-Zustand (Fälligkeit/Intervall) je Frage fortschreiben.
    await recordReviewOutcomes(userId, results);

    if (passed) {
      // Anonyme Abschluss-Statistik: erstes Bestehen der Person in diesem Kurs (lib/server/stats/completions.ts).
      await afterCommit(() => recordFinalExamPass(userId, exam.certificationId, attempt.id));
      // Skill aus dem Kurs ins Profil, wenn die Person das erlaubt hat (lib/server/profile/service.ts).
      await afterCommit(() => addSkillFromCourse(userId, exam.certificationId, "course"));
    }
    return attempt.id;
  });

  return { attemptId, score, passed, scoring, results };
}
