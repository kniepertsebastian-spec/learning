import { and, asc, eq, gte, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseCompletionEvents, type CourseCompletionKind } from "@/lib/server/db/schema";

/**
 * Auswertung der anonymen Abschluss-Statistik (course_completion_events) für die Admin-Seite /admin/stats und den
 * CSV-Export. Anzahlen werden immer gezeigt; Dauerwerte (Median usw.) erst ab MIN_GROUP Abschlüssen, damit sich aus
 * einer sehr kleinen Gruppe nicht auf Einzelne schließen lässt.
 */
export const MIN_GROUP = 5;
export type Granularity = "week" | "month" | "year";
export const GRANULARITIES: Granularity[] = ["week", "month", "year"];
const WINDOW: Record<Granularity, number | null> = { week: 26, month: 24, year: null };

export type Period = { start: string; final_exam_passed: number; certified: number };
export type DurationStats = { n: number; medianDays: number | null; p25Days: number | null; p75Days: number | null; meanDays: number | null; nActive: number; medianActiveMinutes: number | null; meanActiveMinutes: number | null };
export type CourseRow = { certificationId: string | null; courseName: string; kind: CourseCompletionKind; total: number; lastWeek: number; lastMonth: number; lastYear: number } & DurationStats;

/** Beginn des Zeitraums (UTC), in dem `day` liegt: Woche ab Montag, Monat, Jahr. */
export function periodStart(day: string, g: Granularity): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (g === "year") return `${d.getUTCFullYear()}-01-01`;
  if (g === "month") return `${day.slice(0, 7)}-01`;
  const back = (d.getUTCDay() + 6) % 7; // Montag = 0
  return new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

/** Lückenlose Zeiträume von `first` bis `last` (beide als Zeitraumbeginn). */
export function periodRange(first: string, last: string, g: Granularity): string[] {
  const out: string[] = [];
  let cur = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`).getTime();
  while (cur.getTime() <= end && out.length < 1000) {
    out.push(cur.toISOString().slice(0, 10));
    if (g === "week") cur = new Date(cur.getTime() + 7 * 86_400_000);
    else if (g === "month") cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    else cur = new Date(Date.UTC(cur.getUTCFullYear() + 1, 0, 1));
  }
  return out;
}

/** Erster Tag des Fensters, das die Zeitreihe zeigt (26 Wochen, 24 Monate, alle Jahre). */
export function windowStart(g: Granularity, today: string): string | null {
  const n = WINDOW[g];
  if (n === null) return null;
  const start = periodStart(today, g);
  const d = new Date(`${start}T00:00:00Z`);
  if (g === "week") return new Date(d.getTime() - (n - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1), 1)).toISOString().slice(0, 10);
}

/** Zeitraster als SQL-Literal: nur die drei erlaubten Werte, damit GROUP BY und SELECT denselben Ausdruck sehen. */
function truncUnit(g: Granularity): SQL {
  if (!GRANULARITIES.includes(g)) throw new Error(`Ungültiges Zeitraster: ${g}`);
  return sql.raw(`'${g}'`);
}

const today = () => new Date().toISOString().slice(0, 10);
const certFilter = (certificationId: string | null | undefined): SQL | undefined => (certificationId ? eq(courseCompletionEvents.certificationId, certificationId) : undefined);

/** Abschlüsse je Zeitraum und Art (lückenlos, auch Zeiträume ohne Abschluss). */
export async function completionSeries(g: Granularity, certificationId?: string | null, now: string = today()): Promise<Period[]> {
  const from = windowStart(g, now);
  const bucket = sql<string>`to_char(date_trunc(${truncUnit(g)}, ${courseCompletionEvents.completedOn}::timestamp), 'YYYY-MM-DD')`;
  const rows = await getDb()
    .select({ start: bucket, kind: courseCompletionEvents.kind, n: sql<number>`count(*)::int` })
    .from(courseCompletionEvents)
    .where(and(certFilter(certificationId), from ? gte(courseCompletionEvents.completedOn, from) : undefined))
    .groupBy(bucket, courseCompletionEvents.kind)
    .orderBy(asc(bucket));
  const first = from ?? rows[0]?.start ?? periodStart(now, g);
  const byStart = new Map(periodRange(first, periodStart(now, g), g).map((start) => [start, { start, final_exam_passed: 0, certified: 0 } as Period]));
  for (const r of rows) {
    const p = byStart.get(r.start);
    if (p) p[r.kind] = r.n;
  }
  return [...byStart.values()];
}

/** Je Kurs und Art: Anzahl gesamt und in den letzten 7/30/365 Tagen, Dauer in Kalendertagen und aktiver Lernzeit. */
export async function completionsByCourse(certificationId?: string | null, now: string = today()): Promise<CourseRow[]> {
  const e = courseCompletionEvents;
  const since = (days: number) => sql<number>`count(*) filter (where ${e.completedOn} > ${now}::date - ${days}::int)::int`;
  const pct = (p: number, col: SQL | typeof e.calendarDays) => sql<number | null>`percentile_cont(${p}) within group (order by ${col})`;
  const rows = await getDb()
    .select({
      certificationId: e.certificationId,
      courseName: e.courseName,
      kind: e.kind,
      total: sql<number>`count(*)::int`,
      lastWeek: since(7),
      lastMonth: since(30),
      lastYear: since(365),
      medianDays: pct(0.5, e.calendarDays),
      p25Days: pct(0.25, e.calendarDays),
      p75Days: pct(0.75, e.calendarDays),
      meanDays: sql<number | null>`avg(${e.calendarDays})`,
      nActive: sql<number>`count(${e.activeMinutes})::int`,
      medianActiveMinutes: sql<number | null>`percentile_cont(0.5) within group (order by ${e.activeMinutes})`,
      meanActiveMinutes: sql<number | null>`avg(${e.activeMinutes})`,
    })
    .from(e)
    .where(certFilter(certificationId))
    .groupBy(e.certificationId, e.courseName, e.kind)
    .orderBy(asc(e.courseName), asc(e.kind));
  return rows.map((r) => suppressSmall({ ...r, n: r.total }));
}

/** Dauerwerte nur ab MIN_GROUP Abschlüssen (bzw. gemessenen Lernzeiten); Zahlen gerundet. */
export function suppressSmall<T extends DurationStats>(r: T): T {
  const num = (v: unknown, digits = 1) => (v === null || v === undefined ? null : Math.round(Number(v) * 10 ** digits) / 10 ** digits);
  const enough = r.n >= MIN_GROUP;
  const enoughActive = r.nActive >= MIN_GROUP;
  return {
    ...r,
    medianDays: enough ? num(r.medianDays) : null,
    p25Days: enough ? num(r.p25Days) : null,
    p75Days: enough ? num(r.p75Days) : null,
    meanDays: enough ? num(r.meanDays) : null,
    medianActiveMinutes: enoughActive ? num(r.medianActiveMinutes, 0) : null,
    meanActiveMinutes: enoughActive ? num(r.meanActiveMinutes, 0) : null,
  };
}

/** Kurse, die in der Statistik vorkommen (für den Filter). */
export async function statsCourses() {
  return getDb()
    .selectDistinct({ certificationId: courseCompletionEvents.certificationId, courseName: courseCompletionEvents.courseName })
    .from(courseCompletionEvents)
    .orderBy(asc(courseCompletionEvents.courseName));
}

/** CSV für Präsentationen: je Zeitraum, Kurs und Art Anzahl und Median-Dauer (Dauer erst ab MIN_GROUP). Kein Rohdatenexport. */
export async function completionCsv(g: Granularity, certificationId?: string | null): Promise<string> {
  const e = courseCompletionEvents;
  const bucket = sql<string>`to_char(date_trunc(${truncUnit(g)}, ${e.completedOn}::timestamp), 'YYYY-MM-DD')`;
  const rows = await getDb()
    .select({
      start: bucket,
      courseName: e.courseName,
      kind: e.kind,
      n: sql<number>`count(*)::int`,
      medianDays: sql<number | null>`percentile_cont(0.5) within group (order by ${e.calendarDays})`,
      nActive: sql<number>`count(${e.activeMinutes})::int`,
      medianActiveMinutes: sql<number | null>`percentile_cont(0.5) within group (order by ${e.activeMinutes})`,
    })
    .from(e)
    .where(certFilter(certificationId))
    .groupBy(bucket, e.courseName, e.kind)
    .orderBy(asc(bucket), asc(e.courseName), asc(e.kind));
  const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ["zeitraum_beginn;kurs;art;anzahl;median_tage;median_aktive_minuten"];
  for (const r of rows) {
    const days = r.n >= MIN_GROUP && r.medianDays !== null ? String(Math.round(Number(r.medianDays) * 10) / 10).replace(".", ",") : "";
    const active = r.nActive >= MIN_GROUP && r.medianActiveMinutes !== null ? String(Math.round(Number(r.medianActiveMinutes))) : "";
    lines.push([r.start, esc(r.courseName), r.kind === "certified" ? "zertifikat" : "abschlusspruefung", String(r.n), days, active].join(";"));
  }
  return lines.join("\n") + "\n";
}
