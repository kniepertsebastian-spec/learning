import { describe, expect, it, vi } from "vitest";
import { reconcileCacheOwner } from "@/lib/client/cache-owner";

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
};

describe("reconcileCacheOwner", () => {
  it("leert bei anderem Nutzer und merkt sich den neuen Besitzer", async () => {
    const storage = memory({ "proofpath-cache-owner": "alt" });
    const clear = vi.fn().mockResolvedValue(undefined);
    expect(await reconcileCacheOwner("neu", storage, clear)).toBe(true);
    expect(clear).toHaveBeenCalledOnce();
    expect(storage.data["proofpath-cache-owner"]).toBe("neu");
  });
  it("leert nicht beim selben Nutzer", async () => {
    const clear = vi.fn();
    expect(await reconcileCacheOwner("u", memory({ "proofpath-cache-owner": "u" }), clear)).toBe(false);
    expect(clear).not.toHaveBeenCalled();
  });
  it("leert vorsichtshalber, wenn kein Besitzer bekannt ist", async () => {
    const clear = vi.fn().mockResolvedValue(undefined);
    expect(await reconcileCacheOwner("u", memory(), clear)).toBe(true);
  });
  it("tut nichts ohne angemeldeten Nutzer (abgelaufene Sitzung bleibt dem nächsten Login überlassen)", async () => {
    const clear = vi.fn();
    expect(await reconcileCacheOwner(null, memory({ "proofpath-cache-owner": "alt" }), clear)).toBe(false);
    expect(clear).not.toHaveBeenCalled();
  });
  it("übersteht einen defekten Speicher", async () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    const clear = vi.fn().mockResolvedValue(undefined);
    expect(await reconcileCacheOwner("u", broken, clear)).toBe(true);
  });
});
