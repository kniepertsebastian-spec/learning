import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { completionCsv, completionsByCourse, completionSeries, GRANULARITIES, type Granularity } from "@/lib/server/stats/report";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anonyme Abschluss-Statistik als JSON oder (`?format=csv`) als CSV für Präsentationen. */
export async function GET(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const url = new URL(request.url);
  const gParam = url.searchParams.get("g") as Granularity | null;
  const g: Granularity = gParam && GRANULARITIES.includes(gParam) ? gParam : "month";
  const c = url.searchParams.get("course");
  const course = c && UUID.test(c) ? c : null;
  if (url.searchParams.get("format") === "csv") {
    const csv = await completionCsv(g, course);
    return new NextResponse("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="abschluesse-${g}.csv"` } });
  }
  const [series, courses] = await Promise.all([completionSeries(g, course), completionsByCourse(course)]);
  return NextResponse.json({ granularity: g, series, courses });
}
