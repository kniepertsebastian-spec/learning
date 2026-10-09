import { z, type ZodType } from "zod";
import { GoogleGenAI } from "@google/genai";
import { getGeminiClient } from "@/lib/claude";

export class AIGenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIGenerationError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isStructuredOutputParseFailure(error: unknown): boolean {
  return error instanceof Error && /Failed to parse structured output|JSON/i.test(error.message);
}

export function isRetryableError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|429|500|503|RESOURCE_EXHAUSTED/i.test(message) ||
    isStructuredOutputParseFailure(error)
  );
}

export const isRetryableAnthropicError = isRetryableError;

/** JSON-Schema-Schlüsselwörter, die Gemini als Antwortschema versteht. Alles andere (minLength, format, pattern, $schema …) entfällt: Zod prüft es danach ohnehin. */
const GEMINI_SCHEMA_KEYS = new Set(["type", "properties", "required", "items", "enum", "minItems", "maxItems", "minimum", "maximum", "anyOf", "description"]);

function sanitizeForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeForGemini);
  if (!node || typeof node !== "object") return node;
  const source = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "const") {
      out.enum = [value];
    } else if (key === "properties" && value && typeof value === "object") {
      // Eigenschaftsnamen sind frei wählbar und dürfen nicht gefiltert werden, nur ihre Werte.
      out.properties = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, sanitizeForGemini(child)]));
    } else if (GEMINI_SCHEMA_KEYS.has(key)) {
      out[key] = sanitizeForGemini(value);
    }
  }
  return out;
}

/**
 * Antwortschema für Gemini aus dem Zod-Schema. Gemini erzwingt es beim Erzeugen (strukturierte Ausgabe): Felder fehlen
 * nicht mehr, Typen und Anzahlen stimmen, das JSON ist vollständig. Das war die Hauptursache für „Antwortformat-Fehler“.
 * Was sich nicht abbilden lässt (z. B. „genau eine Option ist richtig“), prüft Zod weiterhin danach. `undefined`,
 * wenn sich das Schema nicht umwandeln lässt: dann läuft der Aufruf wie früher ohne Schema.
 */
export function toGeminiJsonSchema(schema: ZodType): Record<string, unknown> | undefined {
  try {
    const raw = z.toJSONSchema(schema, { io: "input", unrepresentable: "any", target: "draft-7" });
    const cleaned = sanitizeForGemini(raw);
    return cleaned && typeof cleaned === "object" ? (cleaned as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Schemas (nach Fingerabdruck), die Gemini abgelehnt hat (zu komplex o. ä.): für sie läuft die Anfrage ohne Schema weiter. */
const rejectedSchemas = new Set<string>();
const schemaKey = (schema: Record<string, unknown>) => JSON.stringify(schema);

/**
 * Lehnt Gemini die Anfrage mit dem Antwortschema ab (HTTP 400 INVALID_ARGUMENT)? Jede solche Ablehnung außer einem falschen
 * Schlüssel zählt: die Fehlertexte dazu wechseln mit der Modellversion, ein Wiederholen ohne Schema schadet nie.
 */
export function isSchemaRejection(error: unknown): boolean {
  const message = errorMessage(error);
  return /INVALID_ARGUMENT|"code":\s*400|\b400\b/i.test(message) && !/API key|API_KEY|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message);
}

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

export const lenientDifficultySchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return DIFFICULTY_ALIASES[value.trim().toLowerCase()] ?? "intermediate";
}, z.enum(["beginner", "intermediate", "advanced"]));

export const lenientQuestionTypeSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return QUESTION_TYPE_ALIASES[value.trim().toLowerCase()] ?? "knowledge";
}, z.enum(["knowledge", "comprehension", "application", "scenario", "troubleshooting"]));

export interface AIUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Davon aus dem (impliziten) Kontext-Cache gelesen: kostet nur einen Bruchteil des normalen Eingabepreises. */
  cachedTokens?: number;
}

export async function requestJson(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  onUsage?: (usage: AIUsage) => void,
  /** Client mit eigenem Schlüssel (BYOK einer Firma). Ohne Angabe gilt der Client der Plattform. */
  clientOverride?: GoogleGenAI,
  /** Antwortschema (siehe toGeminiJsonSchema): Gemini hält sich beim Erzeugen daran. */
  jsonSchema?: Record<string, unknown>,
): Promise<string> {
  const client = clientOverride ?? getGeminiClient();
  const maxAttempts = 2; // maxRetries = 1

  let useSchema = Boolean(jsonSchema) && !rejectedSchemas.has(schemaKey(jsonSchema!));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: model || "gemini-3.8-flash",
        // Systemprompt als systemInstruction statt vorn an den Text geklebt: er steht so immer am Anfang der Anfrage,
        // und Geminis implizites Caching kann den gleichbleibenden Anfang (Systemprompt, ggf. gemeinsame Quelle)
        // über alle Lernziele eines Kurses zum Cache-Preis abrechnen.
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
          // gemini-2.5-flash erlaubt laut Google-Doku max. 65536 Output-Tokens
          // pro Antwort - das ist das tatsächliche Modell-Limit, keine
          // willkürliche Schätzung. Bei Claude hat eine zu knappe Grenze
          // (16000) nachweislich zu mitten im JSON abgeschnittenen Antworten
          // geführt (siehe Git-Historie); da Gemini 2.5 Flash pro Mio. Token
          // günstig ist, lohnt sich hier kein Sparen am Limit - volles
          // Modell-Maximum ausschöpfen, um dasselbe Trunkierungsproblem
          // sicher zu vermeiden.
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          ...(useSchema ? { responseJsonSchema: jsonSchema } : {}),
        },
      });

      const usage = response.usageMetadata;
      const promptTokens = usage?.promptTokenCount ?? 0;
      // Denk-Token werden wie Ausgabe-Token abgerechnet und stehen nicht in candidatesTokenCount.
      const completionTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
      const cachedTokens = usage?.cachedContentTokenCount ?? 0;
      console.log(
        `USAGE model=${model} promptTokens=${promptTokens} completionTokens=${completionTokens} totalTokens=${promptTokens + completionTokens} cachedTokens=${cachedTokens}`,
      );
      onUsage?.({ model, promptTokens, completionTokens, cachedTokens });

      if (!response.text) {
        throw new AIGenerationError("Gemini hat keine Textantwort zurückgegeben.");
      }
      return response.text;
    } catch (error) {
      if (error instanceof AIGenerationError) throw error;
      if (useSchema && isSchemaRejection(error)) {
        // Gemini nimmt dieses Schema nicht an: einmal ohne Schema weitermachen (wie früher) und es nicht erneut versuchen.
        console.warn("Gemini hat das Antwortschema abgelehnt, weiter ohne Schema:", errorMessage(error).slice(0, 300));
        rejectedSchemas.add(schemaKey(jsonSchema!));
        useSchema = false;
        attempt--;
        continue;
      }
      if (attempt === maxAttempts || !isRetryableError(error)) {
        throw error;
      }
    }
  }

  throw new AIGenerationError("Gemini-Anfrage konnte nicht verarbeitet werden.");
}

export async function generateStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: ZodType<T>,
  model: string,
  onUsage?: (usage: AIUsage) => void,
  clientOverride?: GoogleGenAI,
): Promise<T> {
  const jsonSchema = toGeminiJsonSchema(schema);
  let rawText = await requestJson(systemPrompt, userPrompt, model, onUsage, clientOverride, jsonSchema);

  // Seit Gemini das Antwortschema beim Erzeugen erzwingt (responseJsonSchema), sind JSON-Syntaxfehler selten. Ein
  // Korrekturversuch reicht; jeder weitere schickt die komplette alte Antwort samt Anfrage erneut (teuer). Inhaltliche
  // Fehler repariert der Aufrufer ohnehin gezielter (siehe course-generation/worker.ts).
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
        systemPrompt,
        `Deine vorherige Antwort war kein valides JSON:\n${rawText}\n\nHäufigste Ursache: ein nicht escapetes Anführungszeichen (") innerhalb eines String-Werts. Bitte antworte erneut ausschließlich mit validem JSON (alle " innerhalb von Strings als \\" escapen) für folgende Anfrage:\n${userPrompt}`,
        model,
        onUsage,
        clientOverride,
        jsonSchema,
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
      systemPrompt,
      `Deine vorherige Antwort erfüllte das erwartete Schema nicht (${result.error.message}):\n${rawText}\n\nBitte korrigiere sie und antworte erneut ausschließlich mit validem JSON für folgende Anfrage:\n${userPrompt}`,
      model,
      onUsage,
      clientOverride,
      jsonSchema,
    );
  }

  throw new AIGenerationError("KI-Antwort konnte nicht verarbeitet werden.");
}
