import { z, type ZodType } from "zod";
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

const MAX_PROVIDER_RETRY_DELAY_MS = 120_000;

/**
 * Extrahiert Googles RetryInfo (google.rpc.RetryInfo, z. B. `{"retryDelay":
 * "21s"}` innerhalb von `error.details[]`) aus einer Gemini-429-Antwort. Das
 * @google/genai-SDK gibt keine strukturierten Details her - `ApiError.message`
 * ist der per JSON.stringify() serialisierte komplette Fehler-Body (siehe
 * node_modules/@google/genai .../throwErrorIfNotOK), daher wird hier erneut
 * geparst. Ohne das würde bei kurzzeitigem Rate Limiting immer nur die eigene
 * (ggf. zu kurze oder zu lange) exponentielle Schätzung verwendet statt der
 * vom Provider vorgegebenen Wartezeit (R0.1 in roadmap.md).
 */
export function parseProviderRetryDelayMs(error: unknown): number | undefined {
  const message = errorMessage(error);
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;

  const details = Reflect.get(Reflect.get(parsed, "error") ?? {}, "details");
  if (!Array.isArray(details)) return undefined;

  for (const detail of details) {
    if (!detail || typeof detail !== "object") continue;
    const retryDelay = Reflect.get(detail, "retryDelay");
    if (typeof retryDelay !== "string") continue;

    const match = /^(\d+(?:\.\d+)?)s$/.exec(retryDelay.trim());
    if (!match) continue;
    const seconds = Number.parseFloat(match[1]);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, MAX_PROVIDER_RETRY_DELAY_MS);
    }
  }
  return undefined;
}

const GEMINI_JSON_SCHEMA_KEYS = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

function sanitizeGeminiJsonSchema(
  value: unknown,
  isPropertyMap = false,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeGeminiJsonSchema(item));
  }
  if (!value || typeof value !== "object") return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isPropertyMap && !GEMINI_JSON_SCHEMA_KEYS.has(key)) continue;
    sanitized[key] = sanitizeGeminiJsonSchema(
      child,
      key === "properties" || key === "$defs",
    );
  }
  return sanitized;
}

function toGeminiJsonSchema<T>(schema: ZodType<T>): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, {
    target: "draft-07",
    unrepresentable: "any",
  });

  // Zod emits full Draft-07 (for example `minLength`), while Gemini accepts
  // only the subset documented by @google/genai. Unsupported keywords make
  // the entire request fail with an otherwise opaque 400 INVALID_ARGUMENT.
  return sanitizeGeminiJsonSchema(jsonSchema) as Record<string, unknown>;
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

const DIFFICULTY_ALIASES: Record<string, "beginner" | "intermediate" | "advanced"> = {
  beginner: "beginner",
  basic: "beginner",
  easy: "beginner",
  entry: "beginner",
  foundational: "beginner",
  novice: "beginner",
  anfänger: "beginner",
  anfaenger: "beginner",
  intermediate: "intermediate",
  medium: "intermediate",
  moderate: "intermediate",
  mittel: "intermediate",
  advanced: "advanced",
  difficult: "advanced",
  expert: "advanced",
  hard: "advanced",
  schwierig: "advanced",
};

/**
 * Gemini occasionally ignores an enum when structured output is unavailable
 * and returns a common synonym such as `medium`. Normalize only known,
 * semantically equivalent aliases; unknown values still fail Zod validation.
 */
function normalizeGeneratedAliases(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeGeneratedAliases);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (key === "difficulty" && typeof child === "string") {
        const normalized = child.trim().toLowerCase();
        return [key, DIFFICULTY_ALIASES[normalized] ?? child];
      }
      return [key, normalizeGeneratedAliases(child)];
    }),
  );
}

async function requestJson(
  systemPrompt: string,
  userPrompt: string,
  responseJsonSchema: Record<string, unknown>,
): Promise<string> {
  const client = getGeminiClient();
  const maxAttempts = positiveIntegerFromEnv(
    process.env.GEMINI_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
  );
  const retryBaseMs = positiveIntegerFromEnv(
    process.env.GEMINI_RETRY_BASE_MS,
    DEFAULT_RETRY_BASE_MS,
  );
  let schemaEnabled = true;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          ...(schemaEnabled ? { responseJsonSchema } : {}),
          maxOutputTokens: 16000,
        },
      });

      const text = response.text;
      if (!text) {
        throw new AIGenerationError("Gemini hat keine Textantwort zurückgegeben.");
      }
      return text;
    } catch (error) {
      if (
        schemaEnabled &&
        errorStatus(error) === 400 &&
        /invalid argument/i.test(errorMessage(error))
      ) {
        // Older/limited Gemini models may reject structured-output schemas.
        // Fall back to the explicit JSON prompt + normal Zod validation rather
        // than making the entire offline content-generation job unusable.
        schemaEnabled = false;
        console.warn(
          "Gemini hat das strukturierte Ausgabeschema abgelehnt; erneuter Versuch mit Prompt-Validierung ...",
        );
        continue;
      }

      if (attempt === maxAttempts || !isRetryableGeminiError(error)) {
        throw error;
      }

      const providerDelayMs =
        errorStatus(error) === 429 ? parseProviderRetryDelayMs(error) : undefined;
      const exponentialDelay = Math.min(
        retryBaseMs * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS,
      );
      const baseDelayMs = providerDelayMs ?? exponentialDelay;
      const delayMs = Math.round(baseDelayMs * (1 + Math.random() * 0.25));
      console.warn(
        `Gemini vorübergehend nicht verfügbar (${errorStatus(error) ?? "Netzwerkfehler"}). ` +
          `Neuer Versuch ${attempt + 1}/${maxAttempts} in ${Math.ceil(delayMs / 1_000)}s` +
          (providerDelayMs !== undefined ? " (vom Provider vorgegeben)" : "") +
          " ...",
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
  const responseJsonSchema = toGeminiJsonSchema(schema);
  let rawText = await requestJson(jsonSystemPrompt, userPrompt, responseJsonSchema);

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
        responseJsonSchema,
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
      responseJsonSchema,
    );
  }

  throw new AIGenerationError("KI-Antwort konnte nicht verarbeitet werden.");
}
