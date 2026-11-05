/**
 * Läuft einmal beim Start des Servers (Next.js instrumentation). Die Kursgenerierung läuft im App-Prozess; nach einem
 * Neustart (Deployment, Absturz) stünden laufende Aufträge sonst für immer auf „läuft“. Der Watchdog setzt sie fort
 * (siehe recoverStaleCourseGenerationJobs). Dazu die Abfrage der Gemini-Batch-Aufträge (lib/server/ai-batch/service.ts).
 */
export async function register() {
  // Import nur innerhalb dieser Bedingung: so landet der Server-Code (Datenbank, Worker) nicht im Edge-Bundle.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    try {
      const { startCourseGenerationWatchdog } = await import("./lib/server/course-generation/runner");
      startCourseGenerationWatchdog();
    } catch (error) {
      console.error("Watchdog der Kursgenerierung konnte nicht starten:", error);
    }
    try {
      // Fragt offene Gemini-Batch-Aufträge ab (nur sinnvoll mit GEMINI_BATCH=1; ohne Aufträge tut der Lauf nichts).
      const { startGeminiBatchPoller } = await import("./lib/server/ai-batch/service");
      startGeminiBatchPoller();
    } catch (error) {
      console.error("Abfrage der Gemini-Batch-Aufträge konnte nicht starten:", error);
    }
  }
}
