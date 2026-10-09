import { cleanupJobDocumentsIfDone } from "@/lib/server/internal-courses/temporary-documents";
import { executeCourseGenerationJob, publishPreparedCourseGenerationPackage } from "./worker";

/**
 * In-Prozess-Jobtracking, exakt das Muster von `activeJobs` in
 * lib/server/admin/content-generation.ts (siehe course_generation.md
 * Abschnitt 0: bewusst kein separater Worker-Container für diese
 * Größenordnung). `globalThis`, damit Next.js' Modul-Hot-Reload in der
 * Entwicklung keine zweite, unabhängige Map erzeugt.
 */
const globalForCourseJobs = globalThis as unknown as {
  courseGenerationProcesses?: Map<string, Promise<void>>;
};
const activeJobs =
  globalForCourseJobs.courseGenerationProcesses ?? new Map<string, Promise<void>>();
globalForCourseJobs.courseGenerationProcesses = activeJobs;

export function isCourseGenerationJobActive(jobId: string): boolean {
  return activeJobs.has(jobId);
}

export function startCourseGenerationJob(jobId: string): void {
  if (activeJobs.has(jobId)) return;
  const processPromise = executeCourseGenerationJob(jobId)
    .catch((error) => {
      // executeCourseGenerationJob() fängt und protokolliert eigene Fehler
      // bereits im Job-Datensatz (siehe handleJobFailure) - dieser Catch ist
      // nur ein letztes Netz gegen einen Fehler AUSSERHALB der eigentlichen
      // try/catch-Klammer dort (z.B. beim initialen getCourseGenerationJob).
      console.error(`Course generation job ${jobId} failed outside its own error handling:`, error);
    })
    // Temporäre Dateien eines Kurses der Firma verschwinden nach Erfolg oder Abbruch (nach einem Fehler bleiben sie für den nächsten Versuch).
    .then(() => cleanupJobDocumentsIfDone(jobId))
    .catch((error) => console.error(`Aufräumen der temporären Dateien (${jobId}) fehlgeschlagen:`, error))
    .finally(() => activeJobs.delete(jobId));
  activeJobs.set(jobId, processPromise);
}

/** Für einen `package_ready`-Job (autoPublish=false): importiert das bereits
 * fertige Paket, ohne die Generierung erneut zu durchlaufen. */
export function startCourseGenerationPublish(jobId: string): void {
  if (activeJobs.has(jobId)) return;
  const processPromise = publishPreparedCourseGenerationPackage(jobId)
    .catch((error) => {
      console.error(`Course generation publish ${jobId} failed outside its own error handling:`, error);
    })
    .finally(() => activeJobs.delete(jobId));
  activeJobs.set(jobId, processPromise);
}

const globalForRecovery = globalThis as unknown as { courseGenerationWatchdog?: unknown; courseGenerationLastRecovery?: number };

/**
 * Setzt verwaiste Aufträge fort (siehe recoverStaleCourseGenerationJobs): nach einem Neustart des Servers
 * (Deployment, Absturz) und danach regelmäßig. Höchstens einmal je `minIntervalMs`, damit der Aufruf aus häufig
 * abgefragten Endpunkten nichts kostet. Fehler werden nur protokolliert, sie dürfen nie eine Anfrage scheitern lassen.
 */
export async function recoverStaleCourseGenerationJobsNow(minIntervalMs = 60_000): Promise<void> {
  const now = Date.now();
  if (globalForRecovery.courseGenerationLastRecovery && now - globalForRecovery.courseGenerationLastRecovery < minIntervalMs) return;
  globalForRecovery.courseGenerationLastRecovery = now;
  try {
    const { recoverStaleCourseGenerationJobs } = await import("./job-service");
    const handled = await recoverStaleCourseGenerationJobs(isCourseGenerationJobActive, startCourseGenerationJob);
    for (const { jobId, action } of handled) {
      console.warn(`Kursgenerierung ${jobId}: ohne Lebenszeichen, ${action === "resumed" ? "wird automatisch fortgesetzt" : "als unterbrochen beendet"}.`);
    }
  } catch (error) {
    console.error("Prüfung auf hängende Kursgenerierungen fehlgeschlagen:", error);
  }
}

/** Startet die regelmäßige Prüfung (alle 5 Minuten) einmal je Prozess; die erste läuft kurz nach dem Start. */
export function startCourseGenerationWatchdog(): void {
  if (globalForRecovery.courseGenerationWatchdog) return;
  setTimeout(() => void recoverStaleCourseGenerationJobsNow(0), 30_000);
  const timer: unknown = setInterval(() => void recoverStaleCourseGenerationJobsNow(0), 5 * 60_000);
  // Der Zeitgeber soll den Prozess nicht am Beenden hindern.
  (timer as { unref?: () => void }).unref?.();
  globalForRecovery.courseGenerationWatchdog = timer;
}
