import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, generateNonce } from "./csp";

describe("buildContentSecurityPolicy", () => {
  it("erlaubt Skripte nur per Nonce und nicht per 'unsafe-inline'", () => {
    const csp = buildContentSecurityPolicy("abc123", false);
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("erlaubt 'unsafe-eval' nur im Dev-Server", () => {
    expect(buildContentSecurityPolicy("n", true)).toContain("'strict-dynamic' 'unsafe-eval'");
  });

  it("sperrt Einbettung, Plugins und fremde Formularziele", () => {
    const csp = buildContentSecurityPolicy("n", false);
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(csp).toContain(d);
    }
  });

  it("upgrade-insecure-requests nur in Produktion und nicht, wenn ausdrücklich abgeschaltet (http://localhost)", () => {
    expect(buildContentSecurityPolicy("n", false)).toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy("n", false, false)).not.toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy("n", true)).not.toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy("n", true, true)).not.toContain("upgrade-insecure-requests");
  });
});

describe("generateNonce", () => {
  it("liefert bei jedem Aufruf einen neuen Wert", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
