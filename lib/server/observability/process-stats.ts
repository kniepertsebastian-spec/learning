import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";

/**
 * R3 (Review vom 19.11.2026): Die Kursgenerierung läuft im Web-Prozess, mit parallelen Lektionen und großem Kontext. Ob das
 * die App spürbar bremst, zeigen Event-Loop-Verzögerung und Speicher. Beides steht in `/api/monitor` (scripts/monitor.sh
 * warnt ab MONITOR_EVENT_LOOP_MAX_MS) und, solange eine Kursgenerierung läuft, jede Minute als `PROCESS`-Zeile im Log.
 * Wird es spürbar, ist der nächste Schritt ein eigener Worker-Container aus demselben Image.
 */

export interface ProcessStats {
  /** 99. Perzentil der Event-Loop-Verzögerung seit der letzten Abfrage (ms). Über ~100 ms merkt man es bei Klicks. */
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  rssMb: number;
  heapUsedMb: number;
  activeCourseJobs: number;
}

const KEY = Symbol.for("learning.processStats");
type State = { histogram: IntervalHistogram; logTimer?: ReturnType<typeof setInterval> };
function state(): State {
  const g = globalThis as unknown as Record<symbol, State | undefined>;
  if (!g[KEY]) {
    const histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
    g[KEY] = { histogram };
  }
  return g[KEY]!;
}

function activeCourseJobs(): number {
  const map = (globalThis as unknown as { courseGenerationProcesses?: Map<string, unknown> }).courseGenerationProcesses;
  return map?.size ?? 0;
}

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
const ms = (ns: number) => Math.round(ns / 1e6);

/** Liest die Werte und setzt die Event-Loop-Messung zurück (jede Abfrage misst den Zeitraum seit der vorigen). */
export function readProcessStats(reset = true): ProcessStats {
  const { histogram } = state();
  const memory = process.memoryUsage();
  const stats: ProcessStats = {
    eventLoopP99Ms: histogram.count > 0 ? ms(histogram.percentile(99)) : 0,
    eventLoopMaxMs: histogram.count > 0 ? ms(histogram.max) : 0,
    rssMb: mb(memory.rss),
    heapUsedMb: mb(memory.heapUsed),
    activeCourseJobs: activeCourseJobs(),
  };
  if (reset) histogram.reset();
  return stats;
}

/** Startet die Messung einmal je Prozess. Eine Logzeile je Minute, aber nur, solange eine Kursgenerierung läuft. */
export function startProcessStats(intervalMs = 60_000): void {
  const s = state();
  if (s.logTimer) return;
  s.logTimer = setInterval(() => {
    if (activeCourseJobs() === 0) return;
    const stats = readProcessStats(false);
    console.log(
      `PROCESS eventLoopP99Ms=${stats.eventLoopP99Ms} eventLoopMaxMs=${stats.eventLoopMaxMs} rssMb=${stats.rssMb} heapUsedMb=${stats.heapUsedMb} activeCourseJobs=${stats.activeCourseJobs}`,
    );
  }, intervalMs);
  (s.logTimer as { unref?: () => void }).unref?.();
}
