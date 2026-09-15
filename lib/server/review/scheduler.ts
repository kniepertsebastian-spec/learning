/**
 * R2.2 (roadmap.md): vereinfachter, nachvollziehbarer SM-2/Leitner-Hybrid für
 * den Review-Scheduler. Reine Funktion (kein DB-Zugriff), damit sie ohne
 * laufende DB testbar ist - dieselbe Trennung wie bei
 * lib/server/admin/blueprint.ts (validateBlueprintDraft).
 */

export type QuestionDifficulty = "beginner" | "intermediate" | "advanced" | string | null;

export interface ReviewState {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
}

export interface ScheduledReview extends ReviewState {
  dueAt: Date;
}

const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 2.8;
export const DEFAULT_EASE_FACTOR = 2.5;

/** "Falsche Antwort kurzfristig erneut einplanen" (roadmap.md) - sofort
 * wieder fällig, statt wie bei einer richtigen Antwort erst morgen. */
const FAILED_INTERVAL_DAYS = 0;
const FIRST_CORRECT_INTERVAL_DAYS = 1;
const SECOND_CORRECT_INTERVAL_DAYS = 6;

/**
 * "Schwierigkeit ... berücksichtigen" (roadmap.md): eine als "advanced"
 * eingestufte Frage wird kurzfristiger wiederholt (früher fällig) als eine
 * "beginner"-Frage mit sonst gleichem Verlauf, weil sie erfahrungsgemäß
 * schneller wieder vergessen wird - umgekehrte Richtung zu
 * ObjectiveProgressService.calculateDifficultyWeight() (dort erhöht "advanced"
 * das Gewicht in der Mastery-Berechnung; hier verkürzt es das Intervall).
 */
function difficultyMultiplier(difficulty: QuestionDifficulty): number {
  if (difficulty === "advanced") return 0.85;
  if (difficulty === "beginner") return 1.15;
  return 1;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + Math.round(days));
  return result;
}

/**
 * Berechnet den nächsten Review-Zustand nach einer beantworteten Frage.
 * `previous` ist `null` für eine noch nie beantwortete Frage (frisch in
 * `review_items` angelegt).
 */
export function computeNextReview(
  previous: ReviewState | null,
  outcome: "correct" | "incorrect",
  difficulty: QuestionDifficulty,
  now: Date = new Date(),
): ScheduledReview {
  const easeFactor = previous?.easeFactor ?? DEFAULT_EASE_FACTOR;

  if (outcome === "incorrect") {
    return {
      repetitions: 0,
      easeFactor: Math.max(MIN_EASE_FACTOR, round2(easeFactor - 0.2)),
      intervalDays: FAILED_INTERVAL_DAYS,
      dueAt: addDays(now, FAILED_INTERVAL_DAYS),
    };
  }

  const repetitions = (previous?.repetitions ?? 0) + 1;
  const nextEaseFactor = Math.min(MAX_EASE_FACTOR, round2(easeFactor + 0.1));

  let intervalDays: number;
  if (repetitions === 1) {
    intervalDays = FIRST_CORRECT_INTERVAL_DAYS;
  } else if (repetitions === 2) {
    intervalDays = SECOND_CORRECT_INTERVAL_DAYS;
  } else {
    intervalDays = (previous?.intervalDays ?? SECOND_CORRECT_INTERVAL_DAYS) * nextEaseFactor;
  }
  intervalDays = Math.max(1, round1(intervalDays * difficultyMultiplier(difficulty)));

  return {
    repetitions,
    easeFactor: nextEaseFactor,
    intervalDays,
    dueAt: addDays(now, intervalDays),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
