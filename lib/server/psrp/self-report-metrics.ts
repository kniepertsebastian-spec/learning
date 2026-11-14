/**
 * Auswertung der freiwilligen Selbstauskünfte (Aufgabe 18, Review 12.11.2026): reine Berechnung ohne Datenbank, nur beschreibend.
 * Jeder Wert nennt seinen Nenner `n`; unter `MIN_N` gilt er als „klein“ (docs/MESSEN.md). Die Antworten ändern in der App noch nichts.
 */
import { SELF_REPORT_KINDS, type SelfReportKind } from "@/lib/self-reports";

export const MIN_N = 20;
/** 5.2: Ab so vielen Prozentpunkten über dem tatsächlichen Ergebnis im Rückblick gilt die Vorhersage als überschätzt. */
export const OVERCONFIDENCE_POINTS = 10;

export interface SelfReportRow {
  /** Nur zum Zusammenführen mit Rückblick und Test, wird nie ausgegeben. */
  userKey: string;
  kind: SelfReportKind;
  /** null = übersprungen. */
  value: string | null;
  refId: string | null;
}

export interface RecallOutcome {
  userKey: string;
  sectionId: string;
  questionCount: number;
  correctCount: number;
}

export interface QuizOutcome {
  userKey: string;
  sectionId: string;
  /** Ergebnis (0 bis 100) des ersten abgeschlossenen Lektionstests. */
  score: number;
}

export interface KindCounts {
  asked: number;
  answered: number;
  skipped: number;
  skipShare: number | null;
  small: boolean;
}

export interface SelfReportMetrics {
  /** Gefragt, beantwortet und übersprungen je Art. Steigt der Anteil übersprungener Fragen, sind es zu viele. */
  byKind: Record<SelfReportKind, KindCounts>;
  /** 5.2: Vorhersage nach der Lektion gegen das tatsächliche Ergebnis im Rückblick derselben Lektion. */
  retentionForecast: { n: number; small: boolean; meanForecast: number | null; meanActual: number | null; meanGap: number | null; overconfident: number };
  /** 5.1: Ergebnis des ersten Lektionstests nach empfundener Anstrengung („leicht“ = 1 bis 2, „schwer“ = 4 bis 5). */
  effort: { easy: ScoreArm; hard: ScoreArm; difference: number | null };
  /** 5.4: Verteilung der Gründe fürs Lernen. */
  learningReason: Record<string, number>;
}

export interface ScoreArm {
  n: number;
  small: boolean;
  meanScore: number | null;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const arm = (scores: number[]): ScoreArm => ({ n: scores.length, small: scores.length < MIN_N, meanScore: mean(scores) });

export function computeSelfReportMetrics(rows: SelfReportRow[], recalls: RecallOutcome[], quizzes: QuizOutcome[]): SelfReportMetrics {
  const byKind = Object.fromEntries(
    SELF_REPORT_KINDS.map((kind) => {
      const own = rows.filter((r) => r.kind === kind);
      const skipped = own.filter((r) => r.value === null).length;
      return [kind, { asked: own.length, answered: own.length - skipped, skipped, skipShare: own.length ? skipped / own.length : null, small: own.length < MIN_N }];
    }),
  ) as Record<SelfReportKind, KindCounts>;

  const recallOf = (userKey: string, sectionId: string) => recalls.find((r) => r.userKey === userKey && r.sectionId === sectionId && r.questionCount > 0);
  const pairs = rows.flatMap((r) => {
    if (r.kind !== "retention_forecast" || r.value === null || !r.refId) return [];
    const recall = recallOf(r.userKey, r.refId);
    return recall ? [{ forecast: Number(r.value), actual: (recall.correctCount / recall.questionCount) * 100 }] : [];
  });

  const scoreOf = (userKey: string, sectionId: string) => quizzes.find((q) => q.userKey === userKey && q.sectionId === sectionId)?.score;
  const effortScores = (levels: string[]) =>
    rows.flatMap((r) => {
      if (r.kind !== "effort" || r.value === null || !r.refId || !levels.includes(r.value)) return [];
      const score = scoreOf(r.userKey, r.refId);
      return score === undefined ? [] : [score];
    });
  const easy = arm(effortScores(["1", "2"]));
  const hard = arm(effortScores(["4", "5"]));

  const reasons: Record<string, number> = {};
  for (const r of rows) if (r.kind === "learning_reason" && r.value !== null) reasons[r.value] = (reasons[r.value] ?? 0) + 1;

  const meanForecast = mean(pairs.map((p) => p.forecast));
  const meanActual = mean(pairs.map((p) => p.actual));
  return {
    byKind,
    retentionForecast: {
      n: pairs.length,
      small: pairs.length < MIN_N,
      meanForecast,
      meanActual,
      meanGap: meanForecast !== null && meanActual !== null ? meanForecast - meanActual : null,
      overconfident: pairs.filter((p) => p.forecast - p.actual >= OVERCONFIDENCE_POINTS).length,
    },
    effort: { easy, hard, difference: easy.meanScore !== null && hard.meanScore !== null ? hard.meanScore - easy.meanScore : null },
    learningReason: reasons,
  };
}
