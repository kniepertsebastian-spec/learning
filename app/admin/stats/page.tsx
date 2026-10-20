export const dynamic = "force-dynamic";

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
  const gLabel: Record<Granularity, string> = { week: de ? "Woche" : "Week", month: de ? "Monat" : "Month", year: de ? "Jahr" : "Year" };
  const fmt = (v: number | null, unit: string) => (v === null ? "–" : `${v.toLocaleString(de ? "de-DE" : "en-GB")} ${unit}`);
  const hours = (min: number | null) => (min === null ? null : Math.round((min / 60) * 10) / 10);
  const csv = `/api/admin/stats/completions?format=csv&g=${g}${course ? `&course=${course}` : ""}`;

  return (
    <div className="flex flex-1 flex-col gap-6" data-testid="admin-stats">
      <div>
        <Link href="/admin" className="text-sm text-link hover:underline">
          ← Admin
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{de ? "Abschluss-Statistik" : "Completion statistics"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-subtle">
          {de
            ? `Anonym: je Abschluss nur Kurs, Tag, Dauer und aktive Lernzeit, ohne Bezug zur Person. Gezählt wird das erste Bestehen der Abschlussprüfung und gesondert das erste Zertifikat je Person und Kurs. Dauerwerte erscheinen ab ${MIN_GROUP} Abschlüssen.`
            : `Anonymous: per completion only course, day, duration and active learning time, never linked to a person. Counts the first pass of the final exam and, separately, the first certificate per person and course. Durations appear from ${MIN_GROUP} completions.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin/stats" className="flex items-center gap-2 text-sm">
          <input type="hidden" name="g" value={g} />
          <label htmlFor="course" className="text-subtle">{de ? "Kurs" : "Course"}</label>
          <select id="course" name="course" defaultValue={course ?? ""} className="h-9 rounded-md border border-border-strong bg-control px-2 text-sm">
            <option value="">{de ? "Alle Kurse" : "All courses"}</option>
            {courses.filter((c) => c.certificationId).map((c) => (
              <option key={c.certificationId!} value={c.certificationId!}>{c.courseName}</option>
            ))}
          </select>
          <button type="submit" className="h-9 rounded-md border border-border-strong bg-control px-3 text-sm font-medium hover:bg-surface-2">{de ? "Anzeigen" : "Show"}</button>
        </form>
        <div className="inline-flex gap-1 rounded-lg border border-border-subtle bg-surface-inset p-1" role="group" aria-label={de ? "Zeitraster" : "Interval"}>
          {GRANULARITIES.map((x) => (
            <Link key={x} href={href({ g: x })} aria-current={x === g ? "true" : undefined} className={cn("flex h-8 items-center rounded-md px-3 text-[13px] font-medium", x === g ? "bg-surface-2 text-foreground" : "text-subtle hover:text-foreground")}>
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
        <StatTile label={de ? "Abschlussprüfung bestanden, gesamt" : "Final exam passed, total"} value={sum("final_exam_passed", "total")} sub={`${sum("final_exam_passed", "lastMonth")} ${de ? "in 30 Tagen" : "in 30 days"}`} />
        <StatTile label={de ? "Letzte 7 Tage" : "Last 7 days"} value={sum("final_exam_passed", "lastWeek")} sub={`${sum("final_exam_passed", "lastYear")} ${de ? "in 365 Tagen" : "in 365 days"}`} />
        <StatTile label={de ? "Zertifikat ausgestellt, gesamt" : "Certificate issued, total"} value={sum("certified", "total")} sub={`${sum("certified", "lastMonth")} ${de ? "in 30 Tagen" : "in 30 days"}`} />
        <StatTile label={de ? "Zertifikate, letzte 7 Tage" : "Certificates, last 7 days"} value={sum("certified", "lastWeek")} sub={`${sum("certified", "lastYear")} ${de ? "in 365 Tagen" : "in 365 days"}`} />
      </div>

      <Card>
        <CompletionChart periods={series} granularity={g} locale={locale} title={de ? `Abschlüsse je ${gLabel[g]}` : `Completions per ${gLabel[g].toLowerCase()}`} />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm" data-testid="stats-table">
          <thead>
            <tr className="border-b border-border text-xs text-subtle">
              <th className="px-4 py-2">{de ? "Kurs" : "Course"}</th>
              <th className="px-4 py-2">{de ? "Art" : "Kind"}</th>
              <th className="px-4 py-2 text-right">{de ? "Gesamt" : "Total"}</th>
              <th className="px-4 py-2 text-right">{de ? "7 / 30 / 365 Tage" : "7 / 30 / 365 days"}</th>
              <th className="px-4 py-2 text-right">{de ? "Dauer Median (Mitte 50 %)" : "Duration median (middle 50%)"}</th>
              <th className="px-4 py-2 text-right">{de ? "Dauer Ø" : "Duration mean"}</th>
              <th className="px-4 py-2 text-right">{de ? "Aktive Lernzeit Median / Ø" : "Active time median / mean"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-subtle">{de ? "Noch keine Abschlüsse erfasst." : "No completions recorded yet."}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.certificationId}-${r.courseName}-${r.kind}`} className="border-t border-border-subtle">
                <td className="px-4 py-2 font-medium">{r.courseName}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("h-2.5 w-2.5 rounded-sm", r.kind === "certified" ? "bg-chart-2" : "bg-chart-1")} aria-hidden="true" />
                    {r.kind === "certified" ? (de ? "Zertifikat" : "Certificate") : de ? "Abschlussprüfung" : "Final exam"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.total}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.lastWeek} / {r.lastMonth} / {r.lastYear}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.medianDays === null ? <span className="text-faint">{de ? `ab ${MIN_GROUP}` : `from ${MIN_GROUP}`}</span> : `${fmt(r.medianDays, de ? "Tage" : "days")} (${r.p25Days}–${r.p75Days})`}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt(r.meanDays, de ? "Tage" : "days")}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.medianActiveMinutes === null ? <span className="text-faint">{r.nActive < MIN_GROUP ? (de ? `${r.nActive} gemessen` : `${r.nActive} measured`) : "–"}</span> : `${fmt(hours(r.medianActiveMinutes), "h")} / ${fmt(hours(r.meanActiveMinutes), "h")}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-faint">
        {de
          ? "Dauer: angefangene Kalendertage vom ersten Lernen im Kurs bis zum Abschluss. Aktive Lernzeit: gemessen nur bei sichtbarem Tab und Aktivität in den letzten 2 Minuten; fehlt, wenn jemand schon vor Einführung der Messung im Kurs gelernt hat."
          : "Duration: started calendar days from first learning in the course until completion. Active time: measured only while the tab is visible and the person was active in the last 2 minutes; missing if someone learned in the course before measuring started."}
      </p>
    </div>
  );
}
