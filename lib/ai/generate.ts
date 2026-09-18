import type { ZodType } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClaudeClient } from "@/lib/claude";

export class AIGenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIGenerationError";
  }
}

// Anthropic 429 (rate_limit_error) und >=500 (api_error/overloaded_error)
// sind transient - siehe error-codes.md des claude-api-Skills.
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 529]);
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_PROVIDER_RETRY_DELAY_MS = 120_000;

function positiveIntegerFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = Reflect.get(error, "status");
  return typeof value === "number" ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableAnthropicError(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorMessage(error);
  return (
    (status !== undefined && RETRYABLE_HTTP_STATUSES.has(status)) ||
    /ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(message)
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Liest den `retry-after`-Header (Sekunden) einer 429-Antwort aus - die
 * Anthropic-SDK-Fehlerklassen legen die Response-Headers als `.headers`
 * (Web-`Headers`-Objekt) auf den Error. Ohne das würde bei kurzzeitigem Rate
 * Limiting immer nur die eigene (ggf. zu kurze oder zu lange) exponentielle
 * Schätzung verwendet statt der vom Provider vorgegebenen Wartezeit (R0.1 in
 * roadmap.md).
 */
export function parseRetryAfterHeaderMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const headers = Reflect.get(error, "headers");
  if (!headers || typeof (headers as Headers).get !== "function") return undefined;

  const raw = (headers as Headers).get("retry-after");
  if (!raw) return undefined;
  const seconds = Number.parseFloat(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.min(seconds * 1_000, MAX_PROVIDER_RETRY_DELAY_MS);
}

/**
 * Extrahiert das erste vollständige, balancierte JSON-Objekt aus der Antwort.
 * Ein naives indexOf("{")-bis-lastIndexOf("}") bricht, sobald die KI nach dem
 * eigentlichen JSON noch irgendetwas anhängt (z. B. bei längerem,
 * inhaltsreicherem Output wie Lesson-Content) - dann landet zusätzlicher Text
 * in der "extrahierten" Zeichenkette und JSON.parse schlägt fehl. Zählt daher
 * die Klammerntiefe und ignoriert Klammern innerhalb von String-Literalen.
 */
function extractJson(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return text.slice(start);
}

/**
 * Verteidigungslinie gegen rohe Steuerzeichen (z. B. einen buchstäblichen
 * Zeilenumbruch statt \n) innerhalb eines String-Literals der KI-Antwort -
 * JSON.parse lehnt das mit "Bad control character in string literal" ab,
 * obwohl der Rest der Antwort valide ist. Läuft mit derselben
 * String-Zustandsverfolgung wie extractJson() und escaped jedes rohe
 * Steuerzeichen (< 0x20), das innerhalb eines String-Literals auftaucht.
 */
export function sanitizeJsonControlChars(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (inString && !escaped && code < 0x20) {
      switch (ch) {
        case "\n":
          result += "\\n";
          break;
        case "\r":
          result += "\\r";
          break;
        case "\t":
          result += "\\t";
          break;
        default:
          result += `\\u${code.toString(16).padStart(4, "0")}`;
      }
      continue;
    }
    result += ch;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    }
  }
  return result;
}

const DIFFICULTY_ALIASES: Record<string, "beginner" | "intermediate" | "advanced"> = {
  beginner: "beginner",
  basic: "beginner",
  easy: "beginner",
  simple: "beginner",
  entry: "beginner",
  foundational: "beginner",
  novice: "beginner",
  anfänger: "beginner",
  anfaenger: "beginner",
  leicht: "beginner",
  intermediate: "intermediate",
  medium: "intermediate",
  moderate: "intermediate",
  standard: "intermediate",
  mittel: "intermediate",
  advanced: "advanced",
  difficult: "advanced",
  expert: "advanced",
  hard: "advanced",
  complex: "advanced",
  schwierig: "advanced",
  schwer: "advanced",
  fortgeschritten: "advanced",
};

const QUESTION_TYPE_ALIASES: Record<
  string,
  "knowledge" | "comprehension" | "application" | "scenario" | "troubleshooting"
> = {
  knowledge: "knowledge",
  recall: "knowledge",
  fact: "knowledge",
  factual: "knowledge",
  definition: "knowledge",
  memorization: "knowledge",
  wissen: "knowledge",
  comprehension: "comprehension",
  understanding: "comprehension",
  conceptual: "comprehension",
  concept: "comprehension",
  verständnis: "comprehension",
  verstaendnis: "comprehension",
  application: "application",
  applied: "application",
  practical: "application",
  anwendung: "application",
  scenario: "scenario",
  "case-study": "scenario",
  case: "scenario",
  situational: "scenario",
  "real-world": "scenario",
  szenario: "scenario",
  troubleshooting: "troubleshooting",
  debugging: "troubleshooting",
  debug: "troubleshooting",
  diagnostic: "troubleshooting",
  diagnosis: "troubleshooting",
  "problem-solving": "troubleshooting",
  fehlersuche: "troubleshooting",
  fehlerbehebung: "troubleshooting",
};

/**
 * Verteidigungslinie gegen ein Enum-Feld, das trotz Structured-Output-Zwang
 * (`output_config.format`, siehe requestJson) ein Synonym (z. B. "medium")
 * oder einen unbekannten Wert statt des exakten vom Schema geforderten
 * Tokens enthält. Normalisiert bekannte Synonyme UND fällt bei einem
 * weiterhin unbekannten Wert auf einen sinnvollen Default zurück, damit diese
 * beiden Enum-Felder IMMER validieren - eine falsch eingeordnete
 * Schwierigkeit/Frageart im seltenen Fall eines unbekannten Werts kostet
 * deutlich weniger als der komplette Verlust ansonsten guter Lessons/Fragen
 * für ein Objective durch einen harten Abbruch.
 */
export function normalizeGeneratedAliases(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeGeneratedAliases);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (key === "difficulty" && typeof child === "string") {
        const normalized = child.trim().toLowerCase();
        return [key, DIFFICULTY_ALIASES[normalized] ?? "intermediate"];
      }
      if (key === "type" && typeof child === "string") {
        const normalized = child.trim().toLowerCase();
        return [key, QUESTION_TYPE_ALIASES[normalized] ?? "knowledge"];
      }
      return [key, normalizeGeneratedAliases(child)];
    }),
  );
}

export interface AIUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

async function requestJson(
  systemPrompt: string,
  userPrompt: string,
  outputFormat: Anthropic.JSONOutputFormat,
  model: string,
  onUsage?: (usage: AIUsage) => void,
): Promise<string> {
  const client = getClaudeClient();
  const maxAttempts = positiveIntegerFromEnv(
    process.env.ANTHROPIC_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
  );
  const retryBaseMs = positiveIntegerFromEnv(
    process.env.ANTHROPIC_RETRY_BASE_MS,
    DEFAULT_RETRY_BASE_MS,
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        // War 16000 - ein ungrounded Objective ("frei, keine freigegebene
        // Quelle") hat diese Grenze in der Praxis exakt getroffen und damit
        // die JSON-Antwort mitten im String abgeschnitten
        // (AIGenerationError "Unterminated string in JSON"). Anthropic-SDK
        // skaliert den Non-Streaming-Timeout automatisch mit max_tokens
        // (MODEL_NONSTREAMING_TOKENS betrifft nur bestimmte Opus-4-Modelle,
        // nicht Haiku/Sonnet) - eine höhere Grenze ist also unkritisch.
        max_tokens: 32000,
        system: systemPrompt,
        output_config: { format: outputFormat },
        messages: [{ role: "user", content: userPrompt }],
      });

      // R6 (roadmap.md): "Modell, Tokenverbrauch ... pro Job" - maschinell
      // parsbare Zeile (siehe USAGE_LINE_PATTERN in
      // lib/server/admin/content-generation.ts), die den kompletten
      // Prozessbaum überlebt: content:draft-curriculum/-lessons laufen als
      // Kindprozess, stdout ist der einzige Kanal zurück zum Job-Tracking.
      // Wird für JEDEN Antwortversuch geloggt, nicht nur bei Erfolg -
      // abgelehnte/verworfene Antworten wurden vom Anbieter trotzdem
      // abgerechnet. Anthropic liefert keine "total"-Summe wie Gemini, daher
      // hier selbst addiert.
      const usage = response.usage;
      const promptTokens = usage.input_tokens ?? 0;
      const completionTokens = usage.output_tokens ?? 0;
      console.log(
        `USAGE model=${model} promptTokens=${promptTokens} completionTokens=${completionTokens} totalTokens=${promptTokens + completionTokens}`,
      );
      // Zusätzlicher Hook für In-Prozess-Aufrufer ohne Kindprozess-stdout
      // (z.B. lib/server/course-generation/worker.ts) - die stdout-Zeile
      // oben bleibt unverändert die Quelle für runNpmScript()-basierte Jobs.
      onUsage?.({ model, promptTokens, completionTokens });

      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );
      if (!textBlock?.text) {
        throw new AIGenerationError("Claude hat keine Textantwort zurückgegeben.");
      }
      return textBlock.text;
    } catch (error) {
      if (error instanceof AIGenerationError) throw error;

      if (attempt === maxAttempts || !isRetryableAnthropicError(error)) {
        throw error;
      }

      const providerDelayMs =
        errorStatus(error) === 429 ? parseRetryAfterHeaderMs(error) : undefined;
      const exponentialDelay = Math.min(
        retryBaseMs * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS,
      );
      const baseDelayMs = providerDelayMs ?? exponentialDelay;
      const delayMs = Math.round(baseDelayMs * (1 + Math.random() * 0.25));
      console.warn(
        `Claude vorübergehend nicht verfügbar (${errorStatus(error) ?? "Netzwerkfehler"}). ` +
          `Neuer Versuch ${attempt + 1}/${maxAttempts} in ${Math.ceil(delayMs / 1_000)}s` +
          (providerDelayMs !== undefined ? " (vom Provider vorgegeben)" : "") +
          " ...",
      );
      await sleep(delayMs);
    }
  }

  throw new AIGenerationError("Claude-Anfrage konnte nicht verarbeitet werden.");
}

const JSON_ONLY_INSTRUCTION =
  "\n\nAntworte AUSSCHLIESSLICH mit validem JSON, ohne Markdown-Codeblöcke und ohne Erklärtext davor oder danach.";

/**
 * Fordert von Claude strukturiertes JSON an (`output_config.format`, per
 * Zod-Schema aus `@anthropic-ai/sdk/helpers/zod` gebaut, zwingt das Modell
 * bereits beim Dekodieren auf das Schema statt es nur im Prompt zu verlangen)
 * und validiert die Antwort zusätzlich selbst gegen dasselbe Zod-Schema. Bei
 * fehlerhafter Ausgabe (kein valides JSON oder Schema-Verstoß) wird einmal
 * eine Reparatur-Anfrage gestellt, bevor endgültig ein AIGenerationError
 * geworfen wird.
 */
export async function generateStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: ZodType<T>,
  model: string,
  onUsage?: (usage: AIUsage) => void,
): Promise<T> {
  const jsonSystemPrompt = `${systemPrompt}${JSON_ONLY_INSTRUCTION}`;
  const outputFormat = zodOutputFormat(schema);
  let rawText = await requestJson(jsonSystemPrompt, userPrompt, outputFormat, model, onUsage);

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(sanitizeJsonControlChars(extractJson(rawText)));
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new AIGenerationError("KI-Antwort konnte nicht als JSON geparst werden.", err);
      }
      rawText = await requestJson(
        jsonSystemPrompt,
        `Deine vorherige Antwort war kein valides JSON:\n${rawText}\n\nBitte antworte erneut ausschließlich mit validem JSON für folgende Anfrage:\n${userPrompt}`,
        outputFormat,
        model,
        onUsage,
      );
      continue;
    }

    const result = schema.safeParse(normalizeGeneratedAliases(parsed));
    if (result.success) return result.data;

    if (attempt === maxAttempts) {
      throw new AIGenerationError(
        `KI-Antwort entspricht nicht dem erwarteten Schema: ${result.error.message}`,
      );
    }
    rawText = await requestJson(
      jsonSystemPrompt,
      `Deine vorherige Antwort erfüllte das erwartete Schema nicht (${result.error.message}):\n${rawText}\n\nBitte korrigiere sie und antworte erneut ausschließlich mit validem JSON für folgende Anfrage:\n${userPrompt}`,
      outputFormat,
      model,
      onUsage,
    );
  }

  throw new AIGenerationError("KI-Antwort konnte nicht verarbeitet werden.");
}
