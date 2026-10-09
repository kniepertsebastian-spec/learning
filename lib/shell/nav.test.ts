import { describe, expect, it } from "vitest";
import { availableContexts, contextForPath, isNavActive, isPublicPath, navItems } from "./nav";

describe("contextForPath", () => {
  it("ordnet Pfade dem Kontext zu", () => {
    expect(contextForPath("/")).toBe("personal");
    expect(contextForPath("/cert/abc/exam")).toBe("personal");
    expect(contextForPath("/company")).toBe("company");
    expect(contextForPath("/company/anything")).toBe("company");
    expect(contextForPath("/admin")).toBe("admin");
    expect(contextForPath("/admin/ui")).toBe("admin");
    expect(contextForPath("/administrator")).toBe("personal");
  });
});

describe("isPublicPath", () => {
  it("kennt die Seiten ohne Shell", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/invite/abc")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});

describe("navItems / isNavActive", () => {
  it("zeigt Pflicht, Onboarding, Team, Anmeldung nur mit Rechten", () => {
    const base = navItems("company").map((i) => i.label);
    expect(base).not.toContain("companyMandatory");
    expect(base).not.toContain("companyTeam");
    const all = navItems("company", { canAssign: true, isCompanyAdmin: true }).map((i) => i.label);
    expect(all).toEqual(expect.arrayContaining(["companyMandatory", "companyOnboarding", "companyTeam", "companySignIn"]));
  });

  it("markiert den Firmen-Reiter über ?tab=", () => {
    const items = navItems("company", { canAssign: true, isCompanyAdmin: true });
    const results = items.find((i) => i.label === "companyResults")!;
    const paths = items.find((i) => i.label === "companyPaths")!;
    expect(isNavActive(results, "/company", null)).toBe(true);
    expect(isNavActive(results, "/company", "paths")).toBe(false);
    expect(isNavActive(paths, "/company", "paths")).toBe(true);
  });

  it("Dashboard nur auf /, Profil auch auf Unterseiten", () => {
    const [home, profile] = navItems("personal");
    expect(isNavActive(home, "/", null)).toBe(true);
    expect(isNavActive(home, "/profile", null)).toBe(false);
    expect(isNavActive(profile, "/profile", null)).toBe(true);
  });
});

describe("availableContexts", () => {
  it("Lernende sehen nur Persönlich", () => {
    expect(availableContexts({ hasCompanyAccess: false, isAdmin: false })).toEqual(["personal"]);
  });
  it("Firma und Admin nur mit den jeweiligen Rechten", () => {
    expect(availableContexts({ hasCompanyAccess: true, isAdmin: false })).toEqual(["personal", "company"]);
    expect(availableContexts({ hasCompanyAccess: false, isAdmin: true })).toEqual(["personal", "admin"]);
    expect(availableContexts({ hasCompanyAccess: true, isAdmin: true })).toEqual(["personal", "company", "admin"]);
  });
});
