/**
 * PSRP-HR Phase 7.3: Kalibrierungswert (Selbsteinschätzung). Positiv = Überschätzung, negativ = Unterschätzung.
 * Die Messung verändert das FSRS-Rating nie; Abfragen sind normale Reviews mit review_type = probe.
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { probeResults, userCalibration } from "@/lib/server/db/schema";
import { DEFAULT_PSRP_CONFIG, type PsrpConfig } from "./config";

export interface ProbeObservation {
  /** FSRS-Vorhersage zum Zeitpunkt der Abfrage. */
  predictedR: number;
  /** Letztes Selbst-Rating (1-4) des Konzepts, falls vorhanden. */
  selfRating: number | null;
  /** Erfolgsquote der Variante in der Population, falls bekannt. */
  populationRate: number | null;
  success: boolean;
  timestamp?: Date;
}

/** Erwarteter Erfolg aus Selbst-Rating und Populations-Erfolgsquote (Gewichtung konfigurierbar); Rückfall: FSRS-Vorhersage. */
export function expectedSuccess(obs: ProbeObservation, config: PsrpConfig["probes"] = DEFAULT_PSRP_CONFIG.probes): number {
  const self = obs.selfRating === null ? null : config.selfRatingExpected[Math.min(4, Math.max(1, Math.round(obs.selfRating))) as 1 | 2 | 3 | 4];
  const pop = obs.populationRate;
  if (self !== null && pop !== null) return config.selfRatingWeight * self + (1 - config.selfRatingWeight) * pop;
  return self ?? pop ?? obs.predictedR;
}

export type CalibrationStatus = "unknown" | "calibrated" | "overestimates" | "underestimates";

export interface CalibrationValue {
  bias: number;
  ciLow: number;
  ciHigh: number;
  n: number;
  brier: number | null;
  status: CalibrationStatus;
}

/**
 * bias = Mittelwert(erwarteter − tatsächlicher Erfolg), bayessch Richtung Populationsmittel geschrumpft:
 * solange weniger als die Mindestanzahl Abfragen vorliegt, zählt das Populationsmittel mit
 * (Mindestanzahl − n) Pseudo-Beobachtungen; ab der Mindestanzahl entfällt die Schrumpfung.
 * Das Konfidenzintervall folgt aus der Streuung der Einzelwerte (mit demselben Schrumpfungsfaktor).
 */
export function computeCalibration(
  observations: ProbeObservation[],
  config: PsrpConfig["probes"] = DEFAULT_PSRP_CONFIG.probes,
): CalibrationValue {
  const n = observations.length;
  if (n === 0) {
    return { bias: config.populationBias, ciLow: config.populationBias - 1, ciHigh: config.populationBias + 1, n: 0, brier: null, status: "unknown" };
  }
  const residuals = observations.map((o) => expectedSuccess(o, config) - (o.success ? 1 : 0));
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? residuals.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1) : 0.25;
  const prior = Math.max(0, config.minProbesForCalibration - n);
  const bias = (n * mean + prior * config.populationBias) / (n + prior);
  const se = (Math.sqrt(variance / n) * n) / (n + prior);
  // Bei wenig Daten bleibt das Intervall breit: mindestens die Unsicherheit des Prior-Anteils.
  const half = config.ciZ * Math.max(se, prior > 0 ? 0.5 * (prior / (n + prior)) : 0);
  const brier = residuals.reduce((a, r) => a + r * r, 0) / n;
  const ciLow = bias - half;
  const ciHigh = bias + half;
  return { bias, ciLow, ciHigh, n, brier, status: classifyCalibration({ bias, ciLow, ciHigh, n }, config) };
}

/** Belastbar erst ab der Mindestanzahl Abfragen und wenn das Konfidenzintervall die 0 nicht einschließt. */
export function classifyCalibration(
  value: Pick<CalibrationValue, "bias" | "ciLow" | "ciHigh" | "n">,
  config: PsrpConfig["probes"] = DEFAULT_PSRP_CONFIG.probes,
): CalibrationStatus {
  if (value.n < config.minProbesForCalibration) return "unknown";
  if (value.ciLow > 0 && value.bias >= config.biasOverThreshold) return "overestimates";
  if (value.ciHigh < 0 && value.bias <= config.biasUnderThreshold) return "underestimates";
  return "calibrated";
}

/** Verlauf des Gesamtwerts: der Wert nach jeder gewerteten Abfrage (in zeitlicher Reihenfolge). */
export function calibrationHistory(
  observations: ProbeObservation[],
  config: PsrpConfig["probes"] = DEFAULT_PSRP_CONFIG.probes,
) {
  const sorted = [...observations].sort((a, b) => (a.timestamp?.getTime() ?? 0) - (b.timestamp?.getTime() ?? 0));
  return sorted.map((_, i) => {
    const value = computeCalibration(sorted.slice(0, i + 1), config);
    return { n: value.n, bias: value.bias, ciLow: value.ciLow, ciHigh: value.ciHigh, brier: value.brier, timestamp: sorted[i].timestamp?.toISOString() ?? null };
  });
}

/** Zeile für Themengebiete ohne eigene Zuordnung = Gesamtwert des Nutzers. */
export const OVERALL_TOPIC = "__all__";

/** Neuberechnung nach jeder gewerteten Abfrage: ein Wert je Themengebiet plus Gesamtwert (Brier-Score). */
export async function recomputeUserCalibration(userId: string, config = DEFAULT_PSRP_CONFIG.probes): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(probeResults).where(eq(probeResults.userId, userId));
  const byTopic = new Map<string, ProbeObservation[]>();
  const all: ProbeObservation[] = [];
  for (const r of rows) {
    const obs: ProbeObservation = {
      predictedR: r.predictedR, selfRating: r.selfRating, populationRate: r.populationRate, success: r.success, timestamp: r.createdAt,
    };
    byTopic.set(r.topicArea, [...(byTopic.get(r.topicArea) ?? []), obs]);
    all.push(obs);
  }
  byTopic.set(OVERALL_TOPIC, all);
  for (const [topicArea, observations] of byTopic) {
    const v = computeCalibration(observations, config);
    await db
      .insert(userCalibration)
      .values({ userId, topicArea, bias: v.bias, ciLow: v.ciLow, ciHigh: v.ciHigh, nProbes: v.n, brier: v.brier, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [userCalibration.userId, userCalibration.topicArea],
        set: { bias: v.bias, ciLow: v.ciLow, ciHigh: v.ciHigh, nProbes: v.n, brier: v.brier, updatedAt: sql`now()` },
      });
  }
}
