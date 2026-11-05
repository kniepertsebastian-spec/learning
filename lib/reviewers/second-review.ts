import { createHash } from "node:crypto";

/**
 * Zweitprüfung als Stichprobe (docs/roadmaps/roadmap_pruefer.md, Phase 6): reine Auswahlregeln. Die Auswahl hängt nur von der Freigabe und
 * den Fragen ab (kein Zufall zur Laufzeit), damit ein zweiter Aufruf dieselben Fragen trifft.
 */

export const DEFAULT_SECOND_REVIEW_SHARE = 0.1;
export const SECOND_REVIEW_MIN = 3;
export const SECOND_REVIEW_MAX = 25;

/** Anteil der Fragen aus SECOND_REVIEW_SHARE: 0 schaltet die Zweitprüfung ab, 1 prüft alle; leer, ungültig oder außerhalb 0 bis 1 → Standard. */
export function secondReviewShare(raw: string | undefined = process.env.SECOND_REVIEW_SHARE): number {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_SECOND_REVIEW_SHARE;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_SECOND_REVIEW_SHARE;
}

/** Wie viele Fragen in die Stichprobe kommen: nach Anteil aufgerundet, mindestens drei (bei weniger Fragen alle), höchstens 25. */
export function sampleSize(total: number, share: number): number {
  if (total <= 0 || share <= 0) return 0;
  return Math.min(total, Math.min(SECOND_REVIEW_MAX, Math.max(SECOND_REVIEW_MIN, Math.ceil(total * share))));
}

const digest = (text: string) => createHash("sha256").update(text).digest("hex");

/** Die Stichprobe: Fragen nach dem Hash aus Freigabe und Frage geordnet, die ersten `size`. Gleiche Eingabe, gleiche Auswahl. */
export function pickSample(approvalId: string, questionIds: readonly string[], size: number): string[] {
  if (size <= 0) return [];
  return [...questionIds].sort((a, b) => digest(`${approvalId}:${a}`).localeCompare(digest(`${approvalId}:${b}`))).slice(0, size);
}

/** Der zweite Prüfer: unter den Zugewiesenen (ohne den Freigebenden) der mit dem kleinsten Hash zur Freigabe; ohne Kandidaten null. */
export function pickSecondReviewer(approvalId: string, candidateUserIds: readonly string[], approverUserId: string | null): string | null {
  const candidates = [...new Set(candidateUserIds)].filter((id) => id !== approverUserId);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => digest(`${approvalId}:${a}`).localeCompare(digest(`${approvalId}:${b}`)))[0];
}
