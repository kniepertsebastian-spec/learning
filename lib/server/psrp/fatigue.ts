/**
 * Menschliche Faktoren, Stufe 1 (Aufgabe 12, Review 12.11.2026): Ermüdung in der Sitzung (4.1) und Unterbrechungen (4.3).
 * Reine Berechnung ohne Datenbank, nur beschreibend: sie ändert nichts an der Planung. Jeder Wert nennt seinen Nenner `n`; unter
 * `MIN_N` gilt er als „klein“ (docs/MESSEN.md). Eine persönliche Sitzungslänge kommt erst mit einer Hypothese (Phase 6).
 *
 * 4.1: Jede abgeschlossene Sitzung mit mindestens drei beantworteten Fragen wird nach der Reihenfolge der Aufgaben in Drittel
 * geteilt (Antwort i von n liegt im Drittel ⌊3·i/n⌋). Je Drittel: Fehlerquote und Median der Antwortzeit.
 */
import type { Interruptions } from "@/lib/interruptions";
import type { EvaluationGroup } from "@/lib/server/db/schema";
import { MIN_N, median, type Share } from "./session-context";

export interface FatigueAnswer {
  correct: boolean;
  /** Antwortzeit in ms nach den Grenzen aus Aufgabe 06b; null ohne Messung. */
  responseTimeMs: number | null;
}

export interface FatigueSession {
  /** Beantwortete Fragen in der Reihenfolge der Sitzung. */
  answers: FatigueAnswer[];
  /** Null, wenn nichts gemessen wurde (älteres Gerät, Flag aus, vor der Messung). */
  interruptions: Interruptions | null;
}

export interface FatigueUser {
  group: EvaluationGroup;
  sessions: FatigueSession[];
}

export interface ThirdStats {
  /** Antworten in diesem Drittel (Nenner der Fehlerquote). */
  errors: Share;
  /** Median der Antwortzeit; `timed` ist sein Nenner. */
  medianResponseMs: number | null;
  timed: number;
}

export interface InterruptionArm {
  sessions: number;
  small: boolean;
  answered: number;
  correct: number;
  accuracy: number | null;
}

export interface Fatigue {
  /** 4.1: Sitzungen mit mindestens drei Antworten, ihre Antworten und deren Verteilung auf die Drittel. */
  sessions: number;
  answers: number;
  medianSessionLength: number | null;
  thirds: { first: ThirdStats; second: ThirdStats; third: ThirdStats };
  /** Fehlerquote im letzten minus im ersten Drittel (Prozentpunkte als Anteil); null, wenn eine Seite leer ist. */
  errorIncrease: number | null;
  /** Median der Antwortzeit im letzten geteilt durch den im ersten Drittel. */
  slowdown: number | null;
  /** 4.3: abgeschlossene Sitzungen mit Messung. */
  interruptions: {
    measured: number;
    small: boolean;
    /** Sitzungen mit mindestens einer Unterbrechung. */
    interrupted: Share;
    /** Nur unter den unterbrochenen Sitzungen: Median der Zahl und der Gesamtdauer in Sekunden. */
    medianCount: number | null;
    medianSeconds: number | null;
    /** Trefferquote der Sitzungen mit und ohne Unterbrechung. */
    accuracy: { interrupted: InterruptionArm; uninterrupted: InterruptionArm };
  };
}

const share = (numerator: number, n: number): Share => ({ numerator, n, small: n < MIN_N, share: n > 0 ? numerator / n : null });

/** Drittel (0, 1, 2) der Antwort an Position `index` in einer Sitzung mit `length` Antworten. */
export function thirdOf(index: number, length: number): 0 | 1 | 2 {
  return Math.min(2, Math.floor((3 * index) / length)) as 0 | 1 | 2;
}

function thirdStats(answers: FatigueAnswer[]): ThirdStats {
  const times = answers.flatMap((a) => (a.responseTimeMs === null ? [] : [a.responseTimeMs]));
  return { errors: share(answers.filter((a) => !a.correct).length, answers.length), medianResponseMs: median(times), timed: times.length };
}

function arm(list: FatigueSession[]): InterruptionArm {
  const answered = list.reduce((s, x) => s + x.answers.length, 0);
  const correct = list.reduce((s, x) => s + x.answers.filter((a) => a.correct).length, 0);
  return { sessions: list.length, small: list.length < MIN_N, answered, correct, accuracy: answered > 0 ? correct / answered : null };
}

export function computeFatigue(sessions: FatigueSession[]): Fatigue {
  const long = sessions.filter((s) => s.answers.length >= 3);
  const buckets: [FatigueAnswer[], FatigueAnswer[], FatigueAnswer[]] = [[], [], []];
  for (const s of long) s.answers.forEach((a, i) => buckets[thirdOf(i, s.answers.length)].push(a));
  const [first, second, third] = buckets.map(thirdStats);

  const measured = sessions.filter((s) => s.interruptions !== null);
  const interrupted = measured.filter((s) => s.interruptions!.count > 0);
  return {
    sessions: long.length,
    answers: long.reduce((s, x) => s + x.answers.length, 0),
    medianSessionLength: median(long.map((s) => s.answers.length)),
    thirds: { first, second, third },
    errorIncrease: first.errors.share !== null && third.errors.share !== null ? third.errors.share - first.errors.share : null,
    slowdown: first.medianResponseMs && third.medianResponseMs !== null ? third.medianResponseMs / first.medianResponseMs : null,
    interruptions: {
      measured: measured.length,
      small: measured.length < MIN_N,
      interrupted: share(interrupted.length, measured.length),
      medianCount: median(interrupted.map((s) => s.interruptions!.count)),
      medianSeconds: median(interrupted.map((s) => s.interruptions!.totalMs / 1000)),
      accuracy: { interrupted: arm(interrupted), uninterrupted: arm(measured.filter((s) => s.interruptions!.count === 0)) },
    },
  };
}

/** Die Werte gesamt und je Evaluationsgruppe. */
export function computeFatigueByGroup(people: FatigueUser[]) {
  const groups = [...new Set(people.map((p) => p.group))].sort();
  return {
    all: computeFatigue(people.flatMap((p) => p.sessions)),
    byGroup: Object.fromEntries(groups.map((g) => [g, computeFatigue(people.filter((p) => p.group === g).flatMap((p) => p.sessions))])) as Partial<Record<EvaluationGroup, Fatigue>>,
  };
}

/** Mindestens so viele Antworten im ersten und im letzten Drittel, bevor die Person eine Aussage dazu sieht. */
export const STATEMENT_MIN_ANSWERS = 30;
/** Ab diesem Anstieg der Fehlerquote (10 Prozentpunkte) heißt es „mehr Fehler“. */
export const STATEMENT_MIN_ERROR_INCREASE = 0.1;
/** Ab diesem Verhältnis der Antwortzeiten (ein Viertel länger) heißt es „länger“. */
export const STATEMENT_MIN_SLOWDOWN = 1.25;
/** Mindestens so viele gemessene Sitzungen, und mindestens die Hälfte davon unterbrochen, für die Aussage zu Unterbrechungen. */
export const STATEMENT_MIN_SESSIONS = 5;

export type FatigueStatement =
  | { kind: "more_errors_after"; afterQuestions: number }
  | { kind: "slower_towards_end" }
  | { kind: "often_interrupted"; interrupted: number; measured: number };

/**
 * Was die Person auf „Wie ich lerne“ sieht: nur Aussagen in ganzen Sätzen, keine Tabellen. Ohne genug Daten oder ohne deutlichen
 * Unterschied gibt es keine Aussage. „Nach etwa N Fragen“ ist der Beginn des letzten Drittels einer typischen (Median-)Sitzung.
 */
export function fatigueStatements(f: Fatigue): FatigueStatement[] {
  const out: FatigueStatement[] = [];
  const { first, third } = f.thirds;
  const afterQuestions = f.medianSessionLength !== null ? Math.round((f.medianSessionLength * 2) / 3) : 0;
  if (first.errors.n >= STATEMENT_MIN_ANSWERS && third.errors.n >= STATEMENT_MIN_ANSWERS && f.errorIncrease !== null && f.errorIncrease >= STATEMENT_MIN_ERROR_INCREASE && afterQuestions >= 2) {
    out.push({ kind: "more_errors_after", afterQuestions });
  }
  if (first.timed >= STATEMENT_MIN_ANSWERS && third.timed >= STATEMENT_MIN_ANSWERS && f.slowdown !== null && f.slowdown >= STATEMENT_MIN_SLOWDOWN) {
    out.push({ kind: "slower_towards_end" });
  }
  const i = f.interruptions;
  if (i.measured >= STATEMENT_MIN_SESSIONS && i.interrupted.share !== null && i.interrupted.share >= 0.5) {
    out.push({ kind: "often_interrupted", interrupted: i.interrupted.numerator, measured: i.measured });
  }
  return out;
}
