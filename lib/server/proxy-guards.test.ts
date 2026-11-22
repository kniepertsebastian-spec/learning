import { describe, expect, it } from "vitest";
import { hasSessionCookie, hostnameFromHostHeader, isLocalHostname } from "./proxy-guards";

const c = (name: string, value = "x") => ({ name, value });

describe("hasSessionCookie", () => {
  it("erkennt den normalen Sitzungs-Cookie, mit und ohne __Secure-", () => {
    expect(hasSessionCookie([c("authjs.session-token")])).toBe(true);
    expect(hasSessionCookie([c("__Secure-authjs.session-token")])).toBe(true);
  });

  it("erkennt gestückelte Cookies (Auth.js teilt große JWTs in .0, .1, ...)", () => {
    expect(hasSessionCookie([c("authjs.session-token.0"), c("authjs.session-token.1")])).toBe(true);
    expect(hasSessionCookie([c("__Secure-authjs.session-token.0")])).toBe(true);
    expect(hasSessionCookie([c("__Secure-authjs.session-token.12")])).toBe(true);
  });

  it("lässt leere, fremde und ähnlich klingende Cookies nicht gelten", () => {
    expect(hasSessionCookie([])).toBe(false);
    expect(hasSessionCookie([c("authjs.session-token", "")])).toBe(false);
    expect(hasSessionCookie([c("authjs.csrf-token"), c("authjs.callback-url")])).toBe(false);
    expect(hasSessionCookie([c("authjs.session-token.x")])).toBe(false);
    expect(hasSessionCookie([c("evil-authjs.session-token")])).toBe(false);
    expect(hasSessionCookie([c("__Host-authjs.session-token")])).toBe(false);
  });
});

describe("isLocalHostname", () => {
  it("localhost und Loopback-Adressen", () => {
    for (const h of ["localhost", "LOCALHOST", "app.localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]"]) expect(isLocalHostname(h), h).toBe(true);
  });

  it("öffentliche Namen nicht", () => {
    for (const h of ["learning.pwa-tree.de", "localhost.evil.de", "128.0.0.1", "10.0.0.1"]) expect(isLocalHostname(h), h).toBe(false);
  });
});

describe("hostnameFromHostHeader", () => {
  it("schneidet den Port ab, auch bei IPv6", () => {
    expect(hostnameFromHostHeader("learning.pwa-tree.de")).toBe("learning.pwa-tree.de");
    expect(hostnameFromHostHeader("localhost:3000")).toBe("localhost");
    expect(hostnameFromHostHeader("127.0.0.1:3000")).toBe("127.0.0.1");
    expect(hostnameFromHostHeader("[::1]:3000")).toBe("[::1]");
    expect(hostnameFromHostHeader("[::1]")).toBe("[::1]");
  });

  it("fehlender oder kaputter Header: null (Aufrufer fällt auf nextUrl zurück)", () => {
    for (const h of [null, undefined, "", "  ", ":3000", "[]", "["]) expect(hostnameFromHostHeader(h), String(h)).toBeNull();
  });
});
