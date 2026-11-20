import { readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildClientErrorEntry, recordClientError, sanitizeClientPath, sanitizeClientText, TOKEN_PATH_PREFIXES, type ClientErrorReport } from "./client-errors";

const base: ClientErrorReport = { boundary: "global", message: "Loading chunk 42 failed.", path: "/dashboard", chunkError: true, reloading: true };

afterEach(() => vi.restoreAllMocks());

describe("Client-Fehler bereinigen", () => {
  it("entfernt Abfrage, Fragment und Ursprung aus dem Pfad", () => {
    expect(sanitizeClientPath("https://app.example/learn/abc?token=geheim#x")).toBe("/learn/abc");
    expect(sanitizeClientPath("/unsubscribe?t=geheim")).toBe("/unsubscribe");
  });

  it("ersetzt Einmal-Tokens im Pfad", () => {
    expect(sanitizeClientPath("/invite/abc123")).toBe("/invite/[token]");
    expect(sanitizeClientPath("/reviewer-invite/abc123/x")).toBe("/reviewer-invite/[token]/x");
    expect(sanitizeClientText("Fehler auf https://h.example/reset-password/xyz", 500)).toBe("Fehler auf https://h.example/reset-password/[token]");
  });

  it("kennt alle Seiten mit Token im Pfad", () => {
    const appDir = path.resolve(__dirname, "../../../app");
    const withToken = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "api")
      .filter((entry) => readdirSync(path.join(appDir, entry.name)).some((child) => /^\[.*token.*\]$/i.test(child)))
      .map((entry) => entry.name)
      .sort();
    expect([...TOKEN_PATH_PREFIXES].sort()).toEqual(withToken);
  });

  it("entfernt Abfragen in Adressen, E-Mail-Adressen und Steuerzeichen im Text", () => {
    expect(sanitizeClientText("GET /_next/static/chunks/1.js?dpl=abc failed\u0007 für a.b@c.de", 500)).toBe("GET /_next/static/chunks/1.js failed  für [email]");
  });

  it("kürzt Nachricht und Stack", () => {
    const entry = buildClientErrorEntry({ ...base, message: "x".repeat(2000), stack: Array.from({ length: 20 }, (_, i) => `at f${i}`).join("\n") }, "UA", 0);
    expect(entry.message).toHaveLength(500);
    expect(entry.stack?.split("\n")).toHaveLength(8);
    expect(entry).toMatchObject({ event: "client_error", level: "error", boundary: "global", chunkError: true, reloading: true, userAgent: "UA", time: "1970-01-01T00:00:00.000Z" });
  });

  it("schreibt genau eine JSON-Zeile ins Log", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordClientError(base, null);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ event: "client_error", path: "/dashboard", message: "Loading chunk 42 failed." });
  });
});
