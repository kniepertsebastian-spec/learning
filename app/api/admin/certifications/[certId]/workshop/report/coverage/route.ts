import { NextResponse } from "next/server";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { CoverageRefreshError, getCourseReport, refreshCoverage } from "@/lib/server/course-editor/report";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** „Quelle prüfen“: die Quellen des Erzeugungsauftrags neu abrufen und die offiziellen Lernziele neu erkennen. */
export async function POST(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId, audit }) => {
    try {
      await refreshCoverage(certId);
    } catch (error) {
      if (error instanceof CoverageRefreshError) return NextResponse.json({ error: error.message }, { status: 422 });
      throw error;
    }
    await audit("course.coverage_checked", "certification", certId);
    return NextResponse.json(await getCourseReport(certId));
  });
}
