import { describe, expect, it } from "vitest";
import { isPageResponseCacheable, isRscRequest, isUncachedPagePath } from "@/lib/pwa/cache-policy";

describe("isUncachedPagePath", () => {
  it("nimmt Admin- und Firmenbereich aus dem Seiten-Cache aus", () => {
    for (const path of ["/admin", "/admin/certifications/x", "/company", "/company/certificates", "/confirm-company"]) {
      expect(isUncachedPagePath(path)).toBe(true);
    }
  });
  it("nimmt Reviewer-, Konto-, Profil- und Nachweisseiten aus", () => {
    for (const path of [
      "/reviewer",
      "/reviewer/courses/1",
      "/account",
      "/account/security",
      "/profile",
      "/profile/export",
      "/certificates",
      "/certificates/abc",
      "/verify/3f2a9c",
    ]) {
      expect(isUncachedPagePath(path)).toBe(true);
    }
  });
  it("nimmt Anmelde- und Token-Seiten samt dynamischer Token-Subpfade aus", () => {
    for (const path of [
      "/login",
      "/register",
      "/sso",
      "/sso/callback",
      "/forgot-password",
      "/reset-password",
      "/reset-password/abc123",
      "/verify-email",
      "/verify-email/tok",
      "/resend-verification",
      "/invite",
      "/invite/xyz",
      "/reviewer-invite",
      "/reviewer-invite/xyz",
      "/unsubscribe",
      "/unsubscribe/tok",
    ]) {
      expect(isUncachedPagePath(path)).toBe(true);
    }
  });
  it("lässt Lernseiten cachen und trifft keine ähnlich beginnenden Pfade", () => {
    for (const path of [
      "/",
      "/cert/aws/session",
      "/catalog",
      "/offline",
      "/administration",
      "/companyx",
      "/accounts",
      "/profiles",
      "/reviewers",
      "/inviteme",
      "/verifyx",
      "/loginhelp",
    ]) {
      expect(isUncachedPagePath(path)).toBe(false);
    }
  });
});

describe("isPageResponseCacheable", () => {
  const headers = (init: Record<string, string>) => new Headers(init);
  it("lässt Antworten ohne Cache-Control und den Next.js-Standard für dynamische Seiten zu", () => {
    expect(isPageResponseCacheable(headers({}))).toBe(true);
    expect(isPageResponseCacheable(headers({ "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate" }))).toBe(true);
    expect(isPageResponseCacheable(headers({ "Cache-Control": "must-revalidate, max-age=0, no-store, no-cache, private" }))).toBe(true);
    expect(isPageResponseCacheable(headers({ "Cache-Control": "public, max-age=0, must-revalidate" }))).toBe(true);
    expect(isPageResponseCacheable(headers({ "Cache-Control": "s-maxage=60, stale-while-revalidate" }))).toBe(true);
  });
  it("verwirft bewusst gesetztes no-store oder private", () => {
    for (const value of ["no-store", "private", "private, max-age=60", "No-Store", 'private="Set-Cookie"', "no-cache, no-store"]) {
      expect(isPageResponseCacheable(headers({ "Cache-Control": value }))).toBe(false);
    }
  });
  it("verwirft Antworten mit X-SW-Cache: no-store, auch beim Next.js-Standard", () => {
    expect(isPageResponseCacheable(headers({ "X-SW-Cache": "no-store" }))).toBe(false);
    expect(
      isPageResponseCacheable(
        headers({ "X-SW-Cache": " No-Store ", "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate" }),
      ),
    ).toBe(false);
  });
  it("trifft keine ähnlich klingenden Direktiven", () => {
    expect(isPageResponseCacheable(headers({ "Cache-Control": "no-cache" }))).toBe(true);
    expect(isPageResponseCacheable(headers({ "Cache-Control": "public, privateish" }))).toBe(true);
  });
});

describe("isRscRequest", () => {
  it("erkennt RSC-Header und _rsc-Parameter", () => {
    expect(isRscRequest({ headers: new Headers({ RSC: "1" }) }, new URL("https://app.example/cert/x"))).toBe(true);
    expect(isRscRequest({ headers: new Headers() }, new URL("https://app.example/cert/x?_rsc=abc"))).toBe(true);
    expect(isRscRequest({ headers: new Headers() }, new URL("https://app.example/cert/x"))).toBe(false);
  });
});
