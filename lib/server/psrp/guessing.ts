/**
 * Menschliche Faktoren, Stufe 1 (Aufgabe 13, Review 12.11.2026): Raten und Durchklicken (4.2) und Unsicherheit ohne
 * Selbstauskunft (4.6). Reine Berechnung ohne Datenbank, nur beschreibend. Jeder Wert nennt seinen Nenner `n`; unter `MIN_N` gilt
 * er als „klein“ (docs/MESSEN.md).
 *
 * 4.2: Eine Antwort gilt als „durchgeklickt“, wenn sie schneller kam als `RUSH_FRACTION` (ein Drittel) der Basiszeit der Frage.
 * Die Basiszeit ist der Median aller gemessenen Antwortzeiten dieser Frage; sie gilt erst ab `STABLE_BASE_MIN_N` Messungen als
 * stabil. Vorher wird nichts beurteilt.
 */
import type { EvaluationGroup } from "@/lib/server/db/schema";
import { MIN_N, type Share } from "./session-context";

/** Schneller als dieser Bruchteil der Basiszeit: durchgeklickt. Vorab festgelegt (docs/MESSEN.md), nicht aus den Daten gewählt. */
export const RUSH_FRACTION = 1 / 3;
/** Ab so vielen gemessenen Antworten gilt die Basiszeit einer Frage als stabil. */
export const STABLE_BASE_MIN_N = 20;
/** So viele durchgeklickte Antworten in einer Sitzung zählen als „gehäuft“. */
export const RUSH_CLUSTER = 3;
/** Gewicht einer durchgeklickten Antwort im Lernzielstand, nur mit Flag `guess_weighting` (standardmäßig aus). Nie in FSRS. */
export const RUSHED_ANSWER_WEIGHT = 0.5;

export interface BaseTime {
  medianMs: number;
  n: number;
}

/** Durchgeklickt? Null, wenn es keine Zeit oder keine stabile Basiszeit gibt. */
export function isRushed(responseTimeMs: number | null | undefined, base: BaseTime | null | undefined): boolean | null {
  if (responseTimeMs === null || responseTimeMs === undefined || !base || base.n < STABLE_BASE_MIN_N || base.medianMs <= 0) return null;
  return responseTimeMs < base.medianMs * RUSH_FRACTION;
}

export interface TimedReview {
  sessionId: string;
  correct: boolean;
  /** Ergebnis von `isRushed`; null = nicht beurteilbar. */
  rushed: boolean | null;
}

export interface ChangedAnswer {
  changed: boolean;
  correct: boolean;
}

export interface GuessingUser {
  group: EvaluationGroup;
  reviews: TimedReview[];
  answers: ChangedAnswer[];
}

export interface Arm {
  n: number;
  small: boolean;
  correct: number;
  accuracy: number | null;
}

export interface Guessing {
  /** 4.2 */
  rushing: {
    /** Reviews mit Zeit und stabiler Basiszeit (Nenner). */
    judged: number;
    rushed: Share;
    accuracy: { rushed: Arm; normal: Arm };
    /** Sitzungen mit mindestens `RUSH_CLUSTER` beurteilten Reviews, davon mit mindestens `RUSH_CLUSTER` durchgeklickten. */
    clusteredSessions: Share;
  };
  /** 4.6 */
  changedAnswer: {
    changed: Share;
    accuracy: { changed: Arm; unchanged: Arm };
  };
}

const share = (numerator: number, n: number): Share => ({ numerator, n, small: n < MIN_N, share: n > 0 ? numerator / n : null });
const arm = (list: Array<{ correct: boolean }>): Arm => {
  const correct = list.filter((x) => x.correct).length;
  return { n: list.length, small: list.length < MIN_N, correct, accuracy: list.length ? correct / list.length : null };
};

export function computeGuessing(reviews: TimedReview[], answers: ChangedAnswer[]): Guessing {
  const judged = reviews.filter((r) => r.rushed !== null);
  const rushed = judged.filter((r) => r.rushed);
  const perSession = new Map<string, { judged: number; rushed: number }>();
  for (const r of judged) {
    const s = perSession.get(r.sessionId) ?? { judged: 0, rushed: 0 };
    s.judged += 1;
    if (r.rushed) s.rushed += 1;
    perSession.set(r.sessionId, s);
  }
  const eligible = [...perSession.values()].filter((s) => s.judged >= RUSH_CLUSTER);
  const changed = answers.filter((a) => a.changed);
  return {
    rushing: {
      judged: judged.length,
      rushed: share(rushed.length, judged.length),
      accuracy: { rushed: arm(rushed), normal: arm(judged.filter((r) => !r.rushed)) },
      clusteredSessions: share(eligible.filter((s) => s.rushed >= RUSH_CLUSTER).length, eligible.length),
    },
    changedAnswer: {
      changed: share(changed.length, answers.length),
      accuracy: { changed: arm(changed), unchanged: arm(answers.filter((a) => !a.changed)) },
    },
  };
}

/** Die Werte gesamt und je Evaluationsgruppe. */
export function computeGuessingByGroup(people: GuessingUser[]) {
  const groups = [...new Set(people.map((p) => p.group))].sort();
  const of = (list: GuessingUser[]) => computeGuessing(list.flatMap((p) => p.reviews), list.flatMap((p) => p.answers));
  return {
    all: of(people),
    byGroup: Object.fromEntries(groups.map((g) => [g, of(people.filter((p) => p.group === g))])) as Partial<Record<EvaluationGroup, Guessing>>,
  };
}
