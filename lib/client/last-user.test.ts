import { describe, expect, it } from "vitest";
import { clearLastUserId, getLastUserId, setLastUserId } from "@/lib/client/last-user";

const memory = () => {
  const data: Record<string, string> = {};
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] };
};

describe("last-user", () => {
  it("merkt sich die ID und vergisst sie beim Logout", () => {
    const s = memory();
    expect(getLastUserId(s)).toBeNull();
    setLastUserId("u1", s);
    expect(getLastUserId(s)).toBe("u1");
    clearLastUserId(s);
    expect(getLastUserId(s)).toBeNull();
  });
  it("übersteht fehlenden oder defekten Speicher", () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(getLastUserId(broken)).toBeNull();
    expect(() => setLastUserId("u", broken)).not.toThrow();
    expect(() => clearLastUserId(null)).not.toThrow();
  });
});
