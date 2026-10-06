import { NextResponse } from "next/server";
import { z } from "zod";
import { checkInternalCourseRateLimit } from "@/lib/server/auth-rate-limit";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { listInternalCourseJobs, listInternalCourses } from "@/lib/server/company/internal-courses-list";
import {
  AiAccessUnavailableError,
  DocumentUnavailableError,
  DuplicateCourseGenerationJobError,
  startInternalCourse,
  TooManyActiveJobsError,
} from "@/lib/server/internal-courses/service";

export const dynamic = "force-dynamic";

/** Nur Firmen-Admin und Mentor. Die Firma kommt aus der Mitgliedschaft, nie aus der Anfrage. */
const ROLES = ["company_admin", "mentor"] as const;

const startSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  language: z.enum(["de", "en"]).default("de"),
});

/** Stand der Erstellung (Aufträge) und die internen Lernpfade der eigenen Firma. */
export async function GET() {
  const guard = await requireCompanyApi(ROLES);
  if (!guard.ok) return guard.response;
  const [jobs, courses] = await Promise.all([
    listInternalCourseJobs(guard.membership.organizationId),
    listInternalCourses(guard.membership.organizationId),
  ]);
  return NextResponse.json({ jobs, courses }, { headers: { "Cache-Control": "no-store" } });
}

/** Startet die KI-Erstellung eines internen Lernpfads aus einem Firmendokument. */
export async function POST(request: Request) {
  const guard = await requireCompanyApi(ROLES);
  if (!guard.ok) return guard.response;
  const { organizationId, userId } = guard.membership;

  const limit = checkInternalCourseRateLimit(organizationId);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Aufträge. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });

  try {
    const { jobId } = await startInternalCourse({ organizationId, userId, ...parsed.data });
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (error) {
    if (error instanceof DocumentUnavailableError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof AiAccessUnavailableError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof DuplicateCourseGenerationJobError) {
      return NextResponse.json({ error: "Für diesen Titel läuft schon ein Auftrag." }, { status: 409 });
    }
    if (error instanceof TooManyActiveJobsError) {
      return NextResponse.json({ error: "Es laufen schon zwei Aufträge. Bitte warten, bis einer fertig ist." }, { status: 409 });
    }
    throw error;
  }
}
