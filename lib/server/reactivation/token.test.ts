import { describe, expect, it } from "vitest";
import { unsubscribeToken, verifyUnsubscribeToken } from "./token";

const id = "9f0b5c9e-2c4a-4d3e-9d4e-2b3a1c0d4e5f";

describe("Abmelde-Token", () => {
  it("passt nur zu dieser Person und diesem Geheimnis", () => {
    const token = unsubscribeToken(id, "geheim");
    expect(verifyUnsubscribeToken(id, token, "geheim")).toBe(true);
    expect(verifyUnsubscribeToken("00000000-0000-4000-8000-000000000000", token, "geheim")).toBe(false);
    expect(verifyUnsubscribeToken(id, token, "anderes")).toBe(false);
    expect(verifyUnsubscribeToken(id, token.slice(0, -2) + "xx", "geheim")).toBe(false);
    expect(verifyUnsubscribeToken(id, "", "geheim")).toBe(false);
  });
});
