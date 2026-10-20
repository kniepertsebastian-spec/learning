import { NextResponse } from "next/server";
import { courseOverviewSchema } from "@/lib/course-overview";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { getCourseOverview, getCourseScope, saveCourseOverview } from "@/lib/server/course-overview/service";

export const dynamic = "force-dynamic";

/** Kursbeschreibung (roadmap3.md, Schritt 4) und der live gezählte Umfang des Kurses. */
export async function GET(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId }) => {
    const [overview, scope] = await Promise.all([getCourseOverview(certId), getCourseScope(certId)]);
    return NextResponse.json({ overview, scope });
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId, audit }) => {
    const overview = await saveCourseOverview(certId, courseOverviewSchema.parse(await request.json()));
    await audit("course.overview_saved", "certification", certId);
    return NextResponse.json({ overview });
  });
}
