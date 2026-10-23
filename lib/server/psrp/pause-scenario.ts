/**
 * Vergleichsgrafik „Eine Woche Pause“ (roadmap_motivation Phase 1): dieselbe lernende Person, derselbe Zufall, einmal mit reinem FSRS
 * (wie eine klassische Lernkarten-App) und einmal mit der Planungsschicht. Rein synthetisch, keine Nutzerdaten.
 */
import { simulate, type SimulationMode, type SimulationResult } from "./simulator";

export interface PauseParams {
  totalCards: number;
  newCardsPerDay: number;
  timeBudgetMin: number;
  secondsPerReview: number;
  /** Tage Lernen vor der Pause. */
  leadInDays: number;
  pauseDays: number;
  /** Tage Lernen nach der Pause (Beobachtung). */
  followDays: number;
  rTarget: number;
  seed: number;
}

/** Platzhalter-Entscheidung laut roadmap_motivation: 1.000 Karten, 10 neue pro Tag, 15 min, 15 s je Karte, 60 Tage Vorlauf, 7 Tage Pause, 30 Tage danach, r_ziel 0,90. */
export const DEFAULT_PAUSE_PARAMS: PauseParams = {
  totalCards: 1000,
  newCardsPerDay: 10,
  timeBudgetMin: 15,
  secondsPerReview: 15,
  leadInDays: 60,
  pauseDays: 7,
  followDays: 30,
  rTarget: 0.9,
  seed: 1,
};

export interface PauseModeResult {
  mode: SimulationMode;
  minutesByDay: number[];
  cardsByDay: number[];
  dueByDay: number[];
  leftoverByDay: number[];
}

export interface PauseMetrics {
  /** Bearbeitete Karten und Minuten am ersten Tag nach der Pause. */
  peakCardsFirstDayAfterPause: number;
  peakMinutesFirstDayAfterPause: number;
  /** Höchste Tageslast nach der Pause. */
  maxMinutesAfterPause: number;
  /** Tage ab dem ersten Tag nach der Pause, bis kein fälliger Rückstand mehr übrig bleibt (null: nicht innerhalb des Beobachtungszeitraums). */
  daysToClearBacklog: number | null;
  /** Anteil richtig beantworteter Wiederholungen in den 30 Tagen nach der Pause. */
  retention30DaysAfterPause: number | null;
  /** Fällige Karten am ersten Tag nach der Pause (auch die nicht bearbeiteten). */
  dueFirstDayAfterPause: number;
}

export interface PauseScenario {
  assumptions: PauseParams & { dailyCardLimit: number; description: string };
  /** Index des ersten Tags nach der Pause. */
  pauseStartDay: number;
  firstDayAfterPause: number;
  modes: Record<SimulationMode, PauseModeResult>;
  metrics: Record<SimulationMode, PauseMetrics>;
}

function metricsFor(result: SimulationResult, params: PauseParams, firstAfter: number): PauseMetrics {
  const minutesAfter = result.minutesByDay.slice(firstAfter);
  const okAfter = result.okByDay.slice(firstAfter, firstAfter + 30).reduce((a, b) => a + b, 0);
  const answeredAfter = result.answeredByDay.slice(firstAfter, firstAfter + 30).reduce((a, b) => a + b, 0);
  const clearIndex = result.leftoverByDay.slice(firstAfter).findIndex((n) => n === 0);
  return {
    peakCardsFirstDayAfterPause: result.reviewsPerDay[firstAfter] ?? 0,
    peakMinutesFirstDayAfterPause: round(result.minutesByDay[firstAfter] ?? 0),
    maxMinutesAfterPause: round(Math.max(0, ...minutesAfter)),
    daysToClearBacklog: clearIndex === -1 ? null : clearIndex + 1,
    retention30DaysAfterPause: answeredAfter > 0 ? Math.round((okAfter / answeredAfter) * 1000) / 1000 : null,
    dueFirstDayAfterPause: result.dueByDay[firstAfter] ?? 0,
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Beide Modi mit identischem Seed und identischen Parametern. */
export function simulatePause(overrides: Partial<PauseParams> = {}): PauseScenario {
  const params: PauseParams = { ...DEFAULT_PAUSE_PARAMS, ...overrides };
  const pauseStartDay = params.leadInDays;
  const firstDayAfterPause = pauseStartDay + params.pauseDays;
  const days = firstDayAfterPause + params.followDays;
  const pauseDays = new Set(Array.from({ length: params.pauseDays }, (_, i) => pauseStartDay + i));
  const run = (mode: SimulationMode) =>
    simulate({ mode, days, rTarget: params.rTarget, newCardsPerDay: params.newCardsPerDay, totalCards: params.totalCards, timeBudgetMin: params.timeBudgetMin, secondsPerReview: params.secondsPerReview, seed: params.seed, pauseDays });
  const results = { vanilla: run("vanilla"), planning: run("planning") };
  const toMode = (r: SimulationResult): PauseModeResult => ({ mode: r.mode, minutesByDay: r.minutesByDay.map(round), cardsByDay: r.reviewsPerDay, dueByDay: r.dueByDay, leftoverByDay: r.leftoverByDay });
  const dailyCardLimit = Math.floor((params.timeBudgetMin * 60) / params.secondsPerReview);
  return {
    assumptions: {
      ...params,
      dailyCardLimit,
      description:
        "Synthetische Lernperson, gleicher Zufall in beiden Modi. Vanilla = reines FSRS: alle fälligen Karten am selben Tag, neue Karten fix pro Tag, kein Tageslimit. Planung = Tageslimit aus dem Zeitbudget, Rückstau wird über mehrere Tage abgebaut. Keine Nutzerdaten.",
    },
    pauseStartDay,
    firstDayAfterPause,
    modes: { vanilla: toMode(results.vanilla), planning: toMode(results.planning) },
    metrics: { vanilla: metricsFor(results.vanilla, params, firstDayAfterPause), planning: metricsFor(results.planning, params, firstDayAfterPause) },
  };
}
