import { describe, expect, it } from "vitest";
import { isUncachedPagePath } from "@/lib/pwa/cache-policy";

describe("isUncachedPagePath", () => {
  it("nimmt Admin- und Firmenbereich aus dem Seiten-Cache aus", () => {
    for (const path of ["/admin", "/admin/certifications/x", "/company", "/company/certificates", "/confirm-company"]) {
      expect(isUncachedPagePath(path)).toBe(true);
    }
  });
  it("lässt Lernseiten cachen und trifft keine ähnlich beginnenden Pfade", () => {
    for (const path of ["/", "/cert/aws/session", "/offline", "/administration", "/companyx", "/account"]) {
      expect(isUncachedPagePath(path)).toBe(false);
    }
  });
});
