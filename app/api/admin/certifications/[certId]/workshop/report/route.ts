import { NextResponse } from "next/server";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { getCourseReport } from "@/lib/server/course-editor/report";

export const dynamic = "force-dynamic";

/** Qualitätsbericht: Struktur, Abdeckung der offiziellen Lernziele, Verbesserungspotenzial. */
export async function GET(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId }) => NextResponse.json(await getCourseReport(certId)));
}
