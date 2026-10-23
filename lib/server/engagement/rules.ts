/** Frühwarnung für stille Abbrüche (roadmap_motivation Phase 2): reine Regeln ohne DB. Alle Schwellen sind Platzhalter. */
import type { EngagementSignal, EngagementSignalKind, StudySessionStatus } from "@/lib/server/db/schema";
import { median } from "@/lib/server/psrp/state";

export interface EngagementConfig {
  windowDays: number;
  /** Auslösung erst bei Muster: mindestens so viele verschiedene Signalarten im Fenster. */
  minDistinctKinds: number;
  /** Sessions kürzer als so viele Minuten oder nie beendet (abandoned) zählen als abgebrochen. */
  shortSessionMinutes: number;
  abandonAfterHours: number;
  minShortSessions: number;
  /** Fehlerquote im Fenster mindestens so viel über der persönlichen Quote davor (absolut). */
  errorRateMargin: number;
  minWindowReviews: number;
  minBaselineReviews: number;
  slowFactor: number;
  outlierFactor: number;
  /** Check-ins: die letzten N übersprungen, nachdem die davor (mindestens M von K) ausgefüllt waren. */
  skippedCheckins: number;
  filledBefore: { of: number; atLeast: number };
  /** Deeskalation: Dauer in Sessions, Tageslimit-Faktor. */
  deescalationSessions: number;
  limitFactor: number;
  /** Nach „Nein danke“ so viele Tage nicht erneut auslösen. */
  declineCooldownDays: number;
}

export const DEFAULT_ENGAGEMENT_CONFIG: EngagementConfig = {
  windowDays: 7,
  minDistinctKinds: 2,
  shortSessionMinutes: 2,
  abandonAfterHours: 12,
  minShortSessions: 2,
  errorRateMargin: 0.15,
  minWindowReviews: 10,
  minBaselineReviews: 30,
  slowFactor: 1.5,
  outlierFactor: 3,
  skippedCheckins: 3,
  filledBefore: { of: 5, atLeast: 4 },
  deescalationSessions: 3,
  limitFactor: 0.5,
  declineCooldownDays: 7,
};

export interface SessionFact {
  status: StudySessionStatus;
  plannedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface EngagementFacts {
  /** Sessions im Beobachtungsfenster. */
  sessions: SessionFact[];
  /** Reviews im Fenster und davor (persönlicher Maßstab); responseTimeMs darf fehlen. */
  window: Array<{ rating: number; responseTimeMs: number | null }>;
  baseline: Array<{ rating: number; responseTimeMs: number | null }>;
  /** Check-ins, neueste zuerst: true = übersprungen (imputed). */
  checkinsSkipped: boolean[];
  /** Anzahl Notausstiege im Fenster (Paket 3.7b). */
  exits: number;
}

const HOUR_MS = 3_600_000;

function isShortOrAbandoned(s: SessionFact, now: Date, config: EngagementConfig): boolean {
  if (s.status === "abandoned") return true;
  if (s.status === "planned" || s.status === "in_progress") return now.getTime() - s.plannedAt.getTime() > config.abandonAfterHours * HOUR_MS;
  if (s.status === "completed" && s.startedAt && s.completedAt) return s.completedAt.getTime() - s.startedAt.getTime() < config.shortSessionMinutes * 60_000;
  return false;
}

function errorRate(rows: Array<{ rating: number }>): number {
  return rows.filter((r) => r.rating === 1).length / rows.length;
}

function medianTime(rows: Array<{ responseTimeMs: number | null }>, outlierFactor: number): number | null {
  const times = rows.flatMap((r) => (r.responseTimeMs === null ? [] : [r.responseTimeMs]));
  const med = median(times);
  return med === null ? null : median(times.filter((t) => t <= med * outlierFactor));
}

/** Signale aus den Fakten; jedes Signal höchstens einmal je Art. Einzelne Ereignisse zählen erst als Muster (siehe `isPattern`). */
export function detectEngagementSignals(facts: EngagementFacts, now: Date, config: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG): EngagementSignal[] {
  const at = now.toISOString();
  const kinds: EngagementSignalKind[] = [];

  if (facts.sessions.filter((s) => isShortOrAbandoned(s, now, config)).length >= config.minShortSessions) kinds.push("short_sessions");

  if (facts.window.length >= config.minWindowReviews && facts.baseline.length >= config.minBaselineReviews) {
    if (errorRate(facts.window) - errorRate(facts.baseline) >= config.errorRateMargin) kinds.push("high_error_rate");
    const now_ = medianTime(facts.window, config.outlierFactor);
    const before = medianTime(facts.baseline, config.outlierFactor);
    if (now_ !== null && before !== null && before > 0 && now_ >= before * config.slowFactor) kinds.push("slow_answers");
  }

  const recent = facts.checkinsSkipped.slice(0, config.skippedCheckins);
  const earlier = facts.checkinsSkipped.slice(config.skippedCheckins, config.skippedCheckins + config.filledBefore.of);
  if (
    recent.length === config.skippedCheckins &&
    recent.every(Boolean) &&
    earlier.length === config.filledBefore.of &&
    earlier.filter((skipped) => !skipped).length >= config.filledBefore.atLeast
  ) {
    kinds.push("checkin_skipped");
  }

  if (facts.exits >= 1) kinds.push("exit_with_win");
  return kinds.map((kind) => ({ kind, at }));
}

/** Auslösung nur als Muster: mindestens `minDistinctKinds` verschiedene Signalarten. */
export function isPattern(signals: EngagementSignal[], config: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG): boolean {
  return new Set(signals.map((s) => s.kind)).size >= config.minDistinctKinds;
}
