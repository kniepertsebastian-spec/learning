import { c_domainActivityTrends } from "@/lib/i18n/components/domainActivityTrends";
import type { Locale } from "@/lib/types";
import type { DomainActivityTrend } from "@/lib/server/analytics/learner-activity";

/**
 * R3 (roadmap.md): "Trends ... nach Domain/Objective aufschlüsseln" - siehe
 * getActivityTrendsByDomain() für die Domain-statt-Objective-Entscheidung.
 * Reine Server-Komponente wie ActivityTrends, gleiche Daten-Quelle
 * (quiz_attempts), nur nach Domain statt kursweit aggregiert.
 */
export function DomainActivityTrends({
  locale,
  domains,
}: {
  locale: Locale;
  domains: DomainActivityTrend[];
}) {
  if (domains.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-sm font-medium">
        {c_domainActivityTrends(locale).trendPerDomain30Days}
      </h2>
      <div className="flex flex-col gap-2">
        {domains.map((d) => (
          <div key={d.domainId} className="flex items-center justify-between text-sm">
            <span>{d.domainName}</span>
            <span className="text-muted">
              {d.avgAccuracy !== null ? `${d.avgAccuracy}%` : "–"} ·{" "}
              {d.activeDays} {c_domainActivityTrends(locale).activeDays}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
