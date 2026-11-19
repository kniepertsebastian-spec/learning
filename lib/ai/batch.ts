import type { GoogleGenAI, InlinedRequest } from "@google/genai";
import { generationConfig, type GenerationOptions } from "./generate";

/**
 * Dünne Hülle um die Gemini Batch API (Gemini Developer API, Anfragen inline): viele Anfragen in einem Auftrag, Google
 * antwortet asynchron (Ziel: innerhalb von 24 Stunden) zum ermäßigten Preis. Die Hülle weiß nichts von Kursen: Wer einreicht,
 * merkt sich den Auftragsnamen (Tabelle gemini_batch_jobs, siehe lib/server/ai-batch) und fragt später ab.
 *
 * Die Anfragen entstehen mit denselben Einstellungen wie die Live-Aufrufe (`generationConfig`), damit beide Wege gleich antworten.
 * Aufgebaut nach den Typen des installierten SDK (@google/genai); gegen die echte API ist die Hülle noch nicht gelaufen.
 */

export interface BatchRequest {
  /** Eindeutig im Auftrag; kommt mit der Antwort zurück (Metadaten der Anfrage). */
  key: string;
  system: string;
  user: string;
  jsonSchema?: Record<string, unknown>;
}

export interface BatchResult {
  key: string;
  /** Antworttext; null, wenn die Anfrage fehlgeschlagen ist oder keine Antwort kam. */
  text: string | null;
  error: string | null;
  usage: { promptTokens: number; completionTokens: number; cachedTokens: number } | null;
}

export type BatchOutcome =
  | { state: "pending" }
  | { state: "failed"; message: string }
  | { state: "done"; results: BatchResult[] };

export type BatchClient = Pick<GoogleGenAI, "batches">;

/** Batch-Modus an? Nur mit GEMINI_BATCH=1 und einem Plattform-Schlüssel; sonst laufen alle Aufrufe wie bisher einzeln. */
export function isBatchEnabled(): boolean {
  return process.env.GEMINI_BATCH === "1" && Boolean(process.env.GEMINI_API_KEY);
}

/** Obergrenzen je Auftrag: Anfragen und Gesamtgröße der Texte (inline gilt bei Google ein Größenlimit je Auftrag, vorsichtig bemessen). */
export const MAX_REQUESTS_PER_BATCH = 200;
export const MAX_CHARS_PER_BATCH = 5_000_000;

/** Teilt Anfragen in Aufträge, die Anzahl und Größe einhalten. Eine einzelne zu große Anfrage bekommt einen eigenen Auftrag. */
export function splitIntoBatches(requests: BatchRequest[]): BatchRequest[][] {
  const batches: BatchRequest[][] = [];
  let current: BatchRequest[] = [];
  let chars = 0;
  for (const request of requests) {
    const size = request.system.length + request.user.length + (request.jsonSchema ? JSON.stringify(request.jsonSchema).length : 0);
    if (current.length > 0 && (current.length >= MAX_REQUESTS_PER_BATCH || chars + size > MAX_CHARS_PER_BATCH)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(request);
    chars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Reicht die Anfragen als einen Auftrag ein und gibt dessen Namen zurück („batches/…“). */
export async function submitBatch(client: BatchClient, model: string, requests: BatchRequest[], displayName: string, options: GenerationOptions = {}): Promise<string> {
  if (requests.length === 0) throw new Error("Ein Batch braucht mindestens eine Anfrage.");
  const keys = new Set(requests.map((r) => r.key));
  if (keys.size !== requests.length) throw new Error("Die Schlüssel der Anfragen eines Batches müssen eindeutig sein.");
  const src: InlinedRequest[] = requests.map((r) => ({
    contents: r.user,
    metadata: { key: r.key },
    config: generationConfig(r.system, model, r.jsonSchema, true, options),
  }));
  const job = await client.batches.create({ model, src, config: { displayName: displayName.slice(0, 120) } });
  if (!job.name) throw new Error("Gemini hat dem Batch keinen Namen zugewiesen.");
  return job.name;
}

interface ResponseLike {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
}

/** Antworttext aus den Teilen des ersten Kandidaten, ohne „Gedanken“. In Batch-Antworten fehlt der Komfort-Zugriff `.text`. */
export function responseText(response: ResponseLike | undefined): string | null {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  const text = parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
  return text.length > 0 ? text : null;
}

export function responseUsage(response: ResponseLike | undefined): BatchResult["usage"] {
  const usage = response?.usageMetadata;
  if (!usage) return null;
  return {
    promptTokens: usage.promptTokenCount ?? 0,
    // Denk-Token werden wie Ausgabe-Token abgerechnet (siehe requestJson).
    completionTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    cachedTokens: usage.cachedContentTokenCount ?? 0,
  };
}

const FAILED_STATES = new Set(["JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"]);

/**
 * Fragt einen Auftrag ab. `expectedKeys` sind die Schlüssel der eingereichten Anfragen in ihrer Reihenfolge: Antworten ohne
 * Schlüssel in den Metadaten werden nach Position zugeordnet, und was gar nicht beantwortet wurde, kommt als Fehler zurück.
 */
export async function pollBatch(client: BatchClient, name: string, expectedKeys: string[]): Promise<BatchOutcome> {
  const job = await client.batches.get({ name });
  const state = String(job.state ?? "");
  if (FAILED_STATES.has(state)) return { state: "failed", message: job.error?.message ? `${state}: ${job.error.message}` : state };
  if (state !== "JOB_STATE_SUCCEEDED") return { state: "pending" };

  const responses = job.dest?.inlinedResponses;
  if (!responses) {
    return { state: "failed", message: job.dest?.fileName ? "Die Antworten liegen in einer Datei (nicht unterstützt)." : "Der Batch enthält keine Antworten." };
  }
  const byKey = new Map<string, BatchResult>();
  responses.forEach((item, index) => {
    const key = item.metadata?.key ?? expectedKeys[index];
    if (!key) return;
    const text = item.error ? null : responseText(item.response as ResponseLike | undefined);
    byKey.set(key, {
      key,
      text,
      error: item.error?.message ?? (text === null ? "Keine Textantwort." : null),
      usage: responseUsage(item.response as ResponseLike | undefined),
    });
  });
  return {
    state: "done",
    results: expectedKeys.map((key) => byKey.get(key) ?? { key, text: null, error: "Keine Antwort im Batch.", usage: null }),
  };
}
