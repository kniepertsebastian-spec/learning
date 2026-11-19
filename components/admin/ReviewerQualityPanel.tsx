import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { c_reviewerQuality } from "@/lib/i18n/components/reviewerQuality";
import { fill } from "@/lib/i18n/fill";
import type { QualityMetric } from "@/lib/reviewers/quality";
import type { QualityReport } from "@/lib/server/reviewers/quality";
import type { SecondReviewOverview } from "@/lib/server/reviewers/second-review";
import type { Locale } from "@/lib/types";

const nf = (locale: Locale, value: number) => new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 1 }).format(value);
const day = (date: Date, locale: Locale) => date.toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" });

/**
 * Qualität im Betrieb für Admins (docs/roadmaps/archiv/roadmap_pruefer.md, Phase 6): Kennzahlen je Prüfer im Vergleich zum Durchschnitt, Wiedervorlage und die
 * Abweichungen der Zweitprüfung. Reine Anzeige; die Daten kommen aus lib/server/reviewers/quality.ts und second-review.ts. Nur auf der Admin-Seite eingebunden.
 */
export function ReviewerQualityPanel({ report, second, locale }: { report: QualityReport; second: SecondReviewOverview; locale: Locale }) {
  const tx = c_reviewerQuality(locale);
  const metricLabel: Record<QualityMetric, string> = { reports: tx.metricReports, variantOutliers: tx.metricVariantOutliers, conceptStruggles: tx.metricConceptStruggles };
  const th = "px-3 py-2 font-medium";
  return (
    <section className="flex flex-col gap-4" data-testid="reviewer-quality">
      <div>
        <h2 className="text-lg font-semibold">{tx.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-subtle">{tx.intro}</p>
      </div>

      {report.reviewers.length === 0 ? (
        <p className="text-sm text-subtle" data-testid="quality-empty">{tx.noData}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm" data-testid="quality-table">
            <thead className="border-b border-border bg-surface text-xs text-subtle">
              <tr>
                <th className={th}>{tx.colReviewer}</th>
                <th className={th}>{tx.colApprovals}</th>
                <th className={th}>{tx.colQuestions}</th>
                <th className={th}>{tx.colReports}</th>
                <th className={th}>{tx.colVariants}</th>
                <th className={th}>{tx.colConcepts}</th>
                <th className={th}>{tx.colRatio}</th>
                <th className={th}>{tx.colNotice}</th>
              </tr>
            </thead>
            <tbody>
              {report.reviewers.map((r) => (
                <tr key={r.key} className="border-b border-border last:border-0" data-testid="quality-row">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 tabular-nums">{r.approvals}</td>
                  <td className="px-3 py-2 tabular-nums">{r.questions}</td>
                  <td className="px-3 py-2 tabular-nums">{nf(locale, r.rates.reports)}</td>
                  <td className="px-3 py-2 tabular-nums">{nf(locale, r.rates.variantOutliers)}</td>
                  <td className="px-3 py-2 tabular-nums">{nf(locale, r.rates.conceptStruggles)}</td>
                  <td className="px-3 py-2 tabular-nums">{r.ratios.reports === null ? "–" : `${nf(locale, r.ratios.reports)}×`}</td>
                  <td className="px-3 py-2">
                    {r.noticeable.length > 0 && (
                      <span className="flex items-center gap-1.5 text-warning-text" data-testid="quality-notice">
                        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {fill(tx.noticeText, r.noticeable.map((m) => metricLabel[m]).join(", "))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-surface text-xs text-subtle">
              <tr>
                <td className="px-3 py-2 font-medium">{tx.average}</td>
                <td className="px-3 py-2 tabular-nums">{report.totals.approvals}</td>
                <td className="px-3 py-2 tabular-nums">{report.totals.questions}</td>
                <td className="px-3 py-2 tabular-nums">{nf(locale, report.averages.reports)}</td>
                <td className="px-3 py-2 tabular-nums">{nf(locale, report.averages.variantOutliers)}</td>
                <td className="px-3 py-2 tabular-nums">{nf(locale, report.averages.conceptStruggles)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-subtle">{fill(tx.noticeFactor, nf(locale, report.factor))}</p>

      <Card data-testid="quality-recheck">
        <h3 className="text-base font-semibold">{tx.recheckTitle}</h3>
        {report.recheck.length === 0 ? (
          <p className="mt-1 text-sm text-subtle">{tx.recheckNone}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-subtle">{tx.recheckText}</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {report.recheck.map((e) => (
                <li key={e.certificationId} data-testid="quality-recheck-row">{fill(tx.recheckRow, e.courseName, day(e.approvedAt, locale), e.sourceTitle, day(e.sourceRegisteredAt, locale))}</li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card data-testid="quality-second">
        <h3 className="text-base font-semibold">{tx.secondTitle}</h3>
        <p className="mt-1 text-sm text-subtle">{tx.secondIntro}</p>
        <p className="mt-2 text-sm" data-testid="quality-second-stats">{fill(tx.secondStats, second.agreed, second.pending, second.unassigned)}</p>
        {second.deviations.length === 0 ? (
          <p className="mt-2 text-sm text-subtle">{tx.secondNoDeviations}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {second.deviations.map((d) => (
              <li key={d.id} className="rounded-lg border border-warning/40 bg-warning-soft p-3" data-testid="quality-deviation">
                <p className="font-medium text-warning-text">{fill(tx.secondDeviation, d.courseName, d.versionLabel, d.questionHumanId)}</p>
                {d.comment && <p className="mt-1">{d.comment}</p>}
                {d.secondReviewerName && <p className="mt-1 text-xs text-subtle">{fill(tx.secondBy, d.secondReviewerName)}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
