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
