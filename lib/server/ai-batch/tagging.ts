import { and, eq, inArray, type InferSelectModel } from "drizzle-orm";
import { getGeminiClient, TAGGING_MODEL, thinkingLevelFor } from "@/lib/gemini";
import { parseStructuredText } from "@/lib/ai/generate";
import { splitIntoBatches, submitBatch, type BatchClient, type BatchResult } from "@/lib/ai/batch";
import { recordAiUsage, withAiCost } from "@/lib/server/admin/ai-ledger";
import { getDb } from "@/lib/server/db/client";
import { geminiBatchJobs } from "@/lib/server/db/schema";
import {
  buildTaggingPlan,
  createConceptTagger,
  objectivesToTag,
  savePlan,
  taggingPrompt,
  taggingResponseSchema,
  type ConceptTagger,
  type TaggingCounts,
  type TaggingInput,
  type TaggingResponse,
} from "@/lib/server/psrp/concepts";

/**
 * Konzept-Tagging über die Gemini Batch API: statt je Lernziel einen Aufruf nacheinander werden alle Lernziele eines Kurses
 * als ein Auftrag eingereicht (halber Preis, Antwort bis zu 24 Stunden später). Niemand wartet darauf, das Tagging läuft
 * ohnehin im Hintergrund nach der Veröffentlichung. Die Eingaben stehen in `gemini_batch_jobs.payload`; der Hintergrundlauf
 * (service.ts) holt die Antworten ab und ruft `applyTaggingJob`.
 *
 * Was nicht klappt (Antwort fehlt, ist kein gültiges JSON, verletzt das Schema), geht für das einzelne Lernziel wie bisher
 * über den Live-Aufruf; scheitert der ganze Auftrag, übernimmt der Live-Weg den Rest.
 */

export type TaggingBatchInput = TaggingInput & { objectiveId: string };
export type GeminiBatchJob = InferSelectModel<typeof geminiBatchJobs>;

interface TaggingPayload {
  inputs: TaggingBatchInput[];
}

const payloadOf = (job: Pick<GeminiBatchJob, "payload">): TaggingPayload => job.payload as unknown as TaggingPayload;

/** Die Schlüssel der Anfragen eines Tagging-Auftrags (Lernziel-IDs, in der Reihenfolge der Einreichung). */
export function taggingKeys(job: Pick<GeminiBatchJob, "payload">): string[] {
  return payloadOf(job).inputs.map((input) => input.objectiveId);
}

/**
 * Reicht alle noch ungetaggten Lernziele eines Kurses ein (bei sehr vielen als mehrere Aufträge). Gibt die Zahl der Aufträge
 * zurück (bei schon laufenden Aufträgen deren Zahl); 0 = nichts zu tun. Wirft, wenn Google die Einreichung ablehnt: der
 * Aufrufer fällt dann auf den Live-Weg zurück.
 */
export async function submitTaggingBatch(certificationId: string, client: BatchClient = getGeminiClient()): Promise<number> {
  // Lernziele, die schon in einem offenen Auftrag liegen, nicht noch einmal einreichen: sonst würde doppelt bezahlt.
  const open = await getDb()
    .select({ payload: geminiBatchJobs.payload })
    .from(geminiBatchJobs)
    .where(and(eq(geminiBatchJobs.certificationId, certificationId), eq(geminiBatchJobs.kind, "tagging"), inArray(geminiBatchJobs.status, ["submitted", "applying"])));
  const inFlight = new Set(open.flatMap((job) => taggingKeys(job)));
  const inputs = (await objectivesToTag(certificationId)).filter((input) => !inFlight.has(input.objectiveId));
  // Nichts Neues: gibt es offene Aufträge, zählen sie (der Aufrufer darf dann nicht zusätzlich einzeln taggen), sonst ist nichts zu tun.
  if (inputs.length === 0) return open.length;
  const byKey = new Map(inputs.map((input) => [input.objectiveId, input]));
  const requests = inputs.map((input) => {
    const prompt = taggingPrompt(input);
    return { key: input.objectiveId, system: prompt.system, user: prompt.user, jsonSchema: prompt.jsonSchema };
  });
  let jobs = 0;
  for (const group of splitIntoBatches(requests)) {
    const geminiName = await submitBatch(client, TAGGING_MODEL, group, `tagging-${certificationId.slice(0, 8)}`, { thinkingLevel: thinkingLevelFor("tagging") });
    await getDb()
      .insert(geminiBatchJobs)
      .values({
        kind: "tagging",
        certificationId,
        geminiName,
        model: TAGGING_MODEL,
        payload: { inputs: group.map((request) => byKey.get(request.key)!) } as unknown as Record<string, unknown>,
        requestCount: group.length,
      });
    jobs++;
  }
  return jobs;
}

/** Bucht den Verbrauch der Antworten zum Batch-Preis ins Kostenbuch (Schritt „tagging_batch“). */
async function recordBatchUsage(job: GeminiBatchJob, results: BatchResult[]): Promise<void> {
  await withAiCost({ source: "course_generation", detail: "tagging_batch", certificationId: job.certificationId }, async () => {
    for (const result of results) {
      if (result.usage) await recordAiUsage({ model: job.model, ...result.usage }, { batch: true });
    }
  });
}

/**
 * Verarbeitet die Antworten eines Tagging-Auftrags: bucht den Verbrauch, prüft jede Antwort wie im Live-Weg (Schema, dann
 * `buildTaggingPlan`) und speichert den Plan. Lernziele, die inzwischen anderweitig getaggt wurden, bleiben unangetastet,
 * sonst entstünden doppelte Abfragen. `tagger` ersetzt in Tests den Live-Rückfall.
 */
export async function applyTaggingJob(job: GeminiBatchJob, results: BatchResult[], tagger?: ConceptTagger): Promise<TaggingCounts> {
  await recordBatchUsage(job, results);
  const counts: TaggingCounts = { objectives: 0, concepts: 0, variants: 0, failed: 0 };
  const stillTodo = new Set((await objectivesToTag(job.certificationId)).map((input) => input.objectiveId));
  const byKey = new Map(results.map((result) => [result.key, result]));
  for (const input of payloadOf(job).inputs) {
    if (!stillTodo.has(input.objectiveId)) continue;
    try {
      let response: TaggingResponse | null = null;
      const text = byKey.get(input.objectiveId)?.text;
      if (text) {
        try {
          response = parseStructuredText(text, taggingResponseSchema);
        } catch {
          response = null; // Live-Rückfall unten
        }
      }
      response ??= await withAiCost({ source: "course_generation", detail: "tagging", certificationId: job.certificationId }, () =>
        (tagger ?? createConceptTagger())(input),
      );
      const plan = buildTaggingPlan(input, response);
      counts.variants += await savePlan(job.certificationId, input.topicArea, plan);
      counts.concepts += plan.concepts.length;
      counts.objectives++;
    } catch (error) {
      counts.failed++;
      console.error(`Konzept-Tagging (Batch) für Lernziel ${input.objectiveId} fehlgeschlagen:`, error);
    }
  }
  return counts;
}
