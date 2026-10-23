/**
 * Einstiegstest je Kapitel (roadmap_didaktik Phase 4.2): reine Auswertung. Ein Kapitel ist eine Domain; der Test stellt je
 * Lernziel eine Frage (höchstens `PLACEMENT_MAX_QUESTIONS`) mit Sicherheitsangabe.
 */
import type { AnswerConfidence } from "@/lib/types";

export const PLACEMENT_MAX_QUESTIONS = 12;
/** Bestanden: mindestens 90 % richtig UND bei mindestens 80 % der Fragen „sicher“ angegeben. */
export const PLACEMENT_MIN_CORRECT_SHARE = 0.9;
export const PLACEMENT_MIN_SURE_SHARE = 0.8;

export interface PlacementAnswer {
  objectiveId: string;
  isCorrect: boolean;
  confidence: AnswerConfidence;
}

export interface PlacementEvaluation {
  total: number;
  correct: number;
  sure: number;
  passed: boolean;
  /** Lernziele, die bei bestandenem Test übersprungen werden: richtig beantwortet und nicht nur geraten. */
  skipObjectiveIds: string[];
  /** Lernziele, die offen bleiben (falsch oder geraten). */
  openObjectiveIds: string[];
}

export function evaluatePlacement(answers: PlacementAnswer[]): PlacementEvaluation {
  const total = answers.length;
  const correct = answers.filter((a) => a.isCorrect).length;
  const sure = answers.filter((a) => a.confidence === "sure").length;
  const passed = total > 0 && correct / total >= PLACEMENT_MIN_CORRECT_SHARE && sure / total >= PLACEMENT_MIN_SURE_SHARE;
  const skippable = (a: PlacementAnswer) => a.isCorrect && a.confidence !== "guessed";
  return {
    total,
    correct,
    sure,
    passed,
    skipObjectiveIds: passed ? answers.filter(skippable).map((a) => a.objectiveId) : [],
    openObjectiveIds: answers.filter((a) => !passed || !skippable(a)).map((a) => a.objectiveId),
  };
}
