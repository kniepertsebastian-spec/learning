import { NextResponse } from "next/server";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { acceptSourceBaseline, CoverageRefreshError, getCourseReport, refreshCoverage } from "@/lib/server/course-editor/report";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * „Quelle prüfen“: die Quellen des Erzeugungsauftrags neu abrufen, die offiziellen Lernziele neu erkennen und mit dem
 * Stand bei der Kurserstellung vergleichen. `?accept=1` bestätigt den aktuellen Stand als neuen Vergleichsstand.
 */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId, audit }) => {
    try {
      if (new URL(request.url).searchParams.get("accept") === "1") {
        await acceptSourceBaseline(certId);
        await audit("course.source_baseline_accepted", "certification", certId);
        return NextResponse.json(await getCourseReport(certId));
      }
      await refreshCoverage(certId);
    } catch (error) {
      if (error instanceof CoverageRefreshError) return NextResponse.json({ error: error.message }, { status: 422 });
      throw error;
    }
    await audit("course.coverage_checked", "certification", certId);
    return NextResponse.json(await getCourseReport(certId));
  });
}
