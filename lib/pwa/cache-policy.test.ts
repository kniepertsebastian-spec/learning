import { describe, expect, it } from "vitest";
import { isRscRequest, isUncachedPagePath } from "@/lib/pwa/cache-policy";

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

describe("isRscRequest", () => {
  it("erkennt RSC-Header und _rsc-Parameter", () => {
    expect(isRscRequest({ headers: new Headers({ RSC: "1" }) }, new URL("https://app.example/cert/x"))).toBe(true);
    expect(isRscRequest({ headers: new Headers() }, new URL("https://app.example/cert/x?_rsc=abc"))).toBe(true);
    expect(isRscRequest({ headers: new Headers() }, new URL("https://app.example/cert/x"))).toBe(false);
  });
});
