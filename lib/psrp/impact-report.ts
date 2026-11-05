import { forgettingCurve, FSRS6_DEFAULT_WEIGHTS } from "ts-fsrs/models/fsrs-6";

/**
 * Wirkung messen (docs/roadmaps/roadmap_didaktik.md, Phase 7): ein beschreibender Bericht aus den vorhandenen Messwerten (`exportMetrics`,
 * `concept_struggle`). Reine Rechnung ohne Datenbank. Der Bericht nennt Zahlen und ihre Menge, er ändert nichts von selbst: weder Schwellen
 * noch Planung. Gruppen unter MIN_GROUP zeigen nur ihre Anzahl, keine Quote (zu klein, um etwas zu sagen).
 */

export const MIN_GROUP = 5;

export interface Rate {
  n: number;
  /** Treffer (z. B. bestanden oder richtig). */
  hits: number;
  /** Anteil 0 bis 1; null, wenn die Gruppe kleiner als MIN_GROUP ist. */
  rate: number | null;
}

export function rateOf(hits: number, n: number): Rate {
  return { n, hits, rate: n >= MIN_GROUP ? hits / n : null };
}

/* ---- Bereitschaftswert gegen das echte Prüfungsergebnis ---- */

export interface ExamResultLike {
  result: "passed" | "failed";
  readiness: { reached: number; ready: boolean; lastScore: number | null };
}

export interface CalibrationBand {
  key: "none" | "lt50" | "50to64" | "65to79" | "gte80";
  passed: Rate;
}

const BANDS: Array<{ key: CalibrationBand["key"]; test: (score: number | null) => boolean }> = [
  { key: "none", test: (s) => s === null },
  { key: "lt50", test: (s) => s !== null && s < 50 },
  { key: "50to64", test: (s) => s !== null && s >= 50 && s < 65 },
  { key: "65to79", test: (s) => s !== null && s >= 65 && s < 80 },
  { key: "gte80", test: (s) => s !== null && s >= 80 },
];

export interface ReadinessCalibration {
  total: number;
  passRate: Rate;
  /** Nach dem letzten Simulationsergebnis (in Prozent) vor der Prüfung. */
  byLastScore: CalibrationBand[];
  /** Nach dem Urteil der Bereitschafts-Engine („bereit“ oder nicht). */
  byReady: { ready: Rate; notReady: Rate };
  meanLastScore: { passed: number | null; failed: number | null };
}

export function readinessCalibration(results: readonly ExamResultLike[]): ReadinessCalibration {
  const passed = (r: ExamResultLike) => r.result === "passed";
  const mean = (rows: ExamResultLike[]) => {
    const scores = rows.map((r) => r.readiness.lastScore).filter((s): s is number => s !== null);
    return scores.length >= MIN_GROUP ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  };
  const group = (rows: ExamResultLike[]) => rateOf(rows.filter(passed).length, rows.length);
  return {
    total: results.length,
    passRate: group([...results]),
    byLastScore: BANDS.map((b) => ({ key: b.key, passed: group(results.filter((r) => b.test(r.readiness.lastScore))) })),
    byReady: { ready: group(results.filter((r) => r.readiness.ready)), notReady: group(results.filter((r) => !r.readiness.ready)) },
    meanLastScore: { passed: mean(results.filter(passed)), failed: mean(results.filter((r) => !passed(r))) },
  };
}

/* ---- Rückblick „Was weißt du noch?“ ---- */

export interface RecallLike {
  status: string;
  questionCount: number;
  correctCount: number | null;
  hoursSinceLesson: number;
  phiAtLearning: number | null;
  hourAtLearning: number;
}

export interface RecallBand {
  key: string;
  checks: number;
  questions: number;
  actual: Rate;
  /** Vorhergesagte Abrufwahrscheinlichkeit nach dem Standardverlauf von FSRS-6 (Modellannahme, siehe `predictedRecall`); null bei zu kleiner Gruppe. */
  predicted: number | null;
}

/**
 * Vorhersage für den ersten Abstand: Abrufwahrscheinlichkeit nach `hours` Stunden bei der Standard-Anfangsstabilität von FSRS-6 für „Good“.
 * Das ist eine Modellannahme (die Person ist im Mittel so wie die Standardparameter), kein Wert der einzelnen Person.
 */
export function predictedRecall(hours: number): number {
  return forgettingCurve(FSRS6_DEFAULT_WEIGHTS, Math.max(0, hours) / 24, FSRS6_DEFAULT_WEIGHTS[2]);
}

function bandOf(rows: RecallLike[], key: string): RecallBand {
  const questions = rows.reduce((s, r) => s + r.questionCount, 0);
  const correct = rows.reduce((s, r) => s + (r.correctCount ?? 0), 0);
  const actual = rateOf(correct, questions);
  const predicted = actual.rate === null || rows.length === 0 ? null : rows.reduce((s, r) => s + predictedRecall(r.hoursSinceLesson) * r.questionCount, 0) / questions;
  return { key, checks: rows.length, questions, actual, predicted };
}

export interface RecallEvaluation {
  answered: number;
  overall: RecallBand;
  byDelay: RecallBand[];
  /** Tagesform (Φ, 0 = entspannt, 1 = belastet) beim Lernen der Lektion. */
  byPhiAtLearning: RecallBand[];
  /** Tageszeit, zu der die Lektion gelernt wurde. */
  byHourAtLearning: RecallBand[];
}

const hourBand = (h: number): string => (h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17 ? "afternoon" : h >= 17 && h < 22 ? "evening" : "night");
const phiBand = (p: number | null): string => (p === null ? "unknown" : p < 1 / 3 ? "low" : p < 2 / 3 ? "medium" : "high");
const delayBand = (h: number): string => (h < 24 ? "lt24h" : h < 72 ? "24to72h" : "gte72h");

export function recallEvaluation(checks: readonly RecallLike[]): RecallEvaluation {
  const answered = checks.filter((c) => c.status === "answered" && c.correctCount !== null);
  const split = (keys: string[], keyOf: (c: RecallLike) => string) => keys.map((k) => bandOf(answered.filter((c) => keyOf(c) === k), k));
  return {
    answered: answered.length,
    overall: bandOf(answered, "all"),
    byDelay: split(["lt24h", "24to72h", "gte72h"], (c) => delayBand(c.hoursSinceLesson)),
    byPhiAtLearning: split(["low", "medium", "high", "unknown"], (c) => phiBand(c.phiAtLearning)),
    byHourAtLearning: split(["morning", "afternoon", "evening", "night"], (c) => hourBand(c.hourAtLearning)),
  };
}

/* ---- Kennzahlen je Feature-Flag ---- */

export interface FlagArm {
  users: number;
  reviews: number;
  retention: number | null;
}
export interface FlagRow {
  flag: string;
  enabled: FlagArm;
  disabled: FlagArm;
  /** Unterschied der Behaltensquote in Prozentpunkten (an minus aus); null, wenn eine Seite fehlt oder zu klein ist. */
  differencePoints: number | null;
  /** Beide Seiten haben genug Nutzer, um den Unterschied überhaupt anzuschauen. */
  enoughUsers: boolean;
}

const isArm = (v: unknown): v is FlagArm => typeof v === "object" && v !== null && "users" in v && "reviews" in v && "retention" in v;

/** Aus `retentionByFlag` der Messwerte: je Flag die beiden Seiten und der Unterschied. Unbekannte Formen werden übersprungen. */
export function flagRows(retentionByFlag: Record<string, unknown>): FlagRow[] {
  const rows: FlagRow[] = [];
  for (const [flag, value] of Object.entries(retentionByFlag)) {
    const pair = value as { enabled?: unknown; disabled?: unknown } | null;
    if (!pair || !isArm(pair.enabled) || !isArm(pair.disabled)) continue;
    const { enabled, disabled } = pair;
    const enoughUsers = enabled.users >= MIN_GROUP && disabled.users >= MIN_GROUP;
    rows.push({
      flag,
      enabled: { users: enabled.users, reviews: enabled.reviews, retention: enabled.retention },
      disabled: { users: disabled.users, reviews: disabled.reviews, retention: disabled.retention },
      differencePoints: enoughUsers && enabled.retention !== null && disabled.retention !== null ? (enabled.retention - disabled.retention) * 100 : null,
      enoughUsers,
    });
  }
  return rows.sort((a, b) => a.flag.localeCompare(b.flag));
}

/* ---- Verstehens-Modus ---- */

export interface StruggleLike {
  status: "detected" | "in_progress" | "resolved" | "declined";
  detectedAt: Date;
  resolvedAt: Date | null;
}

export interface UnderstandingSummary {
  total: number;
  counts: Record<StruggleLike["status"], number>;
  /** Anteil gelöst an allen entschiedenen Fällen (gelöst, abgelehnt, in Arbeit); null bei zu wenigen. */
  resolved: Rate;
  /** Mittlere Dauer bis „gelöst“ in Tagen; null bei zu wenigen. */
  daysToResolve: { median: number | null; mean: number | null };
}

export function understandingSummary(rows: readonly StruggleLike[]): UnderstandingSummary {
  const counts = { detected: 0, in_progress: 0, resolved: 0, declined: 0 };
  for (const r of rows) counts[r.status]++;
  const days = rows
    .filter((r) => r.status === "resolved" && r.resolvedAt)
    .map((r) => Math.max(0, (r.resolvedAt!.getTime() - r.detectedAt.getTime()) / 86_400_000))
    .sort((a, b) => a - b);
  const median = days.length >= MIN_GROUP ? (days.length % 2 ? days[(days.length - 1) / 2] : (days[days.length / 2 - 1] + days[days.length / 2]) / 2) : null;
  const decided = counts.resolved + counts.declined + counts.in_progress;
  return {
    total: rows.length,
    counts,
    resolved: rateOf(counts.resolved, decided),
    daysToResolve: { median, mean: days.length >= MIN_GROUP ? days.reduce((a, b) => a + b, 0) / days.length : null },
  };
}
