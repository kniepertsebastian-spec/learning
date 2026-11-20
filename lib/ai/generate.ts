import { z, type ZodType } from "zod";
import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import { DEFAULT_GEMINI_MODEL, getGeminiClient, usesThinkingLevels, type ThinkingLevelName } from "@/lib/gemini";
import { recordAiUsage } from "@/lib/server/admin/ai-ledger";

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

/**
 * Gemini hat die Antwort blockiert (Sicherheitsfilter, Zitat-Schutz, Sperrliste …). Dieselbe Anfrage wird fast immer
 * wieder blockiert: kein bezahlter neuer Versuch, keine Reparatur.
 */
export class AIResponseBlockedError extends AIGenerationError {
  constructor(readonly reason: string) {
    super(
      `Gemini hat die Antwort blockiert (${reason}). Ein neuer Versuch mit derselben Anfrage wird meist wieder blockiert: Quelltext und Lernziel prüfen.`,
    );
    this.name = "AIResponseBlockedError";
  }
}

/**
 * Die Antwort hat das Ausgabe-Limit erreicht und ist abgeschnitten (`MAX_TOKENS`). Ein Reparaturversuch schickt die halbe
 * Antwort samt Anfrage erneut und wird wieder zu lang: kein neuer Versuch, das Lernziel muss kleiner werden.
 */
export class AIResponseTruncatedError extends AIGenerationError {
  constructor() {
    super("Gemini-Antwort hat das Ausgabe-Limit erreicht und wurde abgeschnitten (MAX_TOKENS). Lernziel kleiner schneiden oder weniger Fragen anfordern.");
    this.name = "AIResponseTruncatedError";
  }
}

/** Fehler, bei denen ein neuer Versuch mit derselben Anfrage nichts bringt, aber bezahlt wird. */
export function isPermanentAiResponseError(error: unknown): boolean {
  return error instanceof AIResponseBlockedError || error instanceof AIResponseTruncatedError;
}

/** finishReason-Werte, bei denen Gemini die Ausgabe aus inhaltlichen Gründen gestoppt hat. */
const BLOCKING_FINISH_REASONS = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT"]);

interface ResponseMeta {
  candidates?: Array<{ finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

/** `finishReason` des ersten Kandidaten bzw. `BLOCKED:<Grund>`, wenn schon die Anfrage blockiert wurde. */
export function finishReasonOf(response: ResponseMeta | undefined): string {
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) return `BLOCKED:${blockReason}`;
  return response?.candidates?.[0]?.finishReason ?? "UNKNOWN";
}

/** Wirft für abgeschnittene oder blockierte Antworten den passenden Fehler; alles andere geht normal weiter. */
export function assertUsableFinish(finishReason: string): void {
  if (finishReason === "MAX_TOKENS") throw new AIResponseTruncatedError();
  if (finishReason.startsWith("BLOCKED:")) throw new AIResponseBlockedError(finishReason.slice("BLOCKED:".length));
  if (BLOCKING_FINISH_REASONS.has(finishReason)) throw new AIResponseBlockedError(finishReason);
}

export function isStructuredOutputParseFailure(error: unknown): boolean {
  return error instanceof Error && /Failed to parse structured output|JSON/i.test(error.message);
}

export function isRetryableError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|429|500|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|TimeoutError|timed? ?out|aborted/i.test(message) ||
    (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) ||
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

/**
 * Abgeschwächte Einstellungen je Modell, nachdem Gemini eine Anfrage allgemein abgelehnt hat (HTTP 400 ohne Hinweis aufs
 * Schema). Stufe `no_thinking`: ohne Denk-Einstellung, das Ausgabe-Limit bleibt. Stufe `no_limits`: zusätzlich ohne
 * Ausgabe-Limit (es gilt die Vorgabe des Modells). Gemerkt nur für CONFIG_FALLBACK_TTL_MS: Ein einzelner Fehler, der mit den
 * Limits nichts zu tun hat, nimmt späteren Aufrufen so nicht dauerhaft die Obergrenze.
 */
export type ConfigFallbackLevel = "no_thinking" | "no_limits";
interface ConfigFallback {
  level: ConfigFallbackLevel;
  until: number;
  reason: string;
}
const configFallbacks = new Map<string, ConfigFallback>();
const CONFIG_FALLBACK_TTL_MS = 60 * 60 * 1000;

/** Aktuell abgeschwächte Einstellung eines Modells (oder null). Für den Hinweis im Auftrag der Kursgenerierung. */
export function activeConfigFallback(model: string): { level: ConfigFallbackLevel; reason: string } | null {
  const key = model || DEFAULT_GEMINI_MODEL;
  const entry = configFallbacks.get(key);
  if (!entry) return null;
  if (entry.until <= Date.now()) {
    configFallbacks.delete(key);
    return null;
  }
  return { level: entry.level, reason: entry.reason };
}

/** Lesbarer Hinweis für Auftrag und Admin-Ansicht, wenn ein Modell mit abgeschwächten Einstellungen läuft. */
export function configFallbackNote(model: string): string | null {
  const fallback = activeConfigFallback(model);
  if (!fallback) return null;
  return fallback.level === "no_thinking"
    ? `${model || DEFAULT_GEMINI_MODEL} lief ohne Denk-Einstellung, weil Gemini sie abgelehnt hat.`
    : `${model || DEFAULT_GEMINI_MODEL} lief ohne Denk-Einstellung und ohne Ausgabe-Limit, weil Gemini beides abgelehnt hat.`;
}

/** Hinweise für alle Modelle, die gerade mit abgeschwächten Einstellungen laufen (leer im Normalfall). */
export function configFallbackNotes(): string[] {
  return [...configFallbacks.keys()].map((model) => configFallbackNote(model)).filter((note): note is string => note !== null);
}

/** Nur für Tests: gemerkte Ablehnungen vergessen. */
export function resetGeminiFallbacksForTests(): void {
  configFallbacks.clear();
  rejectedSchemas.clear();
}

function setConfigFallback(model: string, level: ConfigFallbackLevel, reason: string): void {
  // Eine parallele Anfrage hat schon eine strengere Stufe gesetzt: die bleibt.
  if (level === "no_thinking" && activeConfigFallback(model)?.level === "no_limits") return;
  configFallbacks.set(model, { level, reason, until: Date.now() + CONFIG_FALLBACK_TTL_MS });
}

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

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}
/**
 * Zeitlimit je Gemini-Anfrage (Standard 10 Minuten). Früher 3 Minuten: Ein Lernziel mit großem Quellenpaket (~140k
 * Eingabe-Token) und Gemini 4 mit Denkstufe `high` braucht nachweislich länger; alle vier Versuche liefen dann ins
 * Zeitlimit und der Kurslauf scheiterte mit „This operation was aborted“ (CEH v13, Canary). Das Limit soll nur hängende
 * Verbindungen beenden, nicht langsame, aber gültige Antworten.
 */
function requestTimeoutMs(): number {
  return envNumber("GEMINI_REQUEST_TIMEOUT_MS", 600_000);
}
/**
 * Versuche je Anfrage, wenn sie ins Zeitlimit läuft (Standard 2). Eine Wiederholung mit derselben Anfrage dauert meist
 * wieder genauso lange, und Gemini rechnet die abgebrochene Anfrage trotzdem ab; mehr als ein zweiter Versuch kostet nur
 * Zeit und Geld.
 */
function timeoutAttempts(): number {
  return Math.max(1, Math.floor(envNumber("GEMINI_TIMEOUT_ATTEMPTS", 2)));
}
/** Ist der Fehler unser eigenes Zeitlimit (AbortSignal.timeout)? Das SDK meldet es je nach Version als TimeoutError oder AbortError. */
export function isRequestTimeout(error: unknown): boolean {
  return (
    (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) ||
    /operation was aborted|aborted due to timeout/i.test(errorMessage(error))
  );
}
/** Versuche je Anfrage bei vorübergehenden Fehlern (Standard 4). */
function transientAttempts(): number {
  return Math.max(1, Math.floor(envNumber("GEMINI_MAX_ATTEMPTS", 4)));
}
/** Pause vor dem nächsten Versuch: 2 s, 6 s, 18 s … (Basis per GEMINI_RETRY_BASE_MS, in Tests 0), mit etwas Streuung. */
function retryDelayMs(attempt: number): number {
  const base = envNumber("GEMINI_RETRY_BASE_MS", 2_000);
  return base === 0 ? 0 : Math.round(base * 3 ** (attempt - 1) * (0.8 + Math.random() * 0.4));
}
function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Zusätzliche Angaben je Anfrage. */
export interface GenerationOptions {
  /**
   * Denkstufe für Modelle mit Denkstufen (Gemini 4, siehe usesThinkingLevels). Ohne Angabe gilt die Vorgabe des Modells
   * (`high`). Ältere Modelle ignorieren die Angabe und laufen wie bisher ohne Denken (thinkingBudget 0).
   */
  thinkingLevel?: ThinkingLevelName;
}

/**
 * Denk-Einstellung einer Anfrage. Gemini 4: `thinkingLevel` (ein `thinkingBudget` beantwortet es mit HTTP 400). Das SDK
 * kennt `XHIGH` noch nicht als Enum-Wert, die API nimmt den Wert trotzdem an; deshalb als Text.
 */
function thinkingConfigFor(model: string, thinkingLevel?: ThinkingLevelName) {
  if (!usesThinkingLevels(model)) return { thinkingBudget: 0 };
  return thinkingLevel ? { thinkingLevel: thinkingLevel.toUpperCase() as ThinkingLevel } : undefined;
}

/**
 * Die Erzeugungs-Einstellungen einer Anfrage (ohne Zeitlimit): Systemprompt, niedrige Temperatur, JSON-Antwort, Antwortschema,
 * Ausgabe-Limit und Denk-Einstellung, sofern das Modell sie annimmt. Der Live-Aufruf (`requestJson`) und der Batch-Aufruf
 * (lib/ai/batch.ts) nutzen dieselbe Funktion, damit beide gleich antworten.
 */
export function generationConfig(systemPrompt: string, model: string, jsonSchema?: Record<string, unknown>, useSchema = true, options: GenerationOptions = {}) {
  const thinkingConfig = thinkingConfigFor(model || DEFAULT_GEMINI_MODEL, options.thinkingLevel);
  const fallback = activeConfigFallback(model)?.level;
  return {
    systemInstruction: systemPrompt,
    // Gemini 4 ignoriert die Temperatur (laut Modellseite); ältere Modelle antworten damit gleichmäßiger.
    temperature: 0.1,
    // 65536 ist das Ausgabe-Limit je Antwort (gemini-2.5/3.x-flash, Gemini 4 Hydrogen je „foreground segment“). Eine zu
    // knappe Grenze hat nachweislich zu mitten im JSON abgeschnittenen Antworten geführt (siehe Git-Historie). Bei Gemini 4
    // zählen die Denk-Token mit hinein.
    // Lehnt ein Modell die Denk-Einstellung ab, fällt zuerst nur sie weg; das Ausgabe-Limit erst, wenn auch das nicht hilft.
    ...(fallback === "no_limits" ? {} : { maxOutputTokens: 65536 }),
    ...(fallback || !thinkingConfig ? {} : { thinkingConfig }),
    responseMimeType: "application/json",
    ...(useSchema && jsonSchema && !rejectedSchemas.has(schemaKey(jsonSchema)) ? { responseJsonSchema: jsonSchema } : {}),
  };
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
  options: GenerationOptions = {},
): Promise<string> {
  const client = clientOverride ?? getGeminiClient();
  // Vorübergehende Fehler (429/503, Netzwerk, Zeitüberschreitung, leere Antwort) mit wachsender Pause wiederholen,
  // statt sofort aufzugeben: ein einzelner Aussetzer der API soll kein Lernziel und keinen Kurslauf kosten.
  const maxAttempts = transientAttempts();

  let useSchema = Boolean(jsonSchema) && !rejectedSchemas.has(schemaKey(jsonSchema!));
  const modelKey = model || DEFAULT_GEMINI_MODEL;
  const timeoutMs = requestTimeoutMs();
  let timeouts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Stufe, mit der diese Anfrage rausgeht: Bei parallelen Anfragen kann eine andere die Stufe inzwischen erhöht haben.
    const sentLevel = activeConfigFallback(modelKey)?.level;
    try {
      const response = await client.models.generateContent({
        model: modelKey,
        // Systemprompt als systemInstruction statt vorn an den Text geklebt: er steht so immer am Anfang der Anfrage,
        // und Geminis implizites Caching kann den gleichbleibenden Anfang (Systemprompt, ggf. gemeinsame Quelle)
        // über alle Lernziele eines Kurses zum Cache-Preis abrechnen.
        contents: userPrompt,
        config: {
          ...generationConfig(systemPrompt, model, jsonSchema, useSchema, options),
          // Ohne Zeitlimit kann eine hängende Verbindung den ganzen Kurslauf für Stunden blockieren.
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      });

      const usage = response.usageMetadata;
      const promptTokens = usage?.promptTokenCount ?? 0;
      // Denk-Token werden wie Ausgabe-Token abgerechnet und stehen nicht in candidatesTokenCount.
      const completionTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
      const cachedTokens = usage?.cachedContentTokenCount ?? 0;
      const finishReason = finishReasonOf(response);
      const fallback = activeConfigFallback(modelKey)?.level ?? "none";
      console.log(
        `USAGE model=${model} promptTokens=${promptTokens} completionTokens=${completionTokens} totalTokens=${promptTokens + completionTokens} cachedTokens=${cachedTokens} finishReason=${finishReason} configFallback=${fallback}`,
      );
      await recordAiUsage({ model, promptTokens, completionTokens, cachedTokens }, { byok: clientOverride !== undefined });
      onUsage?.({ model, promptTokens, completionTokens, cachedTokens });

      // Abgeschnitten oder blockiert: ein neuer Versuch mit derselben Anfrage kostet wieder und endet fast immer gleich.
      assertUsableFinish(finishReason);

      if (!response.text) {
        // Leere Antwort (z. B. abgebrochene Ausgabe): beim nächsten Versuch meist da. Erst nach dem letzten Versuch ein Fehler.
        if (attempt < maxAttempts) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw new AIGenerationError("Gemini hat keine Textantwort zurückgegeben.");
      }
      return response.text;
    } catch (error) {
      if (error instanceof AIGenerationError) throw error;
      if (isSchemaRejection(error)) {
        // Nennt die Ablehnung das Schema, liegt es daran. Sonst (allgemeines „invalid argument“) zuerst ohne Denk-Einstellung,
        // dann zusätzlich ohne Ausgabe-Limit (beides nimmt nicht jedes Modell an), danach erst ohne Schema.
        const message = errorMessage(error);
        const namesSchema = /schema|constraint/i.test(message);
        if (useSchema && (namesSchema || sentLevel === "no_limits")) {
          // Gemini nimmt dieses Schema nicht an: einmal ohne Schema weitermachen (wie früher) und es nicht erneut versuchen.
          console.warn("Gemini hat das Antwortschema abgelehnt, weiter ohne Schema:", message.slice(0, 300));
          rejectedSchemas.add(schemaKey(jsonSchema!));
          useSchema = false;
          attempt--;
          continue;
        }
        if (!namesSchema && sentLevel !== "no_limits") {
          const next: ConfigFallbackLevel = sentLevel === "no_thinking" ? "no_limits" : "no_thinking";
          console.warn(
            `Gemini (${modelKey}) hat die Anfrage abgelehnt, weiter ${next === "no_thinking" ? "ohne Denk-Einstellung" : "auch ohne Ausgabe-Limit"} (gemerkt für ${CONFIG_FALLBACK_TTL_MS / 60_000} Minuten):`,
            message.slice(0, 300),
          );
          setConfigFallback(modelKey, next, message.slice(0, 300));
          attempt--;
          continue;
        }
      }
      if (isRequestTimeout(error)) {
        timeouts++;
        if (timeouts >= timeoutAttempts() || attempt === maxAttempts) {
          console.warn(`Gemini-Anfrage (${modelKey}) ${timeouts}× ins Zeitlimit von ${timeoutMs / 1000} s gelaufen, gebe auf.`);
          throw new AIGenerationError(
            `Gemini hat ${timeouts}× nicht innerhalb von ${Math.round(timeoutMs / 60_000)} Minuten geantwortet (timeout, GEMINI_REQUEST_TIMEOUT_MS). Das ist keine inhaltliche Ablehnung; ein neuer Start versucht es erneut.`,
            error,
          );
        }
      } else if (attempt === maxAttempts || !isRetryableError(error)) {
        throw error;
      }
      console.warn(`Gemini-Anfrage fehlgeschlagen (Versuch ${attempt}/${maxAttempts}), neuer Versuch:`, errorMessage(error).slice(0, 200));
      await sleep(retryDelayMs(attempt));
    }
  }

  throw new AIGenerationError("Gemini-Anfrage konnte nicht verarbeitet werden.");
}

/**
 * Wandelt den Antworttext der KI in ein geprüftes Objekt, ohne neue Anfrage (für Antworten, die nicht aus `requestJson` kommen,
 * etwa aus einem Batch). Wirft `AIGenerationError`, wenn der Text kein gültiges JSON ist oder das Schema verletzt.
 */
export function parseStructuredText<T>(text: string, schema: ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sanitizeJsonControlChars(extractJson(text)));
  } catch (err) {
    throw new AIGenerationError("KI-Antwort konnte nicht als JSON geparst werden.", err);
  }
  const result = schema.safeParse(normalizeGeneratedAliases(parsed));
  if (!result.success) throw new AIGenerationError(`KI-Antwort entspricht nicht dem erwarteten Schema: ${result.error.message}`);
  return result.data;
}

export async function generateStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: ZodType<T>,
  model: string,
  onUsage?: (usage: AIUsage) => void,
  clientOverride?: GoogleGenAI,
  options: GenerationOptions = {},
): Promise<T> {
  const jsonSchema = toGeminiJsonSchema(schema);
  let rawText = await requestJson(systemPrompt, userPrompt, model, onUsage, clientOverride, jsonSchema, options);

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
        options,
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
      options,
    );
  }

  throw new AIGenerationError("KI-Antwort konnte nicht verarbeitet werden.");
}
