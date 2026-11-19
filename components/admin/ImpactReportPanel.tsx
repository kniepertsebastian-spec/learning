import { Card } from "@/components/ui/card";
import { c_adminImpactPage } from "@/lib/i18n/components/adminImpactPage";
import { fill } from "@/lib/i18n/fill";
import type { Rate, RecallBand } from "@/lib/psrp/impact-report";
import type { ImpactReport } from "@/lib/server/psrp/impact";
import type { Locale } from "@/lib/types";

/** Wirkungsbericht (docs/roadmaps/archiv/roadmap_didaktik.md, Phase 7) für Admins: reine Anzeige der Zahlen aus lib/server/psrp/impact.ts. */
export function ImpactReportPanel({ report, locale }: { report: ImpactReport; locale: Locale }) {
  const tx = c_adminImpactPage(locale) as Record<string, string>;
  const nf = new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 1 });
  const pct = (rate: number | null) => (rate === null ? tx.tooSmall : `${nf.format(rate * 100)} %`);
  const th = "px-3 py-2 font-medium";
  const td = "px-3 py-2 tabular-nums";
  const wrap = "overflow-x-auto rounded-lg border border-border";
  const head = "border-b border-border bg-surface text-left text-xs text-subtle";

  const rateRow = (label: string, r: Rate, testId?: string) => (
    <tr key={label} className="border-b border-border last:border-0" data-testid={testId}>
      <td className="px-3 py-2">{label}</td>
      <td className={td}>{r.n}</td>
      <td className={td}>{r.hits}</td>
      <td className={td}>{pct(r.rate)}</td>
    </tr>
  );
  const recallRows = (title: string, bands: RecallBand[], prefix: string) => (
    <>
      <tr className="bg-surface text-xs font-semibold text-subtle"><td colSpan={4} className="px-3 py-1.5">{title}</td></tr>
      {bands.map((b) => (
        <tr key={`${prefix}${b.key}`} className="border-b border-border last:border-0">
          <td className="px-3 py-2">{tx[`${prefix}_${b.key}`]}</td>
          <td className={td}>{b.questions}</td>
          <td className={td}>{pct(b.actual.rate)}</td>
          <td className={td}>{b.predicted === null ? tx.tooSmall : pct(b.predicted)}</td>
        </tr>
      ))}
    </>
  );

  const c = report.calibration;
  const u = report.understanding;
  return (
    <div className="flex flex-col gap-6" data-testid="impact-report">
      <p className="max-w-3xl text-sm text-subtle">{tx.intro}</p>
      <p className="text-xs text-faint">{tx.asOf}: {report.asOf.toLocaleString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" })} UTC</p>

      <Card data-testid="impact-calibration">
        <h2 className="text-base font-semibold">{tx.calibrationTitle}</h2>
        <p className="mt-1 text-sm text-subtle">{tx.calibrationIntro}</p>
        <div className={`${wrap} mt-3`}>
          <table className="w-full text-sm">
            <thead className={head}><tr><th className={th}>{tx.bandLastScore}</th><th className={th}>{tx.colN}</th><th className={th}>{tx.colPassed}</th><th className={th}>{tx.colRate}</th></tr></thead>
            <tbody>
              {c.byLastScore.map((b) => rateRow(tx[`band_${b.key}`], b.passed))}
              {rateRow(tx.readyYes, c.byReady.ready)}
              {rateRow(tx.readyNo, c.byReady.notReady)}
              {rateRow(tx.overallPassRate, c.passRate, "impact-pass-rate")}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-subtle">{fill(tx.meanScores, c.meanLastScore.passed === null ? tx.tooSmall : `${nf.format(c.meanLastScore.passed)} %`, c.meanLastScore.failed === null ? tx.tooSmall : `${nf.format(c.meanLastScore.failed)} %`)}</p>
      </Card>

      <Card data-testid="impact-recall">
        <h2 className="text-base font-semibold">{tx.recallTitle}</h2>
        <p className="mt-1 text-sm text-subtle">{tx.recallIntro}</p>
        <div className={`${wrap} mt-3`}>
          <table className="w-full text-sm">
            <thead className={head}><tr><th className={th}>{tx.recallOverall}</th><th className={th}>{tx.colQuestions}</th><th className={th}>{tx.colActual}</th><th className={th}>{tx.colPredicted}</th></tr></thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-3 py-2">{report.recall.answered}</td>
                <td className={td}>{report.recall.overall.questions}</td>
                <td className={td}>{pct(report.recall.overall.actual.rate)}</td>
                <td className={td}>{pct(report.recall.overall.predicted)}</td>
              </tr>
              {recallRows(tx.delay, report.recall.byDelay, "delay")}
              {recallRows(tx.phi, report.recall.byPhiAtLearning, "phi")}
              {recallRows(tx.hour, report.recall.byHourAtLearning, "hour")}
            </tbody>
          </table>
        </div>
      </Card>

      <Card data-testid="impact-flags">
        <h2 className="text-base font-semibold">{tx.flagsTitle}</h2>
        <p className="mt-1 text-sm text-subtle">{tx.flagsIntro}</p>
        <div className={`${wrap} mt-3`}>
          <table className="w-full text-sm">
            <thead className={head}><tr><th className={th}>{tx.colFlag}</th><th className={th}>{tx.colWith}</th><th className={th}>{tx.colWithout}</th><th className={th}>{tx.colDiff}</th></tr></thead>
            <tbody>
              {report.flags.map((f) => (
                <tr key={f.flag} className="border-b border-border last:border-0" data-testid="impact-flag-row">
                  <td className="px-3 py-2 font-mono text-xs">{f.flag}</td>
                  <td className={td}>{f.enabled.users} · {f.enabled.reviews} · {pct(f.enabled.retention)}</td>
                  <td className={td}>{f.disabled.users} · {f.disabled.reviews} · {pct(f.disabled.retention)}</td>
                  <td className={td}>{f.differencePoints === null ? tx.tooSmall : `${f.differencePoints > 0 ? "+" : ""}${nf.format(f.differencePoints)} pp`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-subtle">{tx.flagsMissing}</p>
      </Card>

      <Card data-testid="impact-understanding">
        <h2 className="text-base font-semibold">{tx.understandingTitle}</h2>
        <p className="mt-1 text-sm text-subtle">{tx.understandingIntro}</p>
        <p className="mt-2 text-sm">{fill(tx.understandingCounts, u.counts.detected, u.counts.in_progress, u.counts.resolved, u.counts.declined)}</p>
        <p className="mt-1 text-sm">{tx.understandingResolved}: <strong>{pct(u.resolved.rate)}</strong> ({u.resolved.hits} / {u.resolved.n})</p>
        <p className="mt-1 text-sm">{fill(tx.understandingDays, u.daysToResolve.median === null ? tx.tooSmall : nf.format(u.daysToResolve.median), u.daysToResolve.mean === null ? tx.tooSmall : nf.format(u.daysToResolve.mean))}</p>
        <p className="mt-2 text-xs text-subtle">{tx.understandingDropout}</p>
      </Card>
    </div>
  );
}
