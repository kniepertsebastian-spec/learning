export const dynamic = "force-dynamic";

import { STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { requireCompanyPage } from "@/lib/server/company/guard";
import { getServerLocale } from "@/lib/server/locale";
import type { CompanyRole } from "@/lib/server/db/schema";

const ROLE_LABELS: Record<CompanyRole, { de: string; en: string }> = {
  company_admin: { de: "Firmen-Admin", en: "Company admin" },
  mentor: { de: "Mentor", en: "Mentor" },
  learner: { de: "Lernender", en: "Learner" },
};

/**
 * Firmengerüst (Phase 1): Platzhalter. Die echte Statusansicht (Zuweisen,
 * Fortschritts-Status, Fristen) kommt in Phase 3 - bis dahin zeigt die Seite
 * nur, dass der Zugriff über den zentralen Guard funktioniert.
 */
export default async function CompanyPage() {
  const [membership, locale] = await Promise.all([
    requireCompanyPage(STATUS_VIEW_ROLES, "/company"),
    getServerLocale(),
  ]);
  const de = locale === "de";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{membership.organizationName}</h1>
        <p className="mt-1 text-sm text-foreground/70">
          {de ? "Deine Rolle: " : "Your role: "}
          <span data-testid="company-role">{ROLE_LABELS[membership.role][locale]}</span>
        </p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-medium">{de ? "Status der Lernpfade" : "Learning path status"}</h2>
        <p className="mt-2 text-sm text-foreground/70" data-testid="company-status-empty">
          {de
            ? "Noch keine Lernpfade zugewiesen. Die Statusansicht folgt in einer späteren Phase."
            : "No learning paths assigned yet. The status view follows in a later phase."}
        </p>
      </section>
    </div>
  );
}
