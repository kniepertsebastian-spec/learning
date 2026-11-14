/**
 * Menschliche Faktoren, Stufe 1 (Aufgabe 15, Review 12.11.2026): Fehlerart (4.8) und Hilfe-Verhalten (4.7).
 * Reine Berechnung ohne Datenbank. Die Fehlerart steuert eine Mechanik: der Verstehens-Modus schaltet nur bei „Fehlvorstellung“
 * ein (Flag `error_type_gate`). Heuristik und Hypothesen stehen in docs/MESSEN.md.
 *
 * Fehlerart je Person und Frage. „Frage“ ist das Item (die Originalfrage); Antworten auf ihre Varianten zählen mit, denn sie
 * prüfen denselben Inhalt. Eingeordnet wird nur eine Frage mit Fehlern und mit mindestens `MIN_ATTEMPTS` Versuchen:
 * - Fehlvorstellung: dieselbe falsche Option derselben gezeigten Frage mindestens `REPEATED_OPTION_MIN`-mal und mindestens die
 *   Hälfte der Fehler, oder mindestens `SURE_WRONG_MIN` Fehler mit „sicher“ (fest geglaubt statt geraten).
 * - Flüchtigkeit: sonst sicherer Stoff (Trefferquote mindestens `SOLID_ACCURACY`) und jeder Fehler kam schneller als die übliche
 *   Antwortzeit der Frage (Median, erst ab stabiler Basiszeit).
 * - Lücke: alles andere, also wechselnde falsche Optionen ohne Sicherheit, oder Fehler mit normaler oder langer Antwortzeit.
 * - unbekannt: weniger als drei Versuche, oder sicherer Stoff ohne messbare Antwortzeit der Fehler (Flüchtigkeit oder Lücke offen).
 */
import type { EvaluationGroup } from "@/lib/server/db/schema";
import { MIN_N, median, type Share } from "./session-context";

export const ERROR_TYPES = ["misconception", "gap", "slip", "unknown"] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

/** Unter so vielen Versuchen bleibt die Fehlerart „unbekannt“ (Aufgabe 15). */
export const MIN_ATTEMPTS = 3;
/** Dieselbe falsche Option so oft: Fehlvorstellung. Wie `repeatedWrongOptionMin` im Verstehens-Modus. */
export const REPEATED_OPTION_MIN = 2;
/** So viele Fehler mit „sicher“: Fehlvorstellung. Wie `minSureWrong` im Verstehens-Modus. */
export const SURE_WRONG_MIN = 2;
/** Ab dieser Trefferquote gilt der Stoff als „sonst sicher“. */
export const SOLID_ACCURACY = 2 / 3;

export interface ErrorAttempt {
  /** Die gezeigte Frage (Original oder Variante): nur dort ist eine Option-ID vergleichbar. */
  shownQuestionId: string;
  correct: boolean;
  optionId: string | null;
  /** Mit „sicher“ beantwortet. */
  sure: boolean;
  /** Schneller als die übliche Antwortzeit der Frage; null = nicht messbar. */
  fast: boolean | null;
}

/** Fehlerart einer Frage für eine Person; null, wenn es keinen Fehler gab. */
export function classifyErrors(attempts: ErrorAttempt[]): ErrorType | null {
  const wrong = attempts.filter((a) => !a.correct);
  if (wrong.length === 0) return null;
  if (attempts.length < MIN_ATTEMPTS) return "unknown";
  const sameOption = new Map<string, number>();
  for (const w of wrong) if (w.optionId) sameOption.set(`${w.shownQuestionId}:${w.optionId}`, (sameOption.get(`${w.shownQuestionId}:${w.optionId}`) ?? 0) + 1);
  const top = Math.max(0, ...sameOption.values());
  if ((top >= REPEATED_OPTION_MIN && top * 2 >= wrong.length) || wrong.filter((w) => w.sure).length >= SURE_WRONG_MIN) return "misconception";
  const accuracy = (attempts.length - wrong.length) / attempts.length;
  if (accuracy < SOLID_ACCURACY) return "gap";
  if (wrong.some((w) => w.fast === false)) return "gap";
  if (wrong.every((w) => w.fast === true)) return "slip";
  return "unknown";
}

export interface PersonQuestion {
  group: EvaluationGroup;
  /** Anzeigename der Frage (human_id) und die Konzepte, zu denen sie gehört. */
  question: string;
  concepts: string[];
  attempts: ErrorAttempt[];
}

export type ErrorTypeCounts = Record<ErrorType, number> & { questionsWithErrors: number };

const emptyCounts = (): ErrorTypeCounts => ({ misconception: 0, gap: 0, slip: 0, unknown: 0, questionsWithErrors: 0 });

export interface ErrorTypes {
  /** Je Person und Frage mit Fehlern eine Einordnung. */
  totals: ErrorTypeCounts;
  byQuestion: Record<string, ErrorTypeCounts>;
  byConcept: Record<string, ErrorTypeCounts>;
}

export function computeErrorTypes(rows: PersonQuestion[]): ErrorTypes {
  const result: ErrorTypes = { totals: emptyCounts(), byQuestion: {}, byConcept: {} };
  const add = (counts: ErrorTypeCounts, type: ErrorType) => {
    counts[type] += 1;
    counts.questionsWithErrors += 1;
  };
  for (const row of rows) {
    const type = classifyErrors(row.attempts);
    if (!type) continue;
    add(result.totals, type);
    add((result.byQuestion[row.question] ??= emptyCounts()), type);
    for (const concept of row.concepts) add((result.byConcept[concept] ??= emptyCounts()), type);
  }
  return result;
}

/** Gesamt mit Fragen und Konzepten, je Evaluationsgruppe nur die Summen (sonst wird der Export unlesbar groß). */
export function computeErrorTypesByGroup(rows: PersonQuestion[]) {
  const groups = [...new Set(rows.map((r) => r.group))].sort();
  return {
    all: computeErrorTypes(rows),
    byGroup: Object.fromEntries(groups.map((g) => [g, computeErrorTypes(rows.filter((r) => r.group === g)).totals])) as Partial<Record<EvaluationGroup, ErrorTypeCounts>>,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// 4.7 Hilfe-Verhalten

export interface SolvedSimulation {
  /** Zum Lernziel der Lektion; Konzepte über die Fragen dieses Lernziels. */
  concepts: string[];
  solves: number;
  /** Hilfen (Tipp, Lösung, Fehlversuche) beim letzten Lösen. */
  lastHelps: number;
}

export interface QuestionSkip {
  question: string;
  concepts: string[];
  /** In abgeschlossenen Sitzungen offen gelassen. */
  unanswered: number;
  /** „Heute reicht's“ bei dieser Frage. */
  exits: number;
}

export interface HelpUser {
  group: EvaluationGroup;
  simulations: SolvedSimulation[];
  /** Anfragen „Ich hänge fest“ an Mentoren (ohne Bezug zur Frage gespeichert). */
  mentorRequests: number;
  skips: QuestionSkip[];
}

const share = (numerator: number, n: number): Share => ({ numerator, n, small: n < MIN_N, share: n > 0 ? numerator / n : null });

export interface HelpCounts {
  simulationsWithHelp: number;
  simulations: number;
  unanswered: number;
  exits: number;
}

export interface HelpBehavior {
  simulations: {
    solved: number;
    /** Hilfe beim letzten Lösen. */
    withHelp: Share;
    medianHelps: number | null;
    /** Früh: Hilfe schon beim ersten (bisher einzigen) Lösen. Nenner: einmal gelöste Simulationen. */
    early: Share;
    /** Spät: Hilfe auch noch beim wiederholten Lösen. Nenner: mehrfach gelöste Simulationen. */
    late: Share;
  };
  mentorRequests: { total: number; people: Share };
  /** Personen nach Verhalten: Hilfe gesucht (Simulation mit Hilfe oder „Ich hänge fest“) gegen übersprungen (offen gelassen oder Notausstieg). */
  people: { n: number; seeksHelp: Share; skips: Share; both: Share; neither: Share };
  byQuestion: Record<string, Pick<HelpCounts, "unanswered" | "exits">>;
  byConcept: Record<string, HelpCounts>;
}

export function computeHelpBehavior(people: HelpUser[]): HelpBehavior {
  const sims = people.flatMap((p) => p.simulations);
  const once = sims.filter((s) => s.solves <= 1);
  const repeated = sims.filter((s) => s.solves > 1);
  const byQuestion: HelpBehavior["byQuestion"] = {};
  const byConcept: HelpBehavior["byConcept"] = {};
  const concept = (name: string) => (byConcept[name] ??= { simulationsWithHelp: 0, simulations: 0, unanswered: 0, exits: 0 });
  for (const s of sims) {
    for (const name of s.concepts) {
      concept(name).simulations += 1;
      if (s.lastHelps > 0) concept(name).simulationsWithHelp += 1;
    }
  }
  for (const skip of people.flatMap((p) => p.skips)) {
    const q = (byQuestion[skip.question] ??= { unanswered: 0, exits: 0 });
    q.unanswered += skip.unanswered;
    q.exits += skip.exits;
    for (const name of skip.concepts) {
      concept(name).unanswered += skip.unanswered;
      concept(name).exits += skip.exits;
    }
  }
  const seeks = (p: HelpUser) => p.mentorRequests > 0 || p.simulations.some((s) => s.lastHelps > 0);
  const skips = (p: HelpUser) => p.skips.some((s) => s.unanswered > 0 || s.exits > 0);
  const count = (test: (p: HelpUser) => boolean) => share(people.filter(test).length, people.length);
  return {
    simulations: {
      solved: sims.length,
      withHelp: share(sims.filter((s) => s.lastHelps > 0).length, sims.length),
      medianHelps: median(sims.map((s) => s.lastHelps)),
      early: share(once.filter((s) => s.lastHelps > 0).length, once.length),
      late: share(repeated.filter((s) => s.lastHelps > 0).length, repeated.length),
    },
    mentorRequests: { total: people.reduce((sum, p) => sum + p.mentorRequests, 0), people: count((p) => p.mentorRequests > 0) },
    people: {
      n: people.length,
      seeksHelp: count(seeks),
      skips: count(skips),
      both: count((p) => seeks(p) && skips(p)),
      neither: count((p) => !seeks(p) && !skips(p)),
    },
    byQuestion,
    byConcept,
  };
}

/** Gesamt mit Fragen und Konzepten, je Evaluationsgruppe ohne die Listen. */
export function computeHelpBehaviorByGroup(people: HelpUser[]) {
  const groups = [...new Set(people.map((p) => p.group))].sort();
  const withoutLists = (h: HelpBehavior) => ({ simulations: h.simulations, mentorRequests: h.mentorRequests, people: h.people });
  return {
    all: computeHelpBehavior(people),
    byGroup: Object.fromEntries(groups.map((g) => [g, withoutLists(computeHelpBehavior(people.filter((p) => p.group === g)))])) as Partial<Record<EvaluationGroup, ReturnType<typeof withoutLists>>>,
  };
}
