/**
 * Kontexte der App-Shell (docs/roadmaps/ROADMAP-UI.md U2). Der Kontext folgt dem Pfad; welche Kontexte eine Person
 * überhaupt sehen darf, entscheidet der Server (app/layout.tsx) – die Seiten prüfen ihre Rechte weiterhin selbst.
 */
export type ShellContext = "personal" | "company" | "admin";

export function contextForPath(pathname: string): ShellContext {
  if (pathname === "/company" || pathname.startsWith("/company/")) return "company";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  return "personal";
}

/** Startseite des Kontexts („Dashboard“): persönlich `/`, Firma `/company`, Admin `/admin`. */
export function homePathForContext(ctx: ShellContext): string {
  return ctx === "company" ? "/company" : ctx === "admin" ? "/admin" : "/";
}

/**
 * Die Seite „darüber“ für den Zurück-Knopf: Unterseiten eines Kurses führen zum Kurs, der Kurs zum Dashboard, sonst eine
 * Ebene höher, höchstens bis zur Startseite des Kontexts. Bewusst deterministisch statt `history.back()`, damit „Zurück“
 * nach einem Reload oder einem Direktlink nicht ins Leere oder von der App weg führt.
 */
export function parentPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  if (parts[0] === "cert") return parts.length > 2 ? `/cert/${parts[1]}` : "/";
  if (parts[0] === "company" || parts[0] === "admin") return parts.length > 1 ? `/${parts[0]}` : "/";
  return parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "/";
}

/** Seiten ohne Shell: Anmeldung, Registrierung, Einladungen, Passwort-Wiederherstellung usw. */
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/resend-verification",
  "/invite",
  "/sso",
  "/confirm-company",
  "/unsubscribe",
  "/reviewer-invite",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type NavLabelKey =
  | "learn"
  | "catalog"
  | "examPlanner"
  | "certificates"
  | "career"
  | "profile"
  | "account"
  | "companyResults"
  | "companyMandatory"
  | "companyPaths"
  | "companyWork"
  | "companyOnboarding"
  | "companyDocuments"
  | "companyTeam"
  | "companySignIn"
  | "adminOverview"
  | "adminRequests"
  | "adminStats"
  | "adminAiCosts"
  | "adminSalary"
  | "adminUi"
  | "adminReviewers"
  | "reviewerCourses";

export type NavIcon =
  | "home"
  | "user"
  | "shield"
  | "chart"
  | "calendar"
  | "book"
  | "tasks"
  | "users"
  | "file"
  | "key"
  | "inbox"
  | "layers"
  | "award"
  | "settings";

export type NavItem = { href: string; label: NavLabelKey; icon: NavIcon; exact?: boolean };

export type CompanyNavOptions = { canAssign: boolean; isCompanyAdmin: boolean; /** Fachliche Prüfer sehen den Eintrag „Kurse prüfen“. */ isReviewer?: boolean };

export function navItems(context: ShellContext, opts: CompanyNavOptions = { canAssign: false, isCompanyAdmin: false }): NavItem[] {
  switch (context) {
    case "personal":
      return [
        { href: "/", label: "learn", icon: "home", exact: true },
        { href: "/catalog", label: "catalog", icon: "book" },
        { href: "/exams", label: "examPlanner", icon: "calendar" },
        { href: "/certificates", label: "certificates", icon: "award" },
        { href: "/career", label: "career", icon: "chart" },
        { href: "/profile", label: "profile", icon: "user" },
        ...(opts.isReviewer ? [{ href: "/reviewer", label: "reviewerCourses" as const, icon: "tasks" as const }] : []),
        { href: "/account", label: "account", icon: "settings" },
      ];
    case "company":
      return [
        { href: "/company", label: "companyResults", icon: "chart", exact: true },
        ...(opts.canAssign ? [{ href: "/company?tab=mandatory", label: "companyMandatory" as const, icon: "calendar" as const }] : []),
        { href: "/company?tab=paths", label: "companyPaths", icon: "book" },
        { href: "/company?tab=work", label: "companyWork", icon: "tasks" },
        ...(opts.canAssign ? [{ href: "/company?tab=onboarding", label: "companyOnboarding" as const, icon: "users" as const }] : []),
        { href: "/company/certificates", label: "certificates", icon: "award" },
        { href: "/company?tab=documents", label: "companyDocuments", icon: "file" },
        ...(opts.isCompanyAdmin ? [{ href: "/company?tab=team", label: "companyTeam" as const, icon: "users" as const }] : []),
        ...(opts.isCompanyAdmin ? [{ href: "/company?tab=sso", label: "companySignIn" as const, icon: "key" as const }] : []),
      ];
    case "admin":
      return [
        { href: "/admin", label: "adminOverview", icon: "layers", exact: true },
        { href: "/admin/requests", label: "adminRequests", icon: "inbox" },
        { href: "/admin/reviewers", label: "adminReviewers", icon: "users" },
        { href: "/admin/stats", label: "adminStats", icon: "chart" },
        { href: "/admin/ai-costs", label: "adminAiCosts", icon: "layers" },
        { href: "/admin/salary", label: "adminSalary", icon: "file" },
        { href: "/admin/ui", label: "adminUi", icon: "layers" },
      ];
  }
}

/** Ist der Eintrag für Pfad + Query aktiv? Firmen-Einträge unterscheiden sich nur durch `?tab=`. */
export function isNavActive(item: NavItem, pathname: string, tab: string | null): boolean {
  const [path, query] = item.href.split("?");
  if (query) {
    const wanted = new URLSearchParams(query).get("tab");
    return pathname === path && tab === wanted;
  }
  if (path === "/company") return pathname === "/company" && (tab === null || tab === "status");
  if (item.exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Welche Kontexte eine Person im Switcher sieht – ausschließlich aus serverseitig ermittelten Rechten. */
export function availableContexts(rights: { hasCompanyAccess: boolean; isAdmin: boolean }): ShellContext[] {
  return ["personal", ...(rights.hasCompanyAccess ? (["company"] as const) : []), ...(rights.isAdmin ? (["admin"] as const) : [])];
}
