import { describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/client/chunk-error";

const store = () => {
  const data: Record<string, string> = {};
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] };
};

describe("isChunkLoadError", () => {
  it("erkennt Webpack- und Import-Fehler", () => {
    expect(isChunkLoadError(Object.assign(new Error("x"), { name: "ChunkLoadError" }))).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 123 failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /_next/x.js"))).toBe(true);
  });
  it("lässt andere Fehler in Ruhe", () => {
    expect(isChunkLoadError(new Error("Etwas anderes"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("reloadOnceForChunkError", () => {
  const chunk = new Error("Loading chunk 7 failed.");
  it("lädt einmal neu und danach nicht erneut (keine Schleife)", () => {
    const storage = store();
    const reload = vi.fn();
    expect(reloadOnceForChunkError(chunk, storage, reload, 1_000_000)).toBe(true);
    expect(reloadOnceForChunkError(chunk, storage, reload, 1_000_000 + 5_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadOnceForChunkError(chunk, storage, reload, 1_000_000 + 120_000)).toBe(true);
  });
  it("lädt bei anderen Fehlern nicht neu", () => {
    const reload = vi.fn();
    expect(reloadOnceForChunkError(new Error("x"), store(), reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
