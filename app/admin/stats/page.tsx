export const dynamic = "force-dynamic";

import { c_adminStatsPage } from "@/lib/i18n/components/adminStatsPage";
import { fill } from "@/lib/i18n/fill";
import Link from "next/link";
import { Download } from "lucide-react";
import { CompletionChart } from "@/components/admin/stats/CompletionChart";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import { completionsByCourse, completionSeries, GRANULARITIES, MIN_GROUP, statsCourses, type CourseRow, type Granularity } from "@/lib/server/stats/report";
import { cn } from "@/lib/cn";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Anonyme Abschluss-Statistik (roadmap3.md): wie viele Menschen einen Kurs abgeschlossen haben (Abschlussprüfung
 * bestanden; Zertifikat ausgestellt gesondert), in welcher Zeit, je Woche/Monat/Jahr. Keine Personendaten.
 */
export default async function AdminStatsPage({ searchParams }: { searchParams: Promise<{ g?: string; course?: string }> }) {
  await requireAdminPage("/admin/stats");
  const locale = await getServerLocale();
  const de = locale === "de";
  const sp = await searchParams;
  const g: Granularity = GRANULARITIES.includes(sp.g as Granularity) ? (sp.g as Granularity) : "month";
  const course = sp.course && UUID.test(sp.course) ? sp.course : null;
  const [series, rows, courses] = await Promise.all([completionSeries(g, course), completionsByCourse(course), statsCourses()]);

  const sum = (kind: CourseRow["kind"], key: "total" | "lastWeek" | "lastMonth" | "lastYear") => rows.filter((r) => r.kind === kind).reduce((s, r) => s + r[key], 0);
  const href = (next: { g?: string; course?: string | null }) => {
    const p = new URLSearchParams();
    p.set("g", next.g ?? g);
    const c = next.course === undefined ? course : next.course;
    if (c) p.set("course", c);
    return `/admin/stats?${p}`;
  };
  const gLabel: Record<Granularity, string> = { week: c_adminStatsPage(de).week, month: c_adminStatsPage(de).month, year: c_adminStatsPage(de).year };
  const fmt = (v: number | null, unit: string) => (v === null ? "–" : `${v.toLocaleString(de ? "de-DE" : "en-GB")} ${unit}`);
  const hours = (min: number | null) => (min === null ? null : Math.round((min / 60) * 10) / 10);
  const csv = `/api/admin/stats/completions?format=csv&g=${g}${course ? `&course=${course}` : ""}`;

  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="admin-stats">
      <div>
        <h1 className="text-2xl font-semibold tracking-title sm:text-title">{c_adminStatsPage(de).completionStatistics}</h1>
        <p className="mt-1 text-sm"><Link href="/admin/impact" className="text-link hover:underline" data-testid="admin-impact-link">{c_adminStatsPage(de).impactReport}</Link></p>
        <p className="mt-1 max-w-3xl text-sm text-subtle">
          {fill(c_adminStatsPage(de).anonymousPerCompletionOnlyCourse, MIN_GROUP)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin/stats" className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="g" value={g} />
          <label htmlFor="course" className="text-subtle">{c_adminStatsPage(de).course}</label>
          <select id="course" name="course" defaultValue={course ?? ""} className="h-9 min-w-0 max-w-full rounded-md border border-border-strong bg-control px-2 text-sm">
            <option value="">{c_adminStatsPage(de).allCourses}</option>
            {courses.filter((c) => c.certificationId).map((c) => (
              <option key={c.certificationId!} value={c.certificationId!}>{c.courseName}</option>
            ))}
          </select>
          <button type="submit" className="h-9 rounded-md border border-border-strong bg-control px-3 text-sm font-medium hover:bg-surface-2">{c_adminStatsPage(de).show}</button>
        </form>
        <div className="inline-flex gap-1 rounded-lg border border-border-subtle bg-surface-inset p-1" role="group" aria-label={c_adminStatsPage(de).interval}>
          {GRANULARITIES.map((x) => (
            <Link key={x} href={href({ g: x })} aria-current={x === g ? "true" : undefined} className={cn("flex h-8 items-center rounded-md px-3 text-meta font-medium", x === g ? "bg-surface-2 text-foreground" : "text-subtle hover:text-foreground")}>
              {gLabel[x]}
            </Link>
          ))}
        </div>
        <a href={csv} className="ml-auto flex h-9 items-center gap-2 rounded-md border border-border-strong bg-control px-3 text-sm font-medium hover:bg-surface-2" data-testid="stats-csv">
          <Download className="h-4 w-4" aria-hidden="true" />
          CSV
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={c_adminStatsPage(de).finalExamPassedTotal} value={sum("final_exam_passed", "total")} sub={`${sum("final_exam_passed", "lastMonth")} ${c_adminStatsPage(de).in30Days}`} />
        <StatTile label={c_adminStatsPage(de).last7Days} value={sum("final_exam_passed", "lastWeek")} sub={`${sum("final_exam_passed", "lastYear")} ${c_adminStatsPage(de).in365Days}`} />
        <StatTile label={c_adminStatsPage(de).certificateIssuedTotal} value={sum("certified", "total")} sub={`${sum("certified", "lastMonth")} ${c_adminStatsPage(de).in30Days}`} />
        <StatTile label={c_adminStatsPage(de).certificatesLast7Days} value={sum("certified", "lastWeek")} sub={`${sum("certified", "lastYear")} ${c_adminStatsPage(de).in365Days}`} />
      </div>

      <Card>
        <CompletionChart periods={series} granularity={g} locale={locale} title={de ? `Abschlüsse je ${gLabel[g]}` : `Completions per ${gLabel[g].toLowerCase()}`} />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm" data-testid="stats-table">
          <thead>
            <tr className="border-b border-border text-xs text-subtle">
              <th className="px-4 py-2">{c_adminStatsPage(de).course}</th>
              <th className="px-4 py-2">{c_adminStatsPage(de).kind}</th>
              <th className="px-4 py-2 text-right">{c_adminStatsPage(de).total}</th>
              <th className="px-4 py-2 text-right">{c_adminStatsPage(de).n730365Days}</th>
              <th className="px-4 py-2 text-right">{c_adminStatsPage(de).durationMedianMiddle50}</th>
              <th className="px-4 py-2 text-right">{c_adminStatsPage(de).durationMean}</th>
              <th className="px-4 py-2 text-right">{c_adminStatsPage(de).activeTimeMedianMean}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-subtle">{c_adminStatsPage(de).noCompletionsRecordedYet}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.certificationId}-${r.courseName}-${r.kind}`} className="border-t border-border-subtle">
                <td className="px-4 py-2 font-medium">{r.courseName}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("h-2.5 w-2.5 rounded-sm", r.kind === "certified" ? "bg-chart-2" : "bg-chart-1")} aria-hidden="true" />
                    {r.kind === "certified" ? (c_adminStatsPage(de).certificate) : c_adminStatsPage(de).finalExam}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.total}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.lastWeek} / {r.lastMonth} / {r.lastYear}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.medianDays === null ? <span className="text-faint">{fill(c_adminStatsPage(de).from0, MIN_GROUP)}</span> : `${fmt(r.medianDays, c_adminStatsPage(de).days)} (${r.p25Days}–${r.p75Days})`}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt(r.meanDays, c_adminStatsPage(de).days)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.medianActiveMinutes === null ? <span className="text-faint">{r.nActive < MIN_GROUP ? (fill(c_adminStatsPage(de).n0Measured, r.nActive)) : "–"}</span> : `${fmt(hours(r.medianActiveMinutes), "h")} / ${fmt(hours(r.meanActiveMinutes), "h")}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-faint">
        {c_adminStatsPage(de).durationStartedCalendarDaysFrom}
      </p>
    </div>
  );
}
