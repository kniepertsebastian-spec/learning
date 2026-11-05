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
  const percent = (value: number) => {
    if (report.totalUsd <= 0) return "–";
    const share = (value / report.totalUsd) * 100;
    if (share > 0 && share < 0.1) return `< ${(0.1).toLocaleString(de ? "de-DE" : "en-US")} %`;
    return `${share.toLocaleString(de ? "de-DE" : "en-US", { maximumFractionDigits: 1 })} %`;
  };
  const sourceLabel: Record<AiCostSource, string> = {
    course_generation: t.sourceCourseGeneration,
    translation: t.sourceTranslation,
    workshop: t.sourceWorkshop,
    batch: t.sourceBatch,
    overview: t.sourceOverview,
    legacy_script: t.sourceLegacyScript,
    other: t.sourceOther,
  };
  const tokens = (value: number) => (value === 0 ? "–" : value.toLocaleString(de ? "de-DE" : "en-US"));
  const stepLabel: Record<string, string> = {
    blueprint: t.stepBlueprint,
    objective: t.stepObjective,
    repair: t.stepRepair,
    questions_top_up: t.stepQuestionsTopUp,
    tagging: t.stepTagging,
    tagging_batch: t.stepTaggingBatch,
    prerequisites: t.stepPrerequisites,
    cheat_sheets: t.stepCheatSheets,
    remediation: t.stepRemediation,
    career: t.stepCareer,
    rationales: t.stepRationales,
  };
  const real = report.courses.filter((c) => c.certificationId !== null && c.costUsd > 0);
  const costliest = real[0];

  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="admin-ai-costs">
      <div>
        <h1 className="text-2xl font-semibold tracking-title sm:text-title">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-subtle">{t.intro}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t.total} value={<span data-testid="ai-costs-total">{usd(report.totalUsd)}</span>} sub={report.historicUsd > 0 ? `${t.totalSub} · ${t.historic}: ${usd(report.historicUsd)}` : t.totalSub} />
        <StatTile label={t.costliest} value={costliest ? usd(costliest.costUsd) : "–"} sub={costliest ? `${costliest.name} · ${fill(t.ofCourses, real.length)}` : t.empty} />
        <StatTile
          label={t.budget}
          value={budget ? usd(budget.limitUsd) : "–"}
          sub={budget ? fill(t.budgetSub, usd(budget.spentUsd), usd(budget.limitUsd)) : t.noBudget}
          subTone={budget?.exceeded ? "danger" : "default"}
        />
        <StatTile label={t.largestOrigin} value={report.bySource[0] ? usd(report.bySource[0].costUsd) : "–"} sub={report.bySource[0] ? sourceLabel[report.bySource[0].source] : undefined} />
      </div>

      <Card className="p-0">
        <table className="w-full text-left text-sm" data-testid="ai-costs-table">
          <caption className="sr-only">{t.byCourse}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-subtle">
              <th className="px-4 py-2">{t.course}</th>
              <th className="hidden px-4 py-2 sm:table-cell">{t.kind}</th>
              <th className="px-4 py-2 text-right">{t.cost}</th>
              <th className="hidden px-4 py-2 text-right sm:table-cell">{t.share}</th>
              <th className="hidden px-4 py-2 text-right sm:table-cell">{t.calls}</th>
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
                <td className="hidden px-4 py-2 text-subtle sm:table-cell">{row.kind === null ? "–" : row.kind === "internal" ? t.internal : t.general}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums whitespace-nowrap">{usd(row.costUsd)}</td>
                <td className="hidden px-4 py-2 text-right tabular-nums whitespace-nowrap text-subtle sm:table-cell">{percent(row.costUsd)}</td>
                <td className="hidden px-4 py-2 text-right tabular-nums text-subtle sm:table-cell">{row.calls.toLocaleString(de ? "de-DE" : "en-US")}</td>
              </tr>
            ))}
          </tbody>
          {report.courses.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="px-4 py-2">{t.total}</td>
                <td className="hidden px-4 py-2 sm:table-cell" />
                <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{usd(report.totalUsd)}</td>
                <td className="hidden px-4 py-2 text-right tabular-nums whitespace-nowrap sm:table-cell">{percent(report.totalUsd)}</td>
                <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">{report.courses.reduce((sum, c) => sum + c.calls, 0).toLocaleString(de ? "de-DE" : "en-US")}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      {report.bySteps.length > 0 && (
        <Card className="p-0">
          <table className="w-full text-left text-sm" data-testid="ai-costs-steps">
            <caption className="px-4 pt-4 text-left text-sm font-semibold">{t.bySteps}</caption>
            <thead>
              <tr className="border-b border-border text-xs text-subtle">
                <th className="px-4 py-2">{t.step}</th>
                <th className="px-4 py-2 text-right">{t.cost}</th>
                <th className="hidden px-4 py-2 text-right sm:table-cell">{t.share}</th>
                <th className="hidden px-4 py-2 text-right sm:table-cell">{t.calls}</th>
                <th className="hidden px-4 py-2 text-right md:table-cell">{t.perCall}</th>
                <th className="hidden px-4 py-2 text-right md:table-cell">{t.promptTokens}</th>
                <th className="hidden px-4 py-2 text-right md:table-cell">{t.completionTokens}</th>
              </tr>
            </thead>
            <tbody>
              {report.bySteps.map((row) => (
                <tr key={`${row.source}/${row.detail ?? ""}`} className="border-t border-border-subtle" data-testid="ai-costs-step">
                  <td className="px-4 py-2">
                    {sourceLabel[row.source]}
                    {row.detail && <span className="block text-xs text-subtle">{stepLabel[row.detail] ?? row.detail}</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums whitespace-nowrap">{usd(row.costUsd)}</td>
                  <td className="hidden px-4 py-2 text-right tabular-nums whitespace-nowrap text-subtle sm:table-cell">{percent(row.costUsd)}</td>
                  <td className="hidden px-4 py-2 text-right tabular-nums text-subtle sm:table-cell">{row.calls.toLocaleString(de ? "de-DE" : "en-US")}</td>
                  <td className="hidden px-4 py-2 text-right tabular-nums whitespace-nowrap text-subtle md:table-cell">{row.calls > 0 ? usd(row.costUsd / row.calls) : "–"}</td>
                  <td className="hidden px-4 py-2 text-right tabular-nums whitespace-nowrap text-subtle md:table-cell">
                    {tokens(row.promptTokens)}
                    {row.cachedTokens > 0 && <span className="block text-xs text-faint">{fill(t.cached, tokens(row.cachedTokens))}</span>}
                  </td>
                  <td className="hidden px-4 py-2 text-right tabular-nums whitespace-nowrap text-subtle md:table-cell">{tokens(row.completionTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 pb-4 pt-2 text-xs text-faint">{t.stepsHint}</p>
        </Card>
      )}

      {report.unpricedCalls > 0 && <p className="text-xs text-warning-text">{fill(t.unpriced, report.unpricedCalls)}</p>}
      {report.byokUsd > 0 && <p className="text-xs text-faint">{fill(t.byok, usd(report.byokUsd))}</p>}
      <p className="text-xs text-faint">{t.footnote}</p>
    </div>
  );
}
