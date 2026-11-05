/**
 * Qualität im Betrieb (docs/roadmaps/roadmap_pruefer.md, Phase 6): reine Rechenregeln ohne Datenbank. Die Kennzahlen sind nur für
 * Admins gedacht, nie für Prüfer oder die Öffentlichkeit, und lösen nie eine automatische Folge aus (Hinweis, keine Sanktion).
 */

/** Ab diesem Vielfachen des Durchschnitts gilt ein Wert als „deutlich darüber“ (konfigurierbar mit REVIEWER_QUALITY_FACTOR). */
export const DEFAULT_QUALITY_FACTOR = 2;
/** Kleine Zahlen sagen nichts: ein Hinweis braucht mindestens so viele Ereignisse und so viele freigegebene Fragen. */
export const MIN_EVENTS_FOR_NOTICE = 5;
export const MIN_QUESTIONS_FOR_NOTICE = 20;

export type QualityMetric = "reports" | "variantOutliers" | "conceptStruggles";
export const QUALITY_METRICS: readonly QualityMetric[] = ["reports", "variantOutliers", "conceptStruggles"];

/** Schwellenfaktor aus der Umgebung: eine Zahl über 1 bis 20, sonst der Standard. Leer gilt als nicht gesetzt. */
export function qualityFactor(raw: string | undefined = process.env.REVIEWER_QUALITY_FACTOR): number {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_QUALITY_FACTOR;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 1 && value <= 20 ? value : DEFAULT_QUALITY_FACTOR;
}

/** Ereignisse je 100 Fragen (0 ohne Fragen). */
export function per100(events: number, questions: number): number {
  return questions > 0 ? (events / questions) * 100 : 0;
}

/** Verhältnis zum Durchschnitt; null, wenn es keinen Durchschnitt gibt (er wäre 0) oder der Wert fehlt. */
export function ratioToAverage(rate: number, average: number): number | null {
  return average > 0 ? rate / average : null;
}

export interface MetricCounts {
  events: number;
  questions: number;
}

/**
 * Liegt ein Prüfer bei einer Kennzahl deutlich über dem Durchschnitt? Nur mit genug Ereignissen und Fragen (sonst Zufall). Ein Hinweis
 * für Admins, keine Bewertung der Person.
 */
export function isNoticeable(own: MetricCounts, averageRate: number, factor: number = DEFAULT_QUALITY_FACTOR): boolean {
  if (own.events < MIN_EVENTS_FOR_NOTICE || own.questions < MIN_QUESTIONS_FOR_NOTICE) return false;
  const ratio = ratioToAverage(per100(own.events, own.questions), averageRate);
  return ratio !== null && ratio >= factor;
}
