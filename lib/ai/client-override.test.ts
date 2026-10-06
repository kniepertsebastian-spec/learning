import { describe, expect, it, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { generateStructured, requestJson } from "./generate";

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
});
