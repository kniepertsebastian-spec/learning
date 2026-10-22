import { describe, expect, it } from "vitest";
import { isOfflineShellPath } from "@/lib/pwa/offline-routes";

describe("isOfflineShellPath", () => {
  it("erkennt Fallback- und Offline-Seite", () => {
    expect(isOfflineShellPath("/~offline")).toBe(true);
    expect(isOfflineShellPath("/offline")).toBe(true);
    expect(isOfflineShellPath("/offline/x")).toBe(true);
  });
  it("trifft keine anderen Seiten, auch nicht den bisherigen Leser je Kurs", () => {
    for (const path of ["/", "/cert/aws/offline", "/offlinex", "/admin"]) expect(isOfflineShellPath(path)).toBe(false);
  });
});
