import { getDb } from "@/lib/server/db/client";
import { conceptStruggles } from "@/lib/server/db/schema";
import { flagRows, readinessCalibration, recallEvaluation, understandingSummary } from "@/lib/psrp/impact-report";
import { baselineSource, exportMetrics } from "./metrics";

/**
 * Wirkungsbericht für Admins (docs/roadmaps/roadmap_didaktik.md, Phase 7): beschreibend, aus den vorhandenen Messwerten (`exportMetrics`, die auch
 * `npm run psrp:metrics` ausgibt) und dem Verstehens-Modus (`concept_struggle`). Verändert nichts; Entscheidungen bleiben Menschen vorbehalten.
 */
export async function getImpactReport(asOf: Date = new Date()) {
  const metrics = await exportMetrics({ asOf });
  const struggles = await getDb().select({ status: conceptStruggles.status, detectedAt: conceptStruggles.detectedAt, resolvedAt: conceptStruggles.resolvedAt }).from(conceptStruggles);
  return {
    asOf,
    calibration: readinessCalibration(metrics.examResults),
    recall: recallEvaluation(metrics.recallCheck.checks),
    flags: flagRows(baselineSource(metrics).retentionByFlag),
    understanding: understandingSummary(struggles),
  };
}

export type ImpactReport = Awaited<ReturnType<typeof getImpactReport>>;
