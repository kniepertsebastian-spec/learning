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
}

export async function requestJson(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  onUsage?: (usage: AIUsage) => void,
): Promise<string> {
  const client = getGeminiClient();
  const maxAttempts = 2; // maxRetries = 1

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: model || "gemini-2.5-flash",
        contents: fullPrompt,
        config: {
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
        },
      });

      const usage = response.usageMetadata;
      const promptTokens = usage?.promptTokenCount ?? 0;
      const completionTokens = usage?.candidatesTokenCount ?? 0;
      console.log(
        `USAGE model=${model} promptTokens=${promptTokens} completionTokens=${completionTokens} totalTokens=${promptTokens + completionTokens}`,
      );
      onUsage?.({ model, promptTokens, completionTokens });

      if (!response.text) {
        throw new AIGenerationError("Gemini hat keine Textantwort zurückgegeben.");
      }
      return response.text;
    } catch (error) {
      if (error instanceof AIGenerationError) throw error;
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
): Promise<T> {
  let rawText = await requestJson(systemPrompt, userPrompt, model, onUsage);

  // War 2 (= 1 Korrekturversuch) - bei gemini-3.6-flash traten in Produktion
  // wiederholt ("Expected ',' or '}' after property value") JSON-Syntaxfehler
  // auf, die auch den einen Korrekturversuch nicht immer behoben (siehe
  // Git-Historie). 3 gibt der KI eine zweite Chance zur Selbstkorrektur.
  const maxAttempts = 3;
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
    );
  }

  throw new AIGenerationError("KI-Antwort konnte nicht verarbeitet werden.");
}
