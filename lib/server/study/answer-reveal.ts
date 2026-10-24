import { buildSolution, type AnswerData, type AnswerFormat, type AnswerPayload, type AnswerSolution } from "@/lib/questions/answer-formats";
import { gradeQuestionAnswer } from "@/lib/server/questions/grading";
import type { Localized } from "@/lib/types";

export interface RevealQuestion {
  explanation: Localized<string>;
  sourceReference: string | null;
  /** Fehlt bei Aufrufern, die nur Auswahlfragen kennen (dann `choice`). */
  answerFormat?: AnswerFormat;
  answerData?: AnswerData | null;
}

export interface RevealOption {
  id: string;
  orderNum: number;
  isCorrect: boolean;
  rationale: Localized<string> | null;
}

export interface AnswerReveal {
  isCorrect: boolean;
  correctOptionId: string;
  explanation: Localized<string>;
  sourceReference: string | null;
  /** Begründung je Option-ID (nur wo vorhanden, nie für die richtige Option). */
  rationales: Record<string, Localized<string>>;
  /** Neue Formate: die Lösung zur Anzeige und der Anteil richtiger Teile (das Rating bleibt binär). */
  solution?: AnswerSolution;
  partial?: number;
}

/**
 * Sofort-Feedback in der Übungssession (roadmap_didaktik Phase 2): reine Auswertung, die
 * nichts speichert. Gewertet und für FSRS verbucht wird weiterhin erst beim Einreichen
 * (completeStudySession), daher bleibt das Rating bei gleicher Antwort unverändert.
 */
export function buildAnswerReveal(
  question: RevealQuestion,
  options: RevealOption[],
  selectedOptionId: string,
  answer?: AnswerPayload | null,
): AnswerReveal {
  const format = question.answerFormat ?? "choice";
  if (format !== "choice") {
    const grade = gradeQuestionAnswer({ answerFormat: format, answerData: question.answerData ?? null }, options, { selectedOptionId, answer });
    return {
      isCorrect: grade.correct,
      correctOptionId: "",
      explanation: question.explanation,
      sourceReference: question.sourceReference,
      rationales: {},
      partial: grade.partial,
      ...(question.answerData ? { solution: buildSolution(format, question.answerData) } : {}),
    };
  }
  const correct = options.find((o) => o.isCorrect);
  const rationales: Record<string, Localized<string>> = {};
  for (const option of options) {
    if (!option.isCorrect && option.rationale) rationales[option.id] = option.rationale;
  }
  return {
    isCorrect: !!correct && correct.id === selectedOptionId,
    correctOptionId: correct?.id ?? "",
    explanation: question.explanation,
    sourceReference: question.sourceReference,
    rationales,
  };
}
