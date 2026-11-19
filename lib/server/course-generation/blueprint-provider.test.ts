import { describe, expect, it } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { createSonnetBlueprintProvider } from "./providers";
import { courseBlueprintV1Schema } from "./schemas";

/** Eine KI-Antwort, wie sie im Gate-3-Lauf kam: gültiger Blueprint, aber die Quellen ohne `retrievedAt`. */
const aiAnswer = (sources: unknown) =>
  JSON.stringify({
    schemaVersion: "1.0",
    title: "Kurs",
    description: "Beschreibung",
    language: "de",
    provider: "Intern",
    examQuestionCount: null,
    examDurationMinutes: null,
    passingScore: null,
    scoreScale: null,
    ...(sources === undefined ? {} : { sources }),
    domains: [
      {
        id: "dom-1", title: "Grundlagen", weight: 1,
        objectives: [{
          id: "obj-1", code: "1.1", title: "Ziel", description: "Beschreibung", examWeight: 1, complexity: "medium",
          requiredConcepts: ["a", "b"], commonMisconceptions: [], lessonPlan: ["Schritt 1", "Schritt 2"],
          sourceLocators: ["Abschnitt 1"], sourceIds: ["SRC_01"], recommendedQuestions: 4, requiredScenarios: [],
        }],
      },
    ],
  });

const clientReturning = (text: string) =>
  ({ models: { generateContent: async () => ({ text, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }) } }) as unknown as GoogleGenAI;

const input = {
  requestId: "r1",
  courseTitle: "Kurs",
  courseDescription: "Beschreibung",
  language: "de" as const,
  sources: [{ id: "doc-1", title: "Handbuch", url: "dokument:abc", retrievedAt: "2026-10-07T10:00:00.000Z", excerpts: [{ locator: "Abschnitt 1", text: "Text" }], truncated: false }],
};

describe("Blueprint-Provider: Quellen kommen aus der App, nicht aus der KI", () => {
  for (const [name, sources] of [
    ["Quellen ohne retrievedAt", [{ id: "x", title: "erfunden" }]],
    ["Quellen fehlen ganz", undefined],
    ["erfundene Quellen mit anderem Inhalt", [{ id: "fake", title: "Fremd", url: "https://evil.example", retrievedAt: "1999" }]],
  ] as const) {
    it(`${name}: Ergebnis nutzt die echten Quellen und ist ein gültiger Blueprint`, async () => {
      const provider = createSonnetBlueprintProvider(clientReturning(aiAnswer(sources)));
      const result = await provider.generateBlueprint(input as never, () => undefined);
      expect(result.sources).toEqual([{ id: "doc-1", title: "Handbuch", url: "dokument:abc", retrievedAt: "2026-10-07T10:00:00.000Z" }]);
      expect(courseBlueprintV1Schema.safeParse({ ...result, requestId: "r1" }).success).toBe(true);
    });
  }
});

describe("Blueprint-Provider: individuelles Training", () => {
  const capture = async (courseType?: "custom") => {
    let seen = "";
    const client = { models: { generateContent: async (args: unknown) => { seen = JSON.stringify(args); return { text: aiAnswer(undefined), usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }; } } } as unknown as GoogleGenAI;
    await createSonnetBlueprintProvider(client).generateBlueprint({ ...input, courseType } as never, () => undefined);
    return seen;
  };

  it("custom: Prompt sagt „kein Zertifizierungskurs“ und nennt das Thema themenneutral", async () => {
    const seen = await capture("custom");
    expect(seen).toContain("KEIN Zertifizierungskurs");
    expect(seen).toContain("individuelles Training");
  });

  it("Zertifikatskurs: Prompt unverändert (kein Hinweis auf individuelles Training)", async () => {
    expect(await capture()).not.toContain("KEIN Zertifizierungskurs");
  });
});

describe("Blueprint-Provider: Stufe 1 der Token-Roadmap", () => {
  const captureArgs = async (answer = aiAnswer(undefined)) => {
    let seen: { contents: string; config: { systemInstruction: string; thinkingConfig?: unknown } } | null = null;
    const client = { models: { generateContent: async (args: never) => { seen = args; return { text: answer, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }; } } } as unknown as GoogleGenAI;
    const result = await createSonnetBlueprintProvider(client).generateBlueprint(input as never, () => undefined);
    return { seen: seen!, result };
  };

  it("Quellen stehen ID-getaggt am Anfang, Quellenregeln im Systemprompt", async () => {
    const { seen } = await captureArgs();
    expect(seen.contents.startsWith("Quellen:\n<source id=\"SRC_01\" title=\"Handbuch\">")).toBe(true);
    expect(seen.config.systemInstruction).toContain("Closed Book");
    expect(seen.config.systemInstruction).toContain("[QUELLE FEHLT: kurze Beschreibung]");
    expect(seen.config.systemInstruction).toContain("`sourceIds`");
  });

  it("das Quellen-Mapping (sourceIds) landet im Blueprint", async () => {
    const { result } = await captureArgs();
    expect(result.domains[0].objectives[0].sourceIds).toEqual(["SRC_01"]);
  });

  it("ohne sourceIds ist die Antwort ungültig (Mapping ist Pflicht)", async () => {
    const answer = aiAnswer(undefined).replace('"sourceIds":["SRC_01"],', "");
    await expect(captureArgs(answer)).rejects.toThrow(/sourceIds/);
  });
});
