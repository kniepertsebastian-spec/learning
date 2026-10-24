/** Schwächen in spätere Lektionen einweben (roadmap_didaktik Phase 10): Regeln ohne Datenbank. */

export const MAX_WOVEN = 2;
export const MAX_WOVEN_SHARE = 0.2;
/** Unter dieser Abrufwahrscheinlichkeit gilt ein Item als schwach, auch wenn es noch nicht fällig ist. */
export const WEAK_RETRIEVABILITY = 0.8;

/** Wie viele Fragen höchstens eingewoben werden: bis zu 2 und etwa 20 % des Tests (bei kleinen Tests mindestens eine). */
export function wovenCount(regularQuestions: number, available: number): number {
  if (regularQuestions <= 0 || available <= 0) return 0;
  return Math.min(MAX_WOVEN, Math.max(1, Math.ceil(regularQuestions * MAX_WOVEN_SHARE)), available);
}

export type WovenTier = 1 | 2;

export interface WovenCandidate {
  itemId: string;
  /** 1: gemeinsames Konzept oder Voraussetzung der aktuellen Lektion; 2: gleiches Themengebiet. */
  tier: WovenTier;
  due: Date;
  retrievability: number | null;
}

/** Fällig oder schwach. */
export function isWeakOrDue(input: { due: Date; retrievability: number | null }, now: Date): boolean {
  return input.due.getTime() <= now.getTime() || (input.retrievability !== null && input.retrievability < WEAK_RETRIEVABILITY);
}

/** Beste zuerst: engerer Bezug, dann die schwächste Abrufwahrscheinlichkeit, dann die früheste Fälligkeit. */
export function rankCandidates(candidates: WovenCandidate[]): WovenCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.retrievability ?? 1) - (b.retrievability ?? 1) ||
      a.due.getTime() - b.due.getTime() ||
      a.itemId.localeCompare(b.itemId),
  );
}

/**
 * Mischt eingewebte Fragen gleichmäßig in die regulären, nie an den Anfang: die erste Frage ist immer eine reguläre.
 * Die Reihenfolge der regulären Fragen bleibt erhalten.
 */
export function interleave<T>(regular: T[], woven: T[]): T[] {
  if (woven.length === 0 || regular.length === 0) return [...regular];
  const out = [...regular];
  woven.forEach((item, k) => {
    const position = Math.min(out.length, Math.max(1, Math.round(((k + 1) * regular.length) / (woven.length + 1))) + k);
    out.splice(position, 0, item);
  });
  return out;
}
