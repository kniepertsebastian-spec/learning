export const dynamic = "force-dynamic";

import Link from "next/link";
import { c_adminAiCostsPage } from "@/lib/i18n/components/adminAiCostsPage";
import { fill } from "@/lib/i18n/fill";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { getAiBudgetStatus } from "@/lib/server/admin/ai-cost";
import { getAiCostReport } from "@/lib/server/admin/ai-ledger";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import type { AiCostSource } from "@/lib/server/db/schema";

/**
 * KI-Kosten: die Gesamtsumme aller KI-Aufrufe der Plattform und daneben, was jeder Kurs gekostet hat. Grundlage ist das
 * Kostenbuch (lib/server/admin/ai-ledger.ts).
 */
export default async function AdminAiCostsPage() {
  await requireAdminPage("/admin/ai-costs");
  const locale = await getServerLocale();
  const de = locale === "de";
  const t = c_adminAiCostsPage(de);
  const [report, budget] = await Promise.all([getAiCostReport(), getAiBudgetStatus()]);

  // Unter einem Cent zeigt „0,00“ nichts; dort mehr Stellen.
  const usd = (value: number) =>
    value.toLocaleString(de ? "de-DE" : "en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    });
  const percent = (value: number) => (report.totalUsd > 0 ? `${((value / report.totalUsd) * 100).toLocaleString(de ? "de-DE" : "en-US", { maximumFractionDigits: 1 })} %` : "–");
  const sourceLabel: Record<AiCostSource, string> = {
    course_generation: t.sourceCourseGeneration,
    translation: t.sourceTranslation,
    workshop: t.sourceWorkshop,
    batch: t.sourceBatch,
    overview: t.sourceOverview,
    legacy_script: t.sourceLegacyScript,
    other: t.sourceOther,
  };
  const withCosts = report.courses.filter((c) => c.certificationId !== null && c.costUsd > 0).length;

  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="admin-ai-costs">
      <div>
        <h1 className="text-2xl font-semibold tracking-title sm:text-title">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-subtle">{t.intro}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t.total} value={<span data-testid="ai-costs-total">{usd(report.totalUsd)}</span>} sub={t.totalSub} />
        <StatTile label={t.courses} value={withCosts} sub={report.historicUsd > 0 ? `${t.historic}: ${usd(report.historicUsd)}` : undefined} />
        <StatTile
          label={t.budget}
          value={budget ? usd(budget.limitUsd) : "–"}
          sub={budget ? fill(t.budgetSub, usd(budget.spentUsd), usd(budget.limitUsd)) : t.noBudget}
          subTone={budget?.exceeded ? "danger" : "default"}
        />
        <StatTile label={t.bySource} value={report.bySource.length} sub={report.bySource[0] ? `${sourceLabel[report.bySource[0].source]}: ${usd(report.bySource[0].costUsd)}` : undefined} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm" data-testid="ai-costs-table">
          <caption className="sr-only">{t.byCourse}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-subtle">
              <th className="px-4 py-2">{t.course}</th>
              <th className="px-4 py-2">{t.kind}</th>
              <th className="px-4 py-2 text-right">{t.cost}</th>
              <th className="px-4 py-2 text-right">{t.share}</th>
              <th className="px-4 py-2 text-right">{t.calls}</th>
            </tr>
          </thead>
          <tbody>
            {report.courses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-subtle">{t.empty}</td>
              </tr>
            )}
            {report.courses.map((row) => (
              <tr key={row.certificationId ?? "none"} className="border-t border-border-subtle" data-testid="ai-costs-row">
                <td className="px-4 py-2 font-medium">
                  {row.certificationId === null ? (
                    <>
                      {t.noCourse}
                      <span className="mt-0.5 block text-xs font-normal text-faint">{t.noCourseHint}</span>
                    </>
                  ) : row.slug ? (
                    <Link href={`/admin/certifications/${row.slug}`} className="hover:underline">{row.name}</Link>
                  ) : (
                    row.name
                  )}
                </td>
                <td className="px-4 py-2 text-subtle">{row.kind === null ? "–" : row.kind === "internal" ? t.internal : t.general}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{usd(row.costUsd)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-subtle">{percent(row.costUsd)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-subtle">{row.calls.toLocaleString(de ? "de-DE" : "en-US")}</td>
              </tr>
            ))}
          </tbody>
          {report.courses.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="px-4 py-2" colSpan={2}>{t.total}</td>
                <td className="px-4 py-2 text-right tabular-nums">{usd(report.totalUsd)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{percent(report.totalUsd)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{report.courses.reduce((sum, c) => sum + c.calls, 0).toLocaleString(de ? "de-DE" : "en-US")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      {report.bySource.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold">{t.bySource}</h2>
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2" data-testid="ai-costs-sources">
            {report.bySource.map((row) => (
              <div key={row.source} className="flex items-baseline justify-between gap-4 border-b border-border-subtle pb-1">
                <dt className="text-subtle">{sourceLabel[row.source]}</dt>
                <dd className="tabular-nums">{usd(row.costUsd)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {report.unpricedCalls > 0 && <p className="text-xs text-warning-text">{fill(t.unpriced, report.unpricedCalls)}</p>}
      {report.byokUsd > 0 && <p className="text-xs text-faint">{fill(t.byok, usd(report.byokUsd))}</p>}
      <p className="text-xs text-faint">{t.footnote}</p>
    </div>
  );
}
