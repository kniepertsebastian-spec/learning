import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import {
  getCourseGenerationJob,
  listCourseGenerationObjectives,
} from "@/lib/server/course-generation/job-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * course_generation.md Abschnitt 7: Status-Endpunkt - die PWA pollt diesen
 * (siehe course_generation.md Abschnitt 3.1: "Fortschritt wird über Polling
 * oder Server-Sent Events angezeigt", hier per Polling wie beim bestehenden
 * ContentGenerationControl-Muster).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const job = await getCourseGenerationJob(id);
  if (!job) {
    return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  }
  const objectives = await listCourseGenerationObjectives(id);
  return NextResponse.json({ job, objectives }, { headers: { "Cache-Control": "no-store" } });
}
