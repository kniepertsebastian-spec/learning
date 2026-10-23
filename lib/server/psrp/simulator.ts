/**
 * PSRP-HR Phase 5: Offline-Simulator. Spielt einen synthetischen Lernenden über N Tage durch und
 * misst den Workload (Reviews/Tag) für verschiedene r_ziel-Werte. Die Gedächtnisfunktion ist die
 * FSRS-Vergessenskurve der Bibliothek; die Zufallszahlen sind gesät, damit Läufe reproduzierbar sind.
 */
import { retrievability, scheduleReview, type ItemState } from "./fsrs";
import { dailyLimit, selectDailyQueue, type DueCandidate } from "./planner";

const DAY_MS = 86_400_000;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `planning` = Planungsschicht (Tageslimit, Rückstau-Abbau); `vanilla` = reines FSRS wie eine klassische Lernkarten-App. */
export type SimulationMode = "planning" | "vanilla";

export interface SimulationParams {
  mode?: SimulationMode;
  days: number;
  rTarget: number;
  newCardsPerDay: number;
  totalCards: number;
  timeBudgetMin: number;
  secondsPerReview: number;
  seed?: number;
  /** Tage ohne Lernen (z. B. eine Pause), als Menge von Tagesindizes. */
  pauseDays?: ReadonlySet<number>;
}

export interface SimulationResult {
  mode: SimulationMode;
  rTarget: number;
  reviewsPerDay: number[];
  /** Fällige Karten zu Beginn des Tages (auch die, die nicht bearbeitet werden). */
  dueByDay: number[];
  /** Fällige Karten, die an diesem Tag nicht bearbeitet wurden (Rückstand am Tagesende). */
  leftoverByDay: number[];
  /** Bearbeitete Karten × Sekunden je Karte, in Minuten. */
  minutesByDay: number[];
  /** Richtig beantwortete und alle Wiederholungen je Tag (nur Wiederholungen, keine neuen Karten). */
  okByDay: number[];
  answeredByDay: number[];
  totalReviews: number;
  meanReviewsPerDay: number;
  maxReviewsPerDay: number;
  /** Anteil richtig beantworteter Reviews. */
  retention: number;
  /** Fällige, aber nicht bearbeitete Karten am Ende. */
  finalBacklog: number;
  cardsLearned: number;
}

export function simulate(params: SimulationParams): SimulationResult {
  const rand = mulberry32(params.seed ?? 1);
  const start = new Date("2026-01-01T08:00:00Z");
  const states = new Map<number, ItemState>();
  const limit = dailyLimit({ timeBudgetMin: params.timeBudgetMin, avgSecondsPerReview: params.secondsPerReview });
  const mode: SimulationMode = params.mode ?? "planning";
  const reviewsPerDay: number[] = [];
  const dueByDay: number[] = [];
  const leftoverByDay: number[] = [];
  const okByDay: number[] = [];
  const answeredByDay: number[] = [];
  let ok = 0;
  let total = 0;
  let nextNew = 0;

  for (let day = 0; day < params.days; day++) {
    const now = new Date(start.getTime() + day * DAY_MS);
    const due: DueCandidate[] = [];
    for (const [id, st] of states) {
      if (st.due <= now) due.push({ itemId: String(id), retrievability: retrievability(st, now) ?? 1, difficulty: st.difficulty, due: st.due });
    }
    dueByDay.push(due.length);
    if (params.pauseDays?.has(day)) {
      reviewsPerDay.push(0);
      leftoverByDay.push(due.length);
      okByDay.push(0);
      answeredByDay.push(0);
      continue;
    }
    // Vanilla: alle fälligen Karten am selben Tag, neue Karten fix pro Tag, kein Tageslimit, kein Rückstau-Abbau.
    const { queue, newCardsPaused } = mode === "vanilla" ? { queue: due, newCardsPaused: false } : selectDailyQueue({ due, limit });
    let reviewed = 0;
    let dayOk = 0;
    for (const card of queue) {
      const id = Number(card.itemId);
      const success = rand() < card.retrievability;
      const rating = success ? (rand() < 0.15 ? 4 : 3) : 1;
      states.set(id, scheduleReview(states.get(id)!, rating, now, params.rTarget).state);
      ok += success ? 1 : 0;
      dayOk += success ? 1 : 0;
      total++;
      reviewed++;
    }
    const answered = reviewed;
    if (!newCardsPaused) {
      const room = mode === "vanilla" ? Infinity : Math.max(0, limit - reviewed);
      const count = Math.min(params.newCardsPerDay, room, params.totalCards - nextNew);
      for (let i = 0; i < count; i++) {
        states.set(nextNew++, scheduleReview(null, 3, now, params.rTarget).state);
        reviewed++;
      }
    }
    reviewsPerDay.push(reviewed);
    leftoverByDay.push(Math.max(0, due.length - answered));
    okByDay.push(dayOk);
    answeredByDay.push(answered);
  }

  const end = new Date(start.getTime() + params.days * DAY_MS);
  let backlog = 0;
  for (const st of states.values()) if (st.due <= end) backlog++;
  const sum = reviewsPerDay.reduce((a, b) => a + b, 0);
  return {
    mode,
    rTarget: params.rTarget,
    reviewsPerDay,
    dueByDay,
    leftoverByDay,
    minutesByDay: reviewsPerDay.map((n) => (n * params.secondsPerReview) / 60),
    okByDay,
    answeredByDay,
    totalReviews: sum,
    meanReviewsPerDay: sum / params.days,
    maxReviewsPerDay: Math.max(...reviewsPerDay),
    retention: total ? ok / total : 0,
    finalBacklog: backlog,
    cardsLearned: nextNew,
  };
}

/** Vergleich mehrerer Ziel-Retention-Werte bei sonst gleichen Parametern (365 Tage als Standard). */
export function compareTargets(rTargets: number[], base: Omit<SimulationParams, "rTarget" | "days"> & { days?: number }) {
  return rTargets.map((rTarget) => {
    const { reviewsPerDay: _a, dueByDay: _b, leftoverByDay: _c, minutesByDay: _d, okByDay: _e, answeredByDay: _f, ...summary } = simulate({ days: 365, ...base, rTarget });
    void [_a, _b, _c, _d, _e, _f];
    return summary;
  });
}
