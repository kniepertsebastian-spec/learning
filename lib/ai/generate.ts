import type { ZodType } from "zod";
import { GEMINI_MODEL, getGeminiClient } from "@/lib/gemini";

export class AIGenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIGenerationError";
  }
}

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

function positiveIntegerFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  for (const key of ["status", "code"] as const) {
    const value = Reflect.get(error, key);
    if (typeof value === "number") return value;
  }

  const nested = Reflect.get(error, "error");
  if (nested && typeof nested === "object") {
    const value = Reflect.get(nested, "code");
    if (typeof value === "number") return value;
  }

  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableGeminiError(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorMessage(error);

  // A daily free-tier quota cannot recover within this process. Preserve the
  // existing fail-fast behavior so the idempotent content script can resume
  // on a later day instead of sleeping and issuing guaranteed-to-fail calls.
  if (status === 429 && /requests?perday|perdayperproject|daily quota/i.test(message)) {
    return false;
  }

  return (
    (status !== undefined && RETRYABLE_HTTP_STATUSES.has(status)) ||
    /ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(message)
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

async function requestJson(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getGeminiClient();
  const maxAttempts = positiveIntegerFromEnv(
    process.env.GEMINI_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
  );
  const retryBaseMs = positiveIntegerFromEnv(
    process.env.GEMINI_RETRY_BASE_MS,
    DEFAULT_RETRY_BASE_MS,
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          maxOutputTokens: 16000,
        },
      });

      const text = response.text;
      if (!text) {
        throw new AIGenerationError("Gemini hat keine Textantwort zurückgegeben.");
      }
      return text;
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableGeminiError(error)) {
        throw error;
      }

      const exponentialDelay = Math.min(
        retryBaseMs * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS,
      );
      const delayMs = Math.round(exponentialDelay * (1 + Math.random() * 0.25));
      console.warn(
        `Gemini vorübergehend nicht verfügbar (${errorStatus(error) ?? "Netzwerkfehler"}). ` +
          `Neuer Versuch ${attempt + 1}/${maxAttempts} in ${Math.ceil(delayMs / 1_000)}s ...`,
      );
      await sleep(delayMs);
    }
  }

  throw new AIGenerationError("Gemini-Anfrage konnte nicht verarbeitet werden.");
}

const JSON_ONLY_INSTRUCTION =
  "\n\nAntworte AUSSCHLIESSLICH mit validem JSON, ohne Markdown-Codeblöcke und ohne Erklärtext davor oder danach.";

/**
 * Fordert von Gemini striktes JSON an und validiert es gegen ein Zod-Schema.
 * Bei fehlerhafter Ausgabe (kein valides JSON oder Schema-Verstoß) wird einmal
 * eine Reparatur-Anfrage gestellt, bevor endgültig ein AIGenerationError geworfen wird.
 */
export async function generateStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: ZodType<T>,
): Promise<T> {
  const jsonSystemPrompt = `${systemPrompt}${JSON_ONLY_INSTRUCTION}`;
  let rawText = await requestJson(jsonSystemPrompt, userPrompt);

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new AIGenerationError("KI-Antwort konnte nicht als JSON geparst werden.", err);
      }
      rawText = await requestJson(
        jsonSystemPrompt,
        `Deine vorherige Antwort war kein valides JSON:\n${rawText}\n\nBitte antworte erneut ausschließlich mit validem JSON für folgende Anfrage:\n${userPrompt}`,
      );
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;

    if (attempt === maxAttempts) {
      throw new AIGenerationError(
        `KI-Antwort entspricht nicht dem erwarteten Schema: ${result.error.message}`,
      );
    }
    rawText = await requestJson(
      jsonSystemPrompt,
      `Deine vorherige Antwort erfüllte das erwartete Schema nicht (${result.error.message}):\n${rawText}\n\nBitte korrigiere sie und antworte erneut ausschließlich mit validem JSON für folgende Anfrage:\n${userPrompt}`,
    );
  }

  throw new AIGenerationError("KI-Antwort konnte nicht verarbeitet werden.");
}
