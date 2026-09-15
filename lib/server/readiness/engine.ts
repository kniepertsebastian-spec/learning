/**
 * R2.5 (roadmap.md): "Readiness weiterentwickeln" - reine Berechnungslogik
 * (kein DB-Zugriff), analog zu lib/server/review/scheduler.ts und
 * lib/server/study/session-builder.ts. Ersetzt die bisherige Readiness aus
 * lib/server/exam/scoring.ts (dort: ausschließlich der EINE gerade
 * abgelegte Exam-Versuch) durch eine Einschätzung, die Objective-Abdeckung,
 * Aktualität, Übungsmenge und vergangene Probeprüfungen einbezieht - die
 * bisherige exam/scoring.ts-Readiness bleibt unverändert als unmittelbares
 * Ergebnis EINES Versuchs bestehen (andere Frage: "wie lief diese eine
 * Prüfung"), diese hier beantwortet "wie bereit bin ich insgesamt".
 */

export type ReadinessLevel =
  | "WELL_PREPARED"
  | "ADEQUATELY_PREPARED"
  | "SOMEWHAT_PREPARED"
  | "NEEDS_PREPARATION"
  | "INSUFFICIENT_DATA";

export interface ReadinessInputs {
  totalObjectives: number;
  /** Objectives mit mindestens einem Übungsversuch (objective_progress-Zeile). */
  attemptedObjectives: number;
  /** Durchschnittliche Mastery (0-100) NUR über die bereits versuchten
   * Objectives - getrennt von der Abdeckung, damit hohe Mastery auf wenigen
   * Objectives die Readiness nicht künstlich hochzieht (siehe contentScore). */
  avgMasteryOverAttempted: number;
  /** Tage seit der letzten Übungsaktivität (Quiz, Session oder Probeprüfung)
   * - `null`, wenn noch nie geübt wurde. */
  daysSinceLastActivity: number | null;
  /** Gesamtzahl je beantworteter Fragen (über review_items, siehe
   * lib/server/readiness/service.ts) - Grundlage für die Datenmengen-
   * Komponente der Konfidenz. */
  totalAnsweredQuestions: number;
  /** Ergebnisse (0-100) der letzten bis zu drei abgeschlossenen
   * Probeprüfungen, neueste zuerst. Leer = noch keine absolviert. */
  recentExamScores: number[];
}

export interface ReadinessBreakdown {
  objectiveCoverage: number; // 0-1
  avgMasteryOverAttempted: number; // 0-100
  contentScore: number; // 0-100 = avgMasteryOverAttempted * objectiveCoverage
  recencyFactor: number; // 0-1
  examTrend: number | null; // 0-100, Durchschnitt der letzten Probeprüfungen
  practiceScore: number; // 0-100 = contentScore * recencyFactor
}

export interface ReadinessResult {
  /** `null`, wenn die Konfidenz unter der Mindestschwelle liegt - siehe
   * "Unsicherheit bei zu wenig Daten deutlich anzeigen" (roadmap.md): dann
   * lieber gar keine Prozentzahl zeigen als eine, die mehr Präzision
   * vortäuscht, als die Datenlage hergibt. */
  score: number | null;
  level: ReadinessLevel;
  /** 0-1, wie viel Gewicht die zugrunde liegenden Daten tragen können. */
  confidence: number;
  breakdown: ReadinessBreakdown;
}

const INSUFFICIENT_DATA_CONFIDENCE_THRESHOLD = 0.25;
/** Ab wie vielen beantworteten Fragen die Datenmengen-Komponente der
 * Konfidenz ihr Maximum erreicht - bewusst grob, keine echte Statistik. */
const CONFIDENCE_FULL_QUESTION_COUNT = 100;
/** Ab wie vielen Probeprüfungen die entsprechende Konfidenz-Komponente ihr
 * Maximum erreicht. */
const CONFIDENCE_FULL_EXAM_COUNT = 2;

function recencyFactorForDays(days: number | null): number {
  if (days === null) return 0.7;
  if (days <= 3) return 1.0;
  if (days <= 7) return 0.95;
  if (days <= 14) return 0.85;
  if (days <= 30) return 0.75;
  return 0.6;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function levelForScore(score: number): Exclude<ReadinessLevel, "INSUFFICIENT_DATA"> {
  if (score >= 80) return "WELL_PREPARED";
  if (score >= 70) return "ADEQUATELY_PREPARED";
  if (score >= 60) return "SOMEWHAT_PREPARED";
  return "NEEDS_PREPARATION";
}

/**
 * "Readiness nicht nur aus einem einzelnen Exam-Versuch ableiten" +
 * "Objective-Abdeckung, Aktualität, Anzahl der Versuche und Probeprüfungen
 * einbeziehen" + "Unsicherheit bei zu wenig Daten deutlich anzeigen"
 * (roadmap.md, alle R2.5). `breakdown` liefert direkt die Begründung für
 * "Warum ist meine Readiness 68 %?".
 */
export function computeReadiness(inputs: ReadinessInputs): ReadinessResult {
  const objectiveCoverage =
    inputs.totalObjectives > 0 ? inputs.attemptedObjectives / inputs.totalObjectives : 0;
  const contentScore = inputs.avgMasteryOverAttempted * objectiveCoverage;
  const recencyFactor = recencyFactorForDays(inputs.daysSinceLastActivity);
  const practiceScore = contentScore * recencyFactor;
  const examTrend = inputs.recentExamScores.length > 0 ? average(inputs.recentExamScores) : null;

  const breakdown: ReadinessBreakdown = {
    objectiveCoverage,
    avgMasteryOverAttempted: inputs.avgMasteryOverAttempted,
    contentScore,
    recencyFactor,
    examTrend,
    practiceScore,
  };

  // Probeprüfungen sind die realistischste Simulation - gehen mit gleichem
  // Gewicht wie der reine Übungsfortschritt ein, sobald mindestens eine
  // vorliegt; ohne Probeprüfung trägt allein der Übungsfortschritt.
  const rawScore = examTrend !== null ? 0.5 * practiceScore + 0.5 * examTrend : practiceScore;

  const dataVolumeFactor = Math.min(1, inputs.totalAnsweredQuestions / CONFIDENCE_FULL_QUESTION_COUNT);
  const examFactor = Math.min(1, inputs.recentExamScores.length / CONFIDENCE_FULL_EXAM_COUNT);
  const confidence = 0.5 * dataVolumeFactor + 0.3 * objectiveCoverage + 0.2 * examFactor;

  if (confidence < INSUFFICIENT_DATA_CONFIDENCE_THRESHOLD) {
    return { score: null, level: "INSUFFICIENT_DATA", confidence, breakdown };
  }

  const score = Math.round(Math.max(0, Math.min(100, rawScore)));
  return { score, level: levelForScore(score), confidence, breakdown };
}
