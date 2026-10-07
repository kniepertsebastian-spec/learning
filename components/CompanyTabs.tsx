import Link from "next/link";

export type CompanyTab = { id: string; label: string; badge?: number; badgeTitle?: string };

/**
 * Reiter des Firmenbereichs. Jeder Reiter hat eine eigene Adresse (`/company?tab=…`): Neuladen, Zurück-Taste und
 * Links bleiben dort, wo man war. Die Zahl am Reiter zeigt, was Aufmerksamkeit braucht. Auf dem Handy scrollt die
 * Leiste seitwärts, die Seite selbst nicht.
 */
export function CompanyTabs({ tabs, active, ariaLabel }: { tabs: CompanyTab[]; active: string; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-testid="company-tabs">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.id === "status" ? "/company" : `/company?tab=${tab.id}`}
                aria-current={current ? "page" : undefined}
                data-testid={`company-tab-${tab.id}`}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium -mb-px ${
                  current ? "border-accent text-accent" : "border-transparent text-foreground/70 hover:border-border hover:text-foreground"
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
                    title={tab.badgeTitle}
                    data-testid={`company-tab-badge-${tab.id}`}
                  >
                    {tab.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
