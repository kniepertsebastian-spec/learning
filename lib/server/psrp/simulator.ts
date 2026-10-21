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

export interface SimulationParams {
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
  rTarget: number;
  reviewsPerDay: number[];
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
  const reviewsPerDay: number[] = [];
  let ok = 0;
  let total = 0;
  let nextNew = 0;

  for (let day = 0; day < params.days; day++) {
    const now = new Date(start.getTime() + day * DAY_MS);
    if (params.pauseDays?.has(day)) {
      reviewsPerDay.push(0);
      continue;
    }
    const due: DueCandidate[] = [];
    for (const [id, st] of states) {
      if (st.due <= now) due.push({ itemId: String(id), retrievability: retrievability(st, now) ?? 1, difficulty: st.difficulty, due: st.due });
    }
    const { queue, newCardsPaused } = selectDailyQueue({ due, limit });
    let reviewed = 0;
    for (const card of queue) {
      const id = Number(card.itemId);
      const success = rand() < card.retrievability;
      const rating = success ? (rand() < 0.15 ? 4 : 3) : 1;
      states.set(id, scheduleReview(states.get(id)!, rating, now, params.rTarget).state);
      ok += success ? 1 : 0;
      total++;
      reviewed++;
    }
    if (!newCardsPaused) {
      const room = Math.max(0, limit - reviewed);
      const count = Math.min(params.newCardsPerDay, room, params.totalCards - nextNew);
      for (let i = 0; i < count; i++) {
        states.set(nextNew++, scheduleReview(null, 3, now, params.rTarget).state);
        reviewed++;
      }
    }
    reviewsPerDay.push(reviewed);
  }

  const end = new Date(start.getTime() + params.days * DAY_MS);
  let backlog = 0;
  for (const st of states.values()) if (st.due <= end) backlog++;
  const sum = reviewsPerDay.reduce((a, b) => a + b, 0);
  return {
    rTarget: params.rTarget,
    reviewsPerDay,
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
    const { reviewsPerDay: _omit, ...summary } = simulate({ days: 365, ...base, rTarget });
    void _omit;
    return summary;
  });
}
