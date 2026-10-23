/** Notausstieg „Heute reicht's“ (roadmap_motivation Phase 3): Auswahl der Erfolgsaufgaben, rein ohne DB. Schwellen sind Platzhalter. */
export interface ExitConfig {
  /** 2-3 Aufgaben. */
  maxTasks: number;
  minRetrievability: number;
  dueWithinDays: number;
}

export const DEFAULT_EXIT_CONFIG: ExitConfig = { maxTasks: 3, minRetrievability: 0.9, dueWithinDays: 3 };

export interface WinCandidate {
  itemId: string;
  retrievability: number;
  due: Date;
}

const DAY_MS = 86_400_000;

/** Sehr wahrscheinlich gekonnt und ohnehin bald fällig: so entstehen keine unnötig frühen Wiederholungen. Die am ehesten fälligen zuerst. */
export function pickWinItems(candidates: WinCandidate[], now: Date, config: ExitConfig = DEFAULT_EXIT_CONFIG): string[] {
  const horizon = now.getTime() + config.dueWithinDays * DAY_MS;
  return candidates
    .filter((c) => c.retrievability >= config.minRetrievability && c.due.getTime() <= horizon)
    .sort((a, b) => a.due.getTime() - b.due.getTime() || b.retrievability - a.retrievability)
    .slice(0, config.maxTasks)
    .map((c) => c.itemId);
}
