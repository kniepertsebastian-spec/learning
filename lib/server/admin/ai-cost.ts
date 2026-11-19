import { CURRICULUM_MODEL, LESSONS_MODEL, TAGGING_MODEL, TRANSLATION_MODEL } from "@/lib/gemini";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { aiCostEntries } from "@/lib/server/db/schema";

/**
 * KI-Kosten: Preise je Modell, Kostenschätzung aus Token und das globale Budget (GEMINI_BUDGET_USD). Die einzelnen Aufrufe
 * stehen im Kostenbuch (ai-ledger.ts); das Budget summiert es.
 */

/**
 * Eingebaute Preise je Million Token (USD) für bekannte Modelle, damit die Kosten auch ohne Einträge in der .env laufen.
 * gemini-3.8-flash: 0,75 / 3,75 (Standardpreis lt. Google-Auskunft, vom Betreiber im Oktober 2026 bestätigt; Einführungspreis,
 * soll ab 1.1.2027 steigen). Die Variablen in der .env haben immer Vorrang.
 * gemini-4-hydrogen: 1,50 / 7,50 (Denk-Token zählen als Ausgabe), aus dem impliziten Cache gelesene Eingabe 0,075 = 5 %
 * (Roadmap des Betreibers vom 19.11.2026, mit mehreren Preisübersichten abgeglichen; nach der ersten Rechnung prüfen).
 * Aus dem Kontext-Cache gelesene Eingabe-Token kosten sonst 10 % des Eingabepreises (gemini-3.8-flash: 0,075 statt
 * 0,75); GEMINI_CACHED_PROMPT_PRICE_FACTOR überschreibt den Faktor für alle Modelle.
 */
const BUILT_IN_PRICES: Record<string, { prompt: number; completion: number; cachedFactor?: number }> = {
  "gemini-3.8-flash": { prompt: 0.75, completion: 3.75 },
  "gemini-4-hydrogen": { prompt: 1.5, completion: 7.5, cachedFactor: 0.05 },
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
  } else if (model === TAGGING_MODEL) {
    // Greift nur, wenn das Tagging-Modell ein eigenes ist: sonst ist es das Lektionsmodell und der Zweig darüber hat gegriffen.
    prompt = num("GEMINI_TAGGING_PRICE_PER_MILLION_PROMPT_TOKENS_USD");
    completion = num("GEMINI_TAGGING_PRICE_PER_MILLION_COMPLETION_TOKENS_USD");
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
  return pricesFor(CURRICULUM_MODEL) !== null && pricesFor(LESSONS_MODEL) !== null && pricesFor(TAGGING_MODEL) !== null;
}

/**
 * Preis eines Batch-Aufrufs im Verhältnis zum normalen Preis. Google nennt etwa die Hälfte (Stand der Umsetzung nur aus
 * Suchtreffern, nicht gegen ai.google.dev geprüft): nach dem ersten echten Lauf gegen die Rechnung abgleichen und bei
 * Abweichung GEMINI_BATCH_PRICE_FACTOR setzen.
 */
export function batchPriceFactor(): number {
  const raw = process.env.GEMINI_BATCH_PRICE_FACTOR;
  const value = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.5;
}

function cachedPriceFactor(model: string): number {
  const fallback = BUILT_IN_PRICES[model]?.cachedFactor ?? 0.1;
  const raw = process.env.GEMINI_CACHED_PROMPT_PRICE_FACTOR;
  // Leer zählt als nicht gesetzt (docker-compose reicht die Variable leer durch); Number("") wäre 0 und machte Cache-Token gratis.
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

/**
 * `cachedTokens` ist der Teil der `promptTokens`, den Gemini aus dem Kontext-Cache gelesen hat. `batch`: Aufruf über die
 * Batch-API, der Gesamtbetrag wird mit `batchPriceFactor()` multipliziert.
 */
export function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  model: string,
  cachedTokens = 0,
  options: { batch?: boolean } = {},
): number | null {
  const prices = pricesFor(model);
  if (!prices) return null;
  const cached = Math.min(Math.max(cachedTokens, 0), promptTokens);
  const cost =
    ((promptTokens - cached) / 1_000_000) * prices.prompt +
    (cached / 1_000_000) * prices.prompt * cachedPriceFactor(model) +
    (completionTokens / 1_000_000) * prices.completion;
  return options.batch ? cost * batchPriceFactor() : cost;
}

export interface AiBudgetStatus {
  limitUsd: number;
  spentUsd: number;
  exceeded: boolean;
}

/**
 * Das Budget zählt alles, was die Plattform bisher für KI ausgegeben hat: das ganze Kostenbuch (alle Aufrufe aller Funktionen,
 * dazu die aus früheren Summenfeldern übernommenen Beträge), ohne Aufrufe mit dem eigenen Schlüssel einer Firma. Es gibt kein
 * Zeitfenster: Das Limit gilt für die Summe seit Beginn der Aufzeichnung, nicht je Monat. Aufrufe für Modelle ohne hinterlegten
 * Preis zählen als 0 (siehe isPricingConfigured).
 */
export async function getAiBudgetStatus(): Promise<AiBudgetStatus | null> {
  const limitUsd = Number(process.env.GEMINI_BUDGET_USD) || 0;
  if (limitUsd <= 0) return null;

  const [row] = await getDb()
    .select({ total: sql<string>`coalesce(sum(${aiCostEntries.costUsd}), 0)` })
    .from(aiCostEntries)
    .where(eq(aiCostEntries.byok, false));
  const spentUsd = Number(row?.total ?? 0);

  return { limitUsd, spentUsd, exceeded: spentUsd >= limitUsd };
}
