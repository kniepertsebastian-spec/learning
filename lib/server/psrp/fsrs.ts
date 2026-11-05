/**
 * PSRP-HR Phase 2: dünner Wrapper um ts-fsrs. Die Formeln stammen ausschließlich aus der Bibliothek
 * (keine Eigenimplementierung). FSRS bekommt immer das rohe Rating 1-4 (Architektur-Regel 1);
 * Burnout-Schutz wirkt nur über die Ziel-Retention `rTarget`, die die Planungsschicht übergibt.
 */
import { createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade } from "ts-fsrs";
import { FSRS6_MODEL_BOUNDS, FSRS6Algorithm, forgettingCurve } from "ts-fsrs/models/fsrs-6";
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

/**
 * Gewichtsvektoren, die FSRS-6 annimmt (17 und 19 werden von der Bibliothek auf 21 hochgesetzt). ts-fsrs 5 fiel bei jeder
 * anderen Länge still auf die Standardwerte zurück, ts-fsrs 6 wirft stattdessen: ein falscher Vektor in der Datenbank
 * (z. B. die 34 Werte von FSRS-7 aus Binding 0.6) würde jede Wiederholung dieses Nutzers abbrechen. Darum bleibt es beim
 * Rückfall auf die Standardwerte.
 */
const ACCEPTED_WEIGHT_LENGTHS = [17, 19, 21];

function makeParameters(rTarget: number, options: ScheduleOptions) {
  const weights = options.weights && ACCEPTED_WEIGHT_LENGTHS.includes(options.weights.length) ? options.weights : null;
  return generatorParameters({
    request_retention: rTarget,
    // Ohne Fuzz und ohne Kurzzeit-Schritte: deterministisch, Intervalle sind volle Tage ≥ 1.
    // Die Streuung übernimmt das Load Balancing der Planungsschicht.
    enable_fuzz: false,
    enable_short_term: false,
    ...(weights ? { w: weights } : {}),
  });
}

/**
 * Der Planer der Bibliothek (veraltete Schnittstelle `fsrs()`, ab ts-fsrs 6 nur noch FSRS-6): sein `next()` rechnet die
 * Wiederholung. Die Kurve und das Intervall holen wir aus dem FSRS-6-Modell der Bibliothek, weil die Methoden
 * `forgetting_curve` und `next_interval` am Planer seit ts-fsrs 6 fehlen.
 */
function makeScheduler(rTarget: number, options: ScheduleOptions) {
  return fsrs(makeParameters(rTarget, options));
}

function toCard(state: ItemState | null, now: Date): Card {
  if (!state || !state.lastReview) return createEmptyCard(now);
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
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
  // Dieselben Gewichte wie beim Planen (ungültige Vektoren fallen dort auf die Standardwerte zurück).
  const { w } = makeParameters(DEFAULT_PSRP_CONFIG.fsrs.rMax, options);
  return forgettingCurve(w, elapsedDays, state.stability);
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
  const params = makeParameters(rTarget, options);
  const interval = new FSRS6Algorithm([...params.w], false, FSRS6_MODEL_BOUNDS).next_interval(stability, rTarget);
  // Wie der bisherige Planer: ganze Tage, mindestens 1, höchstens das Maximalintervall der Bibliothek.
  return Math.min(Math.max(1, interval), params.maximum_interval);
}
