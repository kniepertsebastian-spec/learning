import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import {
  getCourseGenerationJob,
  isTerminalCourseGenerationStatus,
  updateCourseGenerationJob,
} from "@/lib/server/course-generation/job-service";
import type { CourseGenerationJobStatus } from "@/lib/server/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * course_generation.md Abschnitt 7. Setzt nur den Status - der laufende
 * Worker prüft kooperativ zwischen Batches nach (siehe checkNotCancelled()
 * in worker.ts) und bricht dort sauber ab, statt hart unterbrochen zu
 * werden (kein AbortController über die gesamte Aufrufkette).
 */
export async function POST(
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
  if (isTerminalCourseGenerationStatus(job.status as CourseGenerationJobStatus)) {
    return NextResponse.json(
      { error: `Auftrag ist bereits abgeschlossen (Status: ${job.status}).` },
      { status: 409 },
    );
  }

  await updateCourseGenerationJob(id, { status: "cancelled" });
  const updated = await getCourseGenerationJob(id);
  return NextResponse.json({ job: updated });
}
