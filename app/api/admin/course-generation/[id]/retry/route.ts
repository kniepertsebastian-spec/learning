import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { getCourseGenerationJob, updateCourseGenerationJob } from "@/lib/server/course-generation/job-service";
import {
  isCourseGenerationJobActive,
  startCourseGenerationJob,
  startCourseGenerationPublish,
} from "@/lib/server/course-generation/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RETRYABLE_STATUSES = new Set([
  "preflight_failed",
  "canary_failed",
  "circuit_breaker_open",
  "cost_limit_reached",
  "failed",
  "package_ready",
]);

/**
 * course_generation.md Abschnitt 7 + 11: "erneutes Ausführen setzt dank
 * Idempotenz beim nächsten unfertigen Objective fort" - für einen
 * `package_ready`-Job (autoPublish=false) bedeutet "retry" stattdessen die
 * manuelle Freigabe/den Import des bereits fertigen Pakets (siehe
 * publishPreparedCourseGenerationPackage in worker.ts).
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
  if (isCourseGenerationJobActive(id)) {
    return NextResponse.json({ error: "Auftrag läuft bereits." }, { status: 409 });
  }
  if (!RETRYABLE_STATUSES.has(job.status)) {
    return NextResponse.json(
      { error: `Auftrag im Status "${job.status}" kann nicht erneut versucht werden.` },
      { status: 409 },
    );
  }

  if (job.status === "package_ready") {
    startCourseGenerationPublish(id);
  } else {
    await updateCourseGenerationJob(id, { errorCode: null, errorMessage: null, completedAt: null });
    startCourseGenerationJob(id);
  }

  const updated = await getCourseGenerationJob(id);
  return NextResponse.json({ job: updated }, { status: 202 });
}
