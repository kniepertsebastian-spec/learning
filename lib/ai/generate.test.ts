import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isRetryableAnthropicError,
  isRetryableError,
  isStructuredOutputParseFailure,
  lenientDifficultySchema,
  lenientQuestionTypeSchema,
  normalizeGeneratedAliases,
  sanitizeJsonControlChars,
} from "./generate";

describe("sanitizeJsonControlChars", () => {
  it("escapes a raw newline inside a string literal so JSON.parse accepts it", () => {
    const raw = '{"content":"line one\nline two"}';
    expect(() => JSON.parse(raw)).toThrow();
    const sanitized = sanitizeJsonControlChars(raw);
    expect(JSON.parse(sanitized)).toEqual({ content: "line one\nline two" });
  });

  it("escapes raw tabs and carriage returns inside a string literal", () => {
    const raw = '{"a":"x\ty\rz"}';
    const sanitized = sanitizeJsonControlChars(raw);
    expect(JSON.parse(sanitized)).toEqual({ a: "x\ty\rz" });
  });

  it("escapes an arbitrary control character as \\u00XX", () => {
    const raw = '{"a":"xy"}';
    const sanitized = sanitizeJsonControlChars(raw);
    expect(JSON.parse(sanitized)).toEqual({ a: "xy" });
  });

  it("leaves already-valid JSON untouched", () => {
    const raw = '{"a":"line one\\nline two","b":[1,2,3]}';
    expect(sanitizeJsonControlChars(raw)).toBe(raw);
    expect(JSON.parse(sanitizeJsonControlChars(raw))).toEqual(JSON.parse(raw));
  });

  it("does not touch control characters outside of string literals (whitespace between tokens)", () => {
    const raw = '{\n  "a": "b"\n}';
    expect(sanitizeJsonControlChars(raw)).toBe(raw);
  });

  it("does not double-escape an already-escaped backslash-n", () => {
    const raw = '{"a":"already\\nescaped"}';
    expect(sanitizeJsonControlChars(raw)).toBe(raw);
  });
});

describe("normalizeGeneratedAliases", () => {
  it("leaves an already-valid difficulty untouched", () => {
    expect(normalizeGeneratedAliases({ difficulty: "advanced" })).toEqual({ difficulty: "advanced" });
  });

  it("maps a known difficulty synonym to the exact schema token", () => {
    expect(normalizeGeneratedAliases({ difficulty: "Medium" })).toEqual({ difficulty: "intermediate" });
    expect(normalizeGeneratedAliases({ difficulty: "hard" })).toEqual({ difficulty: "advanced" });
    expect(normalizeGeneratedAliases({ difficulty: "easy" })).toEqual({ difficulty: "beginner" });
  });

  it("falls back to intermediate for a completely unrecognized difficulty instead of failing validation", () => {
    expect(normalizeGeneratedAliases({ difficulty: "super-duper-hard" })).toEqual({
      difficulty: "intermediate",
    });
  });

  it("maps a known question-type synonym to the exact schema token", () => {
    expect(normalizeGeneratedAliases({ type: "understanding" })).toEqual({ type: "comprehension" });
    expect(normalizeGeneratedAliases({ type: "debugging" })).toEqual({ type: "troubleshooting" });
  });

  it("falls back to knowledge for a completely unrecognized question type instead of failing validation", () => {
    expect(normalizeGeneratedAliases({ type: "something-unexpected" })).toEqual({ type: "knowledge" });
  });

  it("normalizes fields nested inside arrays and objects, matching the real questions[] shape", () => {
    const input = {
      lessons: [{ content: "x" }],
      questions: [
        { difficulty: "beginner", type: "knowledge" },
        { difficulty: "Hard", type: "unexpected-value" },
      ],
    };
    expect(normalizeGeneratedAliases(input)).toEqual({
      lessons: [{ content: "x" }],
      questions: [
        { difficulty: "beginner", type: "knowledge" },
        { difficulty: "advanced", type: "knowledge" },
      ],
    });
  });
});

describe("lenientDifficultySchema", () => {
  it("accepts the exact schema tokens unchanged", () => {
    expect(lenientDifficultySchema.parse("advanced")).toBe("advanced");
  });

  it("normalizes a known synonym the API itself might reject", () => {
    expect(lenientDifficultySchema.parse("medium")).toBe("intermediate");
    expect(lenientDifficultySchema.parse("Hard")).toBe("advanced");
  });

  it("falls back to intermediate instead of failing validation", () => {
    expect(lenientDifficultySchema.parse("super-duper-hard")).toBe("intermediate");
  });
});

describe("lenientQuestionTypeSchema", () => {
  it("accepts the exact schema tokens unchanged", () => {
    expect(lenientQuestionTypeSchema.parse("scenario")).toBe("scenario");
  });

  it("normalizes a known synonym the API itself might reject", () => {
    expect(lenientQuestionTypeSchema.parse("understanding")).toBe("comprehension");
  });

  it("falls back to knowledge instead of failing validation", () => {
    expect(lenientQuestionTypeSchema.parse("something-unexpected")).toBe("knowledge");
  });
});

describe("isStructuredOutputParseFailure", () => {
  it("recognizes structured-output validation failure", () => {
    const error = new Error('Failed to parse structured output: Error: [{"code":"too_small"}]');
    expect(isStructuredOutputParseFailure(error)).toBe(true);
  });

  it("does not misfire on an unrelated error", () => {
    expect(isStructuredOutputParseFailure(new Error("Gemini hat keine Textantwort zurückgegeben."))).toBe(false);
  });
});

describe("isRetryableError", () => {
  it("treats a structured-output parse failure as retryable", () => {
    const error = new Error("Failed to parse structured output: Error: [...]");
    expect(isRetryableError(error)).toBe(true);
    expect(isRetryableAnthropicError(error)).toBe(true);
  });

  it("still treats a genuine 5xx/network failure as retryable", () => {
    expect(isRetryableError(new Error("fetch failed (ECONNRESET)"))).toBe(true);
  });

  it("does not retry a non-retryable error", () => {
    expect(isRetryableError(new Error("Gemini hat keine Textantwort zurückgegeben."))).toBe(false);
  });
});

import { z } from "zod";
import type { GoogleGenAI } from "@google/genai";
import { generateStructured, isSchemaRejection, toGeminiJsonSchema } from "./generate";
import { groundedLessonsAndQuestionsResponseSchema, lessonsAndQuestionsForObjectiveResponseSchema, curriculumDraftForDomainResponseSchema } from "@/lib/server/ai/schemas";
import { courseBlueprintAiResponseSchema, objectiveContentAiResponseSchema, objectiveContentNoQuestionsAiResponseSchema, objectiveContentNoQuestionsResponseSchema, objectiveContentResponseSchema, questionsOnlyAiResponseSchema } from "@/lib/server/course-generation/schemas";

const ALLOWED = new Set(["type", "properties", "required", "items", "enum", "minItems", "maxItems", "minimum", "maximum", "anyOf", "description"]);
function schemaKeywords(node: unknown, found = new Set<string>(), underProperties = false): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => schemaKeywords(n, found));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      // Namen unter "properties" sind Feldnamen, keine Schlüsselwörter
      if (!underProperties) found.add(k);
      schemaKeywords(v, found, k === "properties" && !underProperties);
    }
  }
  return found;
}

describe("Antwortschema für Gemini (strukturierte Ausgabe)", () => {
  it("alle Schemas der Kurserzeugung werden umgewandelt und enthalten nur von Gemini verstandene Schlüsselwörter", () => {
    for (const [name, schema] of Object.entries({
      courseBlueprintAiResponseSchema,
      objectiveContentResponseSchema,
      objectiveContentNoQuestionsResponseSchema,
      objectiveContentAiResponseSchema,
      objectiveContentNoQuestionsAiResponseSchema,
      questionsOnlyAiResponseSchema,
      groundedLessonsAndQuestionsResponseSchema,
      lessonsAndQuestionsForObjectiveResponseSchema,
      curriculumDraftForDomainResponseSchema,
    })) {
      const json = toGeminiJsonSchema(schema as never);
      expect(json, name).toBeDefined();
      expect(json!.type, name).toBe("object");
      for (const key of schemaKeywords(json)) expect(ALLOWED.has(key), `${name}: ${key}`).toBe(true);
    }
  });

  it("Pflichtfelder, Aufzählungen und Anzahlen bleiben erhalten (genau 4 Antwortoptionen, Schwierigkeit als Aufzählung)", () => {
    const json = toGeminiJsonSchema(objectiveContentResponseSchema as never) as { properties: Record<string, never> };
    const question = (json.properties.questions as { items: { properties: Record<string, { minItems?: number; maxItems?: number; enum?: string[] }>; required: string[] } }).items;
    expect(question.required).toEqual(expect.arrayContaining(["question", "options", "explanation", "sourceLocator"]));
    expect(question.properties.options.minItems).toBe(4);
    expect(question.properties.options.maxItems).toBe(4);
    expect(question.properties.type.enum).toEqual(["knowledge", "comprehension", "application", "scenario", "troubleshooting"]);
  });

  it("ein Feld namens wie ein Schlüsselwort (z. B. „type“, „items“) wird nicht weggefiltert", () => {
    const json = toGeminiJsonSchema(z.object({ type: z.string(), items: z.array(z.string()), enum: z.number() }) as never) as { properties: Record<string, unknown> };
    expect(Object.keys(json.properties)).toEqual(["type", "items", "enum"]);
  });

  it("literale Werte (schemaVersion: \"1.0\") werden zur Aufzählung", () => {
    const json = toGeminiJsonSchema(z.object({ v: z.literal("1.0") }) as never) as { properties: { v: { enum: string[] } } };
    expect(json.properties.v.enum).toEqual(["1.0"]);
  });
});

type Call = { config: { responseJsonSchema?: unknown; responseMimeType?: string } };
function fakeClient(handler: (call: Call, n: number) => string | Error) {
  const calls: Call[] = [];
  const client = {
    models: {
      generateContent: async (args: Call) => {
        calls.push(args);
        const out = handler(args, calls.length);
        if (out instanceof Error) throw out;
        return { text: out, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
      },
    },
  } as unknown as GoogleGenAI;
  return { client, calls };
}
const small = z.object({ name: z.string(), count: z.number().int() });

describe("generateStructured mit Antwortschema", () => {
  it("schickt das Schema an Gemini mit und liefert die geprüfte Antwort", async () => {
    const { client, calls } = fakeClient(() => '{"name":"a","count":2}');
    await expect(generateStructured("sys", "user", small, "m", undefined, client)).resolves.toEqual({ name: "a", count: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0].config.responseMimeType).toBe("application/json");
    expect(calls[0].config.responseJsonSchema).toMatchObject({ type: "object", required: ["name", "count"] });
  });

  it("Denk-Token werden wie Ausgabe-Token gezählt (sie werden so abgerechnet)", async () => {
    const client = {
      models: { generateContent: async () => ({ text: '{"name":"a","count":2}', usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 60 } }) },
    } as unknown as GoogleGenAI;
    const usages: { promptTokens: number; completionTokens: number }[] = [];
    await generateStructured("sys", "user", small, "m", (u) => usages.push(u), client);
    expect(usages).toEqual([expect.objectContaining({ promptTokens: 100, completionTokens: 100 })]);
  });

  it("die Korrekturversuche behalten das Schema", async () => {
    const { client, calls } = fakeClient((_c, n) => (n === 1 ? '{"name":"a"}' : '{"name":"a","count":3}'));
    await expect(generateStructured("sys", "user", small, "m", undefined, client)).resolves.toEqual({ name: "a", count: 3 });
    expect(calls).toHaveLength(2);
    expect(calls[1].config.responseJsonSchema).toBeDefined();
  });

  it("lehnt Gemini das Schema ab (zu komplex), geht es einmal ohne Schema weiter und fragt dasselbe Schema künftig gar nicht erst mit", async () => {
    const reject = new Error('{"error":{"code":400,"message":"The specified schema produces a constraint that has too many states for serving.","status":"INVALID_ARGUMENT"}}');
    const schemaA = z.object({ a: z.string() });
    const first = fakeClient((c) => (c.config.responseJsonSchema ? reject : '{"a":"x"}'));
    await expect(generateStructured("sys", "user", schemaA, "m", undefined, first.client)).resolves.toEqual({ a: "x" });
    expect(first.calls.map((c) => Boolean(c.config.responseJsonSchema))).toEqual([true, false]);
    const second = fakeClient(() => '{"a":"y"}');
    await expect(generateStructured("sys", "user", schemaA, "m", undefined, second.client)).resolves.toEqual({ a: "y" });
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0].config.responseJsonSchema).toBeUndefined();
  });

  it("ein ungültiger API-Schlüssel ist keine Schema-Ablehnung: kein Umweg ohne Schema, der Fehler kommt sofort", async () => {
    const invalidKey = new Error('{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}');
    expect(isSchemaRejection(invalidKey)).toBe(false);
    const { client, calls } = fakeClient(() => invalidKey);
    await expect(generateStructured("sys", "user", z.object({ k: z.string() }), "m", undefined, client)).rejects.toThrow(/API key not valid/);
    expect(calls).toHaveLength(1);
  });
});

describe("vorübergehende Fehler: Wiederholen statt Aufgeben", () => {
  const prevBase = process.env.GEMINI_RETRY_BASE_MS;
  beforeAll(() => {
    process.env.GEMINI_RETRY_BASE_MS = "0";
  });
  afterAll(() => {
    if (prevBase === undefined) delete process.env.GEMINI_RETRY_BASE_MS;
    else process.env.GEMINI_RETRY_BASE_MS = prevBase;
  });

  it("503 und Zeitüberschreitung werden wiederholt, danach kommt die Antwort", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const { client, calls } = fakeClient((_c, n) => (n === 1 ? new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}') : n === 2 ? timeout : '{"name":"a","count":1}'));
    await expect(generateStructured("sys", "user", small, "m", undefined, client)).resolves.toEqual({ name: "a", count: 1 });
    expect(calls).toHaveLength(3);
  });

  it("jede Anfrage hat ein Zeitlimit, damit eine hängende Verbindung den Lauf nicht blockiert", async () => {
    const { client, calls } = fakeClient(() => '{"name":"a","count":1}');
    await generateStructured("sys", "user", small, "m", undefined, client);
    expect((calls[0].config as { abortSignal?: unknown }).abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("eine leere Antwort wird einmal neu angefragt statt das Lernziel scheitern zu lassen", async () => {
    let n = 0;
    const client = {
      models: { generateContent: async () => ({ text: ++n === 1 ? "" : '{"name":"a","count":2}', usageMetadata: {} }) },
    } as unknown as GoogleGenAI;
    await expect(generateStructured("sys", "user", small, "m", undefined, client)).resolves.toEqual({ name: "a", count: 2 });
    expect(n).toBe(2);
  });

  it("nach der Höchstzahl an Versuchen kommt der Fehler", async () => {
    const { client, calls } = fakeClient(() => new Error("429 RESOURCE_EXHAUSTED"));
    await expect(generateStructured("sys", "user", small, "m", undefined, client)).rejects.toThrow(/429/);
    expect(calls).toHaveLength(4);
  });
});
