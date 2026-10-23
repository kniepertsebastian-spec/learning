/**
 * Rückblick „Was weißt du noch?“ (roadmap_didaktik Phase 8): reine Regeln. Eine kürzlich gelernte Lektion wird am Anfang der
 * nächsten Session mit höchstens drei Varianten-Fragen abgefragt - frühestens nach 1 Tag, höchstens 14 Tage danach.
 */
export const RECALL_MIN_AGE_HOURS = 24;
export const RECALL_MAX_AGE_DAYS = 14;
export const RECALL_MAX_QUESTIONS = 3;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface RecallCandidate {
  sectionId: string;
  completedAt: Date;
}

/**
 * Wählt die Lektion für den Rückblick: abgeschlossen vor mindestens 24 Stunden und höchstens 14 Tagen, noch nicht abgefragt.
 * Die am längsten zurückliegende kommt zuerst, damit jede Lektion vor Ablauf des Fensters an die Reihe kommt.
 */
export function pickRecallCandidate(candidates: RecallCandidate[], now: Date, alreadyRecalled: ReadonlySet<string>): RecallCandidate | null {
  const eligible = candidates
    .filter((c) => !alreadyRecalled.has(c.sectionId))
    .filter((c) => {
      const age = now.getTime() - c.completedAt.getTime();
      return age >= RECALL_MIN_AGE_HOURS * HOUR_MS && age <= RECALL_MAX_AGE_DAYS * DAY_MS;
    })
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.sectionId.localeCompare(b.sectionId));
  return eligible[0] ?? null;
}

/** Abstand in Stunden, auf zwei Nachkommastellen. */
export function hoursBetween(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / HOUR_MS) * 100) / 100;
}
