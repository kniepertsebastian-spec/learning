import { gradeAnswer, type AnswerData, type AnswerFormat, type AnswerPayload } from "@/lib/questions/answer-formats";

export interface GradingQuestion {
  answerFormat: AnswerFormat;
  answerData: AnswerData | null;
}
export interface GradingInput {
  selectedOptionId?: string | null;
  answer?: AnswerPayload | null;
}
export interface GradeResult {
  correct: boolean;
  /** Bei Auswahlfragen die richtige Option, sonst leer. */
  correctOptionId: string;
  /** Anteil richtiger Teile (nur Anzeige). */
  partial: number;
}

/** Eine Stelle für die Wertung aller Antwortformate: Auswahl über die Option, die anderen Formate über ihre Lösungsdaten. */
export function gradeQuestionAnswer(question: GradingQuestion, options: Array<{ id: string; isCorrect: boolean }>, input: GradingInput): GradeResult {
  if (question.answerFormat === "choice") {
    const correct = options.find((o) => o.isCorrect);
    const ok = !!correct && correct.id === input.selectedOptionId;
    return { correct: ok, correctOptionId: correct?.id ?? "", partial: ok ? 1 : 0 };
  }
  if (!question.answerData) return { correct: false, correctOptionId: "", partial: 0 };
  const grade = gradeAnswer(question.answerFormat, question.answerData, input.answer);
  return { correct: grade.correct, correctOptionId: "", partial: grade.partial };
}
