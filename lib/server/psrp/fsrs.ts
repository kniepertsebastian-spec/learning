/**
 * PSRP-HR Phase 2: dünner Wrapper um ts-fsrs. Die Formeln stammen ausschließlich aus der Bibliothek
 * (keine Eigenimplementierung). FSRS bekommt immer das rohe Rating 1-4 (Architektur-Regel 1);
 * Burnout-Schutz wirkt nur über die Ziel-Retention `rTarget`, die die Planungsschicht übergibt.
 */
import { createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade } from "ts-fsrs";
import { DEFAULT_PSRP_CONFIG } from "./config";

export type RawRating = 1 | 2 | 3 | 4;

export interface ItemState {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  /** ts-fsrs State (0 New, 1 Learning, 2 Review, 3 Relearning). */
  fsrsState: number;
  lastReview: Date | null;
  due: Date;
}

export interface ScheduleOptions {
  /** Persönliche Parameter (Optimizer) oder altersabhängige Kaltstartwerte; sonst Standard. */
  weights?: number[] | null;
}

const DAY_MS = 86_400_000;

function makeScheduler(rTarget: number, options: ScheduleOptions) {
  return fsrs(
    generatorParameters({
      request_retention: rTarget,
      // Ohne Fuzz und ohne Kurzzeit-Schritte: deterministisch, Intervalle sind volle Tage ≥ 1.
      // Die Streuung übernimmt das Load Balancing der Planungsschicht.
      enable_fuzz: false,
      enable_short_term: false,
      ...(options.weights ? { w: options.weights } : {}),
    }),
  );
}

function toCard(state: ItemState | null, now: Date): Card {
  if (!state || !state.lastReview) return createEmptyCard(now);
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: Math.max(0, Math.round((now.getTime() - state.lastReview.getTime()) / DAY_MS)),
    scheduled_days: Math.max(0, Math.round((state.due.getTime() - state.lastReview.getTime()) / DAY_MS)),
    learning_steps: 0,
    reps: state.reps,
    lapses: state.lapses,
    state: state.fsrsState as State,
    last_review: state.lastReview,
  };
}

/** Abrufwahrscheinlichkeit zum Zeitpunkt `now` (1 für nie gesehene Items → null). */
export function retrievability(state: ItemState | null, now: Date, options: ScheduleOptions = {}): number | null {
  if (!state || !state.lastReview || state.stability <= 0) return null;
  const elapsedDays = Math.max(0, (now.getTime() - state.lastReview.getTime()) / DAY_MS);
  return makeScheduler(DEFAULT_PSRP_CONFIG.fsrs.rMax, options).forgetting_curve(elapsedDays, state.stability);
}

export interface ScheduleResult {
  state: ItemState;
  /** Abrufwahrscheinlichkeit unmittelbar vor dem Review (null beim ersten Review). */
  predictedR: number | null;
  intervalDays: number;
}

/**
 * `scheduleReview(itemState, rawRating, now, rTarget) -> newItemState`
 * `itemState` ist null für ein Item, das noch nie bewertet wurde.
 */
export function scheduleReview(
  itemState: ItemState | null,
  rawRating: RawRating,
  now: Date,
  rTarget: number,
  options: ScheduleOptions = {},
): ScheduleResult {
  const scheduler = makeScheduler(rTarget, options);
  const predictedR = retrievability(itemState, now, options);
  const { card } = scheduler.next(toCard(itemState, now), now, rawRating as Grade);
  const intervalDays = Math.max(1, card.scheduled_days);
  return {
    predictedR,
    intervalDays,
    state: {
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      fsrsState: card.state,
      lastReview: now,
      due: new Date(now.getTime() + intervalDays * DAY_MS),
    },
  };
}

/** Intervall in Tagen für Stabilität und Ziel-Retention (Bibliotheksfunktion, mindestens 1 Tag). */
export function intervalForStability(stability: number, rTarget: number, options: ScheduleOptions = {}): number {
  const scheduler = makeScheduler(rTarget, options);
  return Math.max(1, scheduler.next_interval(stability, 0));
}
