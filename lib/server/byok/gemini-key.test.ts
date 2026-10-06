import { describe, expect, it, vi } from "vitest";
import { checkGeminiKey, looksLikeApiKey } from "./gemini-key";

describe("Prüfung eines mitgebrachten Gemini-Schlüssels", () => {
  it("Form: keine Leerzeichen, vernünftige Länge", () => {
    expect(looksLikeApiKey("AIzaSyTest0123456789abcdefGHIJKLmnop")).toBe(true);
    for (const bad of ["", "kurz", "mit Leerzeichen 0123456789abcdef", "x".repeat(201), "AIza\nSy0123456789abcdefghij"]) expect(looksLikeApiKey(bad), bad).toBe(false);
  });
  it("200 gültig; 400/401/403 ungültig; sonst und bei Netzfehlern nicht erreichbar", async () => {
    const answer = (status: number) => vi.fn().mockResolvedValue(new Response("{}", { status })) as unknown as typeof fetch;
    expect(await checkGeminiKey("k", answer(200))).toEqual({ ok: true });
    for (const status of [400, 401, 403]) expect(await checkGeminiKey("k", answer(status))).toEqual({ ok: false, reason: "invalid" });
    for (const status of [429, 500, 503]) expect(await checkGeminiKey("k", answer(status))).toEqual({ ok: false, reason: "unreachable" });
    expect(await checkGeminiKey("k", vi.fn().mockRejectedValue(new Error("x")) as unknown as typeof fetch)).toEqual({ ok: false, reason: "unreachable" });
  });
  it("der Schlüssel steht nur im Header, nie in der Adresse", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await checkGeminiKey("GEHEIMER-SCHLUESSEL-123456", f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).not.toContain("GEHEIMER");
    expect((init as RequestInit).headers).toEqual({ "x-goog-api-key": "GEHEIMER-SCHLUESSEL-123456" });
  });
});
