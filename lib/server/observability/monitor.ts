import { createHash, timingSafeEqual } from "node:crypto";
import { and, desc, gt, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseGenerationJobs, type CourseGenerationJobStatus } from "@/lib/server/db/schema";
import { getAiBudgetStatus } from "@/lib/server/admin/ai-cost";
import { recentRequestErrors } from "./request-errors";
import { readProcessStats, type ProcessStats } from "./process-stats";

/**
 * Was scripts/monitor.sh zusätzlich zu Erreichbarkeit, Backup und Platte prüft (R5): Serverfehler, gescheiterte
 * Kursgenerierungen, KI-Budget. Abruf über GET /api/monitor mit `Authorization: Bearer $MONITOR_TOKEN`.
 */

/** Endzustände der Kursgenerierung, die einen Menschen brauchen. */
export const FAILED_JOB_STATUSES: CourseGenerationJobStatus[] = ["preflight_failed", "canary_failed", "circuit_breaker_open", "cost_limit_reached", "failed"];

export const REQUEST_ERROR_WINDOW_MS = 15 * 60 * 1000;
export const FAILED_JOB_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface MonitorReport {
  requestErrors: { windowMinutes: number; count: number; latest: Array<{ time: string; method: string; path: string; digest: string | null; message: string }> };
  failedJobs: Array<{ id: string; title: string; status: string; errorCode: string | null; completedAt: string | null }>;
  /** null: kein Budget gesetzt (GEMINI_BUDGET_USD). */
  aiBudget: { limitUsd: number; spentUsd: number; percent: number } | null;
  /** R3: Last des Web-Prozesses seit der vorigen Abfrage. */
  process: ProcessStats;
}

/** Prüft das Token in konstanter Zeit. Ohne gesetztes MONITOR_TOKEN ist der Endpunkt aus. */
export function isMonitorAuthorized(header: string | null, token = process.env.MONITOR_TOKEN): boolean {
  if (!token || token.length < 16 || !header?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(token));
}

export async function getMonitorReport(now = Date.now()): Promise<MonitorReport> {
  const errors = recentRequestErrors(REQUEST_ERROR_WINDOW_MS, now);
  const [jobs, budget] = await Promise.all([
    getDb()
      .select({
        id: courseGenerationJobs.id,
        title: courseGenerationJobs.courseTitle,
        organizationId: courseGenerationJobs.organizationId,
        status: courseGenerationJobs.status,
        errorCode: courseGenerationJobs.errorCode,
        completedAt: courseGenerationJobs.completedAt,
      })
      .from(courseGenerationJobs)
      .where(and(inArray(courseGenerationJobs.status, FAILED_JOB_STATUSES), gt(courseGenerationJobs.updatedAt, new Date(now - FAILED_JOB_WINDOW_MS))))
      .orderBy(desc(courseGenerationJobs.updatedAt))
      .limit(20),
    getAiBudgetStatus(),
  ]);
  return {
    requestErrors: {
      windowMinutes: REQUEST_ERROR_WINDOW_MS / 60_000,
      count: errors.length,
      latest: errors.slice(0, 5).map((e) => ({ time: new Date(e.at).toISOString(), method: e.method, path: e.path, digest: e.digest, message: e.message.slice(0, 200) })),
    },
    failedJobs: jobs.map((job) => ({
      id: job.id,
      // Interne Lernpfade einer Firma: der Betreiber sieht ihre Titel nicht (wie in allen Admin-Ansichten).
      title: job.organizationId ? "Interner Lernpfad einer Firma" : job.title,
      status: job.status,
      errorCode: job.errorCode,
      completedAt: job.completedAt?.toISOString() ?? null,
    })),
    process: readProcessStats(),
    aiBudget: budget ? { limitUsd: budget.limitUsd, spentUsd: Number(budget.spentUsd.toFixed(2)), percent: Math.round((budget.spentUsd / budget.limitUsd) * 100) } : null,
  };
}

/**
 * Zeilenformat für scripts/monitor.sh (kein jq auf dem Server nötig). Eine Angabe je Zeile, das erste Wort ist der Schlüssel,
 * Tabs trennen die Felder:
 *   request_errors <Anzahl> <Minuten>
 *   request_error <Zeit> <Methode> <Pfad> <Meldung>          (die neuesten fünf)
 *   failed_job <ID> <Status> <Fehlercode> <Titel>
 *   ai_budget <Prozent> <ausgegeben USD> <Limit USD>        (fehlt ohne GEMINI_BUDGET_USD)
 *   process <Event-Loop p99 ms> <max ms> <RSS MB> <Heap MB> <laufende Kursgenerierungen>
 */
export function formatMonitorReport(report: MonitorReport): string {
  const clean = (value: string | null) => (value ?? "-").replace(/[\t\r\n]+/g, " ").trim() || "-";
  const lines = [`request_errors\t${report.requestErrors.count}\t${report.requestErrors.windowMinutes}`];
  for (const e of report.requestErrors.latest) lines.push(["request_error", e.time, e.method, clean(e.path), clean(e.message)].join("\t"));
  for (const job of report.failedJobs) lines.push(["failed_job", job.id, job.status, clean(job.errorCode), clean(job.title)].join("\t"));
  const p = report.process;
  lines.push(["process", p.eventLoopP99Ms, p.eventLoopMaxMs, p.rssMb, p.heapUsedMb, p.activeCourseJobs].join("\t"));
  if (report.aiBudget) lines.push(`ai_budget\t${report.aiBudget.percent}\t${report.aiBudget.spentUsd.toFixed(2)}\t${report.aiBudget.limitUsd.toFixed(2)}`);
  return lines.join("\n") + "\n";
}
