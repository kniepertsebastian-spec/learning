import { CURRICULUM_MODEL, LESSONS_MODEL, TRANSLATION_MODEL } from "@/lib/gemini";
import { getDb } from "@/lib/server/db/client";
import { contentGenerationJobs } from "@/lib/server/db/schema";

/**
 * KI-Kosten: Preise je Modell, Kostenschätzung aus Token und das globale Budget (GEMINI_BUDGET_USD). Früher stand das in
 * content-generation.ts neben der Skript-Generierung (Kindprozess `npm run content:draft-*`); die gibt es nicht mehr,
 * Preise und Budget werden aber von der Kursgenerierung, der Werkstatt und den Übersetzungen weiter gebraucht.
 */

/**
 * Eingebaute Preise je Million Token (USD) für bekannte Modelle, damit die Kosten auch ohne Einträge in der .env laufen.
 * gemini-3.8-flash: 0,75 / 3,75 (Standardpreis lt. Google-Auskunft, vom Betreiber im Oktober 2026 bestätigt; Einführungspreis,
 * soll ab 1.1.2027 steigen). Die Variablen in der .env haben immer Vorrang.
 * Aus dem Kontext-Cache gelesene Eingabe-Token kosten bei Gemini 10 % des Eingabepreises (gemini-3.8-flash: 0,075 statt
 * 0,75); überschreibbar mit GEMINI_CACHED_PROMPT_PRICE_FACTOR.
 */
const BUILT_IN_PRICES: Record<string, { prompt: number; completion: number }> = {
  "gemini-3.8-flash": { prompt: 0.75, completion: 3.75 },
};

/**
 * Preise je Million Token (USD). Zuerst die modellspezifischen Variablen (Lernplan- bzw. Lektionsmodell), sonst die
 * allgemeinen `GEMINI_PRICE_PER_MILLION_*`, die für jedes Gemini-Modell gelten (der übliche Fall: ein Modell für alles).
 * Danach die eingebauten Preise bekannter Modelle; für alles andere gibt es bewusst keine Zahl (null) statt einer erfundenen.
 */
function pricesFor(model: string): { prompt: number; completion: number } | null {
  const num = (key: string) => Number(process.env[key]) || 0;
  let prompt = 0;
  let completion = 0;
  if (model === CURRICULUM_MODEL) {
    prompt = num("GEMINI_CURRICULUM_PRICE_PER_MILLION_PROMPT_TOKENS_USD");
    completion = num("GEMINI_CURRICULUM_PRICE_PER_MILLION_COMPLETION_TOKENS_USD");
  } else if (model === LESSONS_MODEL) {
    prompt = num("GEMINI_LESSONS_PRICE_PER_MILLION_PROMPT_TOKENS_USD");
    completion = num("GEMINI_LESSONS_PRICE_PER_MILLION_COMPLETION_TOKENS_USD");
  } else if (model === TRANSLATION_MODEL) {
    prompt = num("GEMINI_TRANSLATION_PRICE_PER_MILLION_PROMPT_TOKENS_USD");
    completion = num("GEMINI_TRANSLATION_PRICE_PER_MILLION_COMPLETION_TOKENS_USD");
  }
  if (prompt === 0 && completion === 0 && model.startsWith("gemini-")) {
    prompt = num("GEMINI_PRICE_PER_MILLION_PROMPT_TOKENS_USD");
    completion = num("GEMINI_PRICE_PER_MILLION_COMPLETION_TOKENS_USD");
  }
  if (prompt === 0 && completion === 0) return BUILT_IN_PRICES[model] ?? null;
  return { prompt, completion };
}

/** Sind für die verwendeten Modelle Preise hinterlegt? Sonst bleiben Kosten und Kostenlimit wirkungslos (Anzeige „nicht berechnet“). */
export function isPricingConfigured(): boolean {
  return pricesFor(CURRICULUM_MODEL) !== null && pricesFor(LESSONS_MODEL) !== null;
}

function cachedPriceFactor(): number {
  const value = Number(process.env.GEMINI_CACHED_PROMPT_PRICE_FACTOR);
  return Number.isFinite(value) && value >= 0 && value <= 1 && process.env.GEMINI_CACHED_PROMPT_PRICE_FACTOR !== undefined ? value : 0.1;
}

/** `cachedTokens` ist der Teil der `promptTokens`, den Gemini aus dem Kontext-Cache gelesen hat. */
export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  model: string,
  cachedTokens = 0,
): number | null {
  const prices = pricesFor(model);
  if (!prices) return null;
  const cached = Math.min(Math.max(cachedTokens, 0), promptTokens);
  return (
    ((promptTokens - cached) / 1_000_000) * prices.prompt +
    (cached / 1_000_000) * prices.prompt * cachedPriceFactor() +
    (completionTokens / 1_000_000) * prices.completion
  );
}

export interface AiBudgetStatus {
  limitUsd: number;
  spentUsd: number;
  exceeded: boolean;
}

/**
 * Das Budget zählt die Kosten aus `content_generation_jobs`, also die der früheren Skript-Generierung. Die Tabelle bleibt
 * als Historie bestehen, neue Zeilen kommen nicht mehr dazu: Die Summe ist seit dem Abbau konstant. Die Kosten der Kursgenerierung
 * (course_generation_jobs), der Werkstatt-Läufe und der Übersetzung fließen hier nicht ein, das war schon vorher so.
 */
export async function getAiBudgetStatus(): Promise<AiBudgetStatus | null> {
  const limitUsd = Number(process.env.GEMINI_BUDGET_USD) || 0;
  if (limitUsd <= 0) return null;

  const rows = await getDb()
    .select({ estimatedCostUsd: contentGenerationJobs.estimatedCostUsd })
    .from(contentGenerationJobs);
  const spentUsd = rows.reduce((sum, row) => sum + Number(row.estimatedCostUsd ?? 0), 0);

  return { limitUsd, spentUsd, exceeded: spentUsd >= limitUsd };
}
