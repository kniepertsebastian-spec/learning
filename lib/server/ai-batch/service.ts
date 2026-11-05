import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { getGeminiClient } from "@/lib/gemini";
import { pollBatch, type BatchClient } from "@/lib/ai/batch";
import { withAiCost } from "@/lib/server/admin/ai-ledger";
import { getDb } from "@/lib/server/db/client";
import { geminiBatchJobs } from "@/lib/server/db/schema";
import { createConceptTagger, tagCourseConcepts, type ConceptTagger } from "@/lib/server/psrp/concepts";
import { applyTaggingJob, taggingKeys, type GeminiBatchJob } from "./tagging";

/**
 * Hintergrundlauf für die Gemini-Batch-Aufträge: fragt offene Aufträge (`gemini_batch_jobs`) regelmäßig ab und verarbeitet die
 * Antworten, sobald Google fertig ist. Der Stand liegt in der Datenbank, ein Neustart des Servers verliert also nichts; der
 * Lauf wird beim Start des Servers aufgenommen (instrumentation.ts). Einzelner Prozess vorausgesetzt (wie die übrigen Läufe).
 */

/** Ein „applying“-Auftrag ohne Lebenszeichen so lange gilt als unterbrochen und wird neu aufgenommen. */
const APPLYING_TIMEOUT_MS = 30 * 60_000;

export interface PollDeps {
  client?: BatchClient;
  /** Ersetzt in Tests den Live-Rückfall der KI. */
  tagger?: ConceptTagger;
  /** Ersetzt in Tests die Voraussetzungs-Ergänzung nach dem Tagging. */
  prerequisites?: (certificationId: string) => Promise<void>;
  now?: Date;
}

export interface PollCounts {
  checked: number;
  applied: number;
  failed: number;
}

async function defaultPrerequisites(certificationId: string): Promise<void> {
  const { backfillPrerequisites, createPrerequisiteGenerator } = await import("@/lib/server/prerequisites/generate");
  await withAiCost({ source: "course_generation", detail: "prerequisites", certificationId }, () =>
    backfillPrerequisites(certificationId, createPrerequisiteGenerator()),
  );
}

/** Voraussetzungen zwischen den Konzepten vorschlagen, sobald der letzte Tagging-Auftrag des Kurses erledigt ist. */
async function finishCourse(certificationId: string, deps: PollDeps): Promise<void> {
  const open = await getDb()
    .select({ id: geminiBatchJobs.id })
    .from(geminiBatchJobs)
    .where(and(eq(geminiBatchJobs.certificationId, certificationId), eq(geminiBatchJobs.kind, "tagging"), inArray(geminiBatchJobs.status, ["submitted", "applying"])))
    .limit(1);
  if (open.length > 0) return;
  await (deps.prerequisites ?? defaultPrerequisites)(certificationId);
}

/** Der Auftrag ist gescheitert: das Tagging läuft wie bisher einzeln, damit der Kurs nicht ohne Konzepte bleibt. */
async function liveFallback(job: GeminiBatchJob, deps: PollDeps): Promise<void> {
  await withAiCost({ source: "course_generation", detail: "tagging", certificationId: job.certificationId }, () =>
    tagCourseConcepts(job.certificationId, deps.tagger ?? createConceptTagger()),
  );
  await finishCourse(job.certificationId, deps);
}

async function settle(job: GeminiBatchJob, status: "done" | "failed", message: string): Promise<void> {
  await getDb()
    .update(geminiBatchJobs)
    .set({ status, message: message.slice(0, 500), updatedAt: new Date(), finishedAt: new Date() })
    .where(eq(geminiBatchJobs.id, job.id));
}

/**
 * Prüft alle offenen Aufträge einmal. Fertige werden verarbeitet, gescheiterte übernimmt der Live-Weg, laufende bleiben liegen.
 * Fehler bei einem Auftrag (z. B. Netzwerk beim Abfragen) lassen ihn offen und stoppen die anderen nicht.
 */
export async function pollGeminiBatches(deps: PollDeps = {}): Promise<PollCounts> {
  const db = getDb();
  const now = deps.now ?? new Date();
  // Eine unterbrochene Verarbeitung (Neustart mittendrin) wieder aufnehmen.
  await db
    .update(geminiBatchJobs)
    .set({ status: "submitted", updatedAt: now })
    .where(and(eq(geminiBatchJobs.status, "applying"), lt(geminiBatchJobs.updatedAt, new Date(now.getTime() - APPLYING_TIMEOUT_MS))));

  const open = await db.select().from(geminiBatchJobs).where(eq(geminiBatchJobs.status, "submitted")).orderBy(asc(geminiBatchJobs.submittedAt));
  const counts: PollCounts = { checked: 0, applied: 0, failed: 0 };
  for (const job of open) {
    counts.checked++;
    try {
      const outcome = await pollBatch(deps.client ?? getGeminiClient(), job.geminiName, taggingKeys(job));
      if (outcome.state === "pending") continue;
      // Nur wer den Auftrag von „submitted“ auf „applying“ setzt, verarbeitet ihn.
      const [claimed] = await db
        .update(geminiBatchJobs)
        .set({ status: "applying", updatedAt: new Date() })
        .where(and(eq(geminiBatchJobs.id, job.id), eq(geminiBatchJobs.status, "submitted")))
        .returning({ id: geminiBatchJobs.id });
      if (!claimed) continue;

      if (outcome.state === "failed") {
        await settle(job, "failed", outcome.message);
        counts.failed++;
        await liveFallback(job, deps).catch((error) => console.error(`Live-Rückfall nach gescheitertem Batch (${job.id}) fehlgeschlagen:`, error));
        continue;
      }
      try {
        const result = await applyTaggingJob(job, outcome.results, deps.tagger);
        await settle(job, "done", `${result.objectives} Lernziele getaggt, ${result.variants} Varianten, ${result.failed} fehlgeschlagen.`);
        counts.applied++;
        await finishCourse(job.certificationId, deps).catch((error) => console.error(`Voraussetzungen nach dem Batch (${job.id}) fehlgeschlagen:`, error));
      } catch (error) {
        // Nicht erneut versuchen: die Antworten wurden vielleicht schon gebucht. Der Live-Weg füllt auf, was fehlt.
        await settle(job, "failed", error instanceof Error ? error.message : String(error));
        counts.failed++;
        await liveFallback(job, deps).catch((fallbackError) => console.error(`Live-Rückfall nach Batch-Fehler (${job.id}) fehlgeschlagen:`, fallbackError));
      }
    } catch (error) {
      console.warn(`Batch ${job.geminiName} konnte nicht abgefragt werden, nächster Versuch beim nächsten Lauf:`, error instanceof Error ? error.message : error);
    }
  }
  return counts;
}

const globalForPoller = globalThis as unknown as { geminiBatchPoller?: unknown; geminiBatchPolling?: boolean };

function pollIntervalMs(): number {
  const value = Number(process.env.GEMINI_BATCH_POLL_MS);
  return Number.isFinite(value) && value >= 10_000 ? value : 5 * 60_000;
}

/** Startet die regelmäßige Abfrage (Standard alle 5 Minuten) einmal je Prozess. Ohne Schlüssel oder ohne offene Aufträge tut sie nichts. */
export function startGeminiBatchPoller(): void {
  if (globalForPoller.geminiBatchPoller || !process.env.GEMINI_API_KEY) return;
  const run = async () => {
    if (globalForPoller.geminiBatchPolling) return;
    globalForPoller.geminiBatchPolling = true;
    try {
      await pollGeminiBatches();
    } catch (error) {
      console.error("Abfrage der Gemini-Batch-Aufträge fehlgeschlagen:", error);
    } finally {
      globalForPoller.geminiBatchPolling = false;
    }
  };
  setTimeout(() => void run(), 60_000);
  const timer: unknown = setInterval(() => void run(), pollIntervalMs());
  (timer as { unref?: () => void }).unref?.();
  globalForPoller.geminiBatchPoller = timer;
}
