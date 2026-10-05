import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("lässt Pfade der eigenen Seite durch", () => {
    expect(safeRedirectPath("/invite/abc_-123")).toBe("/invite/abc_-123");
    expect(safeRedirectPath("/company?x=1")).toBe("/company?x=1");
  });

  it("fällt bei fremden Zielen auf den Standard zurück", () => {
    for (const bad of [
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "invite/abc",
      "/ok\nHeader: x",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(safeRedirectPath(bad)).toBe("/");
    }
    expect(safeRedirectPath("//evil.example", "/home")).toBe("/home");
  });
});
