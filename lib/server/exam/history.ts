import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { examAnswers, examAttempts, exams } from "@/lib/server/db/schema";
import { ExamScoringService, type ExamScoringResult } from "./scoring";

export class ExamAttemptNotFoundError extends Error {}

export interface ExamAttemptSummary {
  attemptId: string;
  completedAt: Date | null;
  score: number | null;
  durationSeconds: number | null;
  readiness: string | null;
}

/**
 * R3 (roadmap.md): "Seite 'Meine Prüfungen' mit Datum, Ergebnis, Dauer und
 * Readiness" - jeder abgeschlossene Versuch für diese Zertifizierung,
 * neueste zuerst. Bewusst nur `completedAt`-nicht-null-Versuche wären hier
 * noch strenger, aber ein abgebrochener Versuch (completedAt null) taucht
 * dann einfach mit "-" für Datum/Ergebnis auf statt zu verschwinden - siehe
 * "Fehlende Daten als fehlende Daten zeigen" (R3-Regeln).
 */
export async function listExamAttempts(
  userId: string,
  certificationId: string,
): Promise<ExamAttemptSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      attemptId: examAttempts.id,
      completedAt: examAttempts.completedAt,
      score: examAttempts.score,
      durationSeconds: examAttempts.durationSeconds,
      readiness: examAttempts.readiness,
    })
    .from(examAttempts)
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .where(and(eq(examAttempts.userId, userId), eq(exams.certificationId, certificationId)))
    .orderBy(desc(examAttempts.startedAt));

  return rows.map((r) => ({ ...r, score: r.score !== null ? Number(r.score) : null }));
}

export interface ExamAttemptDetail {
  attemptId: string;
  completedAt: Date | null;
  durationSeconds: number | null;
  scoring: ExamScoringResult;
  /** `null` = kein vorheriger Versuch vorhanden ("fehlende Daten als
   * fehlende Daten zeigen", R3-Regeln) - nicht mit 0 verwechseln. */
  previousScore: number | null;
  /** Objective-Codes, die sowohl in diesem als auch im unmittelbar
   * vorherigen Versuch als schwach markiert wurden - "wiederholt falsch
   * beantwortete Themen hervorheben" (roadmap.md). */
  repeatedWeakObjectiveCodes: string[];
}

/**
 * R3: "Detailseite pro Versuch mit Domain- und Objective-Auswertung" +
 * "Vergleich mit dem vorherigen Versuch" + "wiederholt falsch beantwortete
 * Themen hervorheben". Rekonstruiert die Domain-/Objective-Auswertung eines
 * VERGANGENEN Versuchs aus den seit R3 persistierten exam_answers und nutzt
 * dafür dieselbe ExamScoringService.scoreExam()-Logik wie unmittelbar nach
 * dem Einreichen - keine zweite Auswertungs-Implementierung nötig.
 */
export async function getExamAttemptDetail(
  userId: string,
  attemptId: string,
  locale: string,
): Promise<ExamAttemptDetail> {
  const db = getDb();
  const [attempt] = await db
    .select({
      id: examAttempts.id,
      examId: examAttempts.examId,
      userId: examAttempts.userId,
      completedAt: examAttempts.completedAt,
      durationSeconds: examAttempts.durationSeconds,
      certificationId: exams.certificationId,
    })
    .from(examAttempts)
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .where(eq(examAttempts.id, attemptId))
    .limit(1);

  if (!attempt || attempt.userId !== userId) {
    throw new ExamAttemptNotFoundError(`Versuch ${attemptId} nicht gefunden.`);
  }

  const answers = await db
    .select({ questionId: examAnswers.questionId, isCorrect: examAnswers.isCorrect })
    .from(examAnswers)
    .where(eq(examAnswers.examAttemptId, attemptId));

  const scoring = await ExamScoringService.scoreExam(userId, attempt.examId, answers, locale);

  const previousAttempt = attempt.completedAt
    ? await db
        .select({ id: examAttempts.id, score: examAttempts.score })
        .from(examAttempts)
        .innerJoin(exams, eq(exams.id, examAttempts.examId))
        .where(
          and(
            eq(examAttempts.userId, userId),
            eq(exams.certificationId, attempt.certificationId),
            lt(examAttempts.completedAt, attempt.completedAt),
          ),
        )
        .orderBy(desc(examAttempts.completedAt))
        .limit(1)
    : [];

  let repeatedWeakObjectiveCodes: string[] = [];
  if (previousAttempt.length > 0) {
    const prevAnswers = await db
      .select({ questionId: examAnswers.questionId, isCorrect: examAnswers.isCorrect })
      .from(examAnswers)
      .where(eq(examAnswers.examAttemptId, previousAttempt[0].id));
    if (prevAnswers.length > 0) {
      const prevScoring = await ExamScoringService.scoreExam(userId, attempt.examId, prevAnswers, locale);
      const prevWeakCodes = new Set(prevScoring.weakObjectives.map((w) => w.objectiveCode));
      repeatedWeakObjectiveCodes = scoring.weakObjectives
        .filter((w) => prevWeakCodes.has(w.objectiveCode))
        .map((w) => w.objectiveCode);
    }
  }

  return {
    attemptId: attempt.id,
    completedAt: attempt.completedAt,
    durationSeconds: attempt.durationSeconds,
    scoring,
    previousScore:
      previousAttempt.length > 0 && previousAttempt[0].score !== null
        ? Number(previousAttempt[0].score)
        : null,
    repeatedWeakObjectiveCodes,
  };
}
