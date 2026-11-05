import { describe, expect, it, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { recordAiUsage } from "@/lib/server/admin/ai-ledger";
import { generateStructured, requestJson } from "./generate";

// Das Kostenbuch braucht eine Datenbank; hier zählt nur, dass requestJson jeden Aufruf dorthin meldet.
vi.mock("@/lib/server/admin/ai-ledger", () => ({ recordAiUsage: vi.fn(async () => undefined) }));

function stubClient(text: string) {
  const generateContent = vi.fn().mockResolvedValue({ text, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } });
  return { client: { models: { generateContent } } as unknown as GoogleGenAI, generateContent };
}

describe("KI-Aufrufe mit eigenem Client (BYOK einer Firma)", () => {
  it("requestJson nutzt den mitgegebenen Client, nicht den der Plattform", async () => {
    const { client, generateContent } = stubClient("{}");
    delete process.env.GEMINI_API_KEY; // der Plattform-Client würde sonst mit einem Konfigurationsfehler scheitern
    await expect(requestJson("sys", "user", "model-x", undefined, client)).resolves.toBe("{}");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("generateStructured reicht den Client auch bei Korrekturversuchen weiter", async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({ text: "kein json", usageMetadata: {} })
      .mockResolvedValueOnce({ text: '{"a":1}', usageMetadata: {} });
    const client = { models: { generateContent } } as unknown as GoogleGenAI;
    delete process.env.GEMINI_API_KEY;
    const out = await generateStructured("sys", "user", z.object({ a: z.number() }), "model-x", undefined, client);
    expect(out).toEqual({ a: 1 });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("jeder KI-Aufruf geht ins Kostenbuch: mit den Token des Aufrufs, als BYOK gekennzeichnet", async () => {
    vi.mocked(recordAiUsage).mockClear();
    const generateContent = vi.fn().mockResolvedValue({
      text: "{}",
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5, cachedContentTokenCount: 40 },
    });
    const client = { models: { generateContent } } as unknown as GoogleGenAI;
    await requestJson("sys", "user", "model-x", undefined, client);
    expect(recordAiUsage).toHaveBeenCalledTimes(1);
    // Denk-Token zählen als Ausgabe.
    expect(recordAiUsage).toHaveBeenCalledWith({ model: "model-x", promptTokens: 100, completionTokens: 25, cachedTokens: 40 }, { byok: true });
  });

  it("auch ein Aufruf, dessen Antwort leer bleibt, wird verbucht (er hat Token gekostet)", async () => {
    vi.mocked(recordAiUsage).mockClear();
    process.env.GEMINI_MAX_ATTEMPTS = "2";
    process.env.GEMINI_RETRY_BASE_MS = "0";
    const generateContent = vi.fn().mockResolvedValue({ text: "", usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 0 } });
    const client = { models: { generateContent } } as unknown as GoogleGenAI;
    await expect(requestJson("sys", "user", "model-x", undefined, client)).rejects.toThrow();
    expect(recordAiUsage).toHaveBeenCalledTimes(2);
    delete process.env.GEMINI_MAX_ATTEMPTS;
    delete process.env.GEMINI_RETRY_BASE_MS;
  });
});
