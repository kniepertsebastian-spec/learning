import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import {
  createCourseGenerationJob,
  DuplicateCourseGenerationJobError,
  listCourseGenerationJobs,
} from "@/lib/server/course-generation/job-service";
import { startCourseGenerationJob } from "@/lib/server/course-generation/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createJobSchema = z.object({
  courseTitle: z.string().min(1).max(200),
  courseDescription: z.string().min(1).max(2000),
  language: z.enum(["de", "en"]),
  provider: z.string().min(1).max(100),
  certificationVersion: z.string().min(1).max(50).optional(),
  sourceUrls: z.array(z.string().url()).min(1).max(10),
  autoPublish: z.boolean().default(false),
  initialCostLimitUsd: z.number().min(0.1).max(1000).default(2),
  absoluteCostLimitUsd: z.number().min(0.1).max(1000).default(5),
  blueprintProvider: z.enum(["anthropic-sonnet", "claude-routine-sonnet"]).default("anthropic-sonnet"),
});

/**
 * course_generation.md Abschnitt 7: Admin-API.
 * GET: letzte Aufträge (für ein einfaches Verlaufs-Panel in der Admin-UI).
 */
export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const jobs = await listCourseGenerationJobs(10);
  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * course_generation.md Abschnitt 3.1: "Auftrag anlegen" - validiert, prüft
 * Duplikate, legt den Job an, startet den Hintergrundablauf, antwortet
 * SOFORT mit 202 (der Browser wartet nicht auf die Generierung).
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  let input: z.infer<typeof createJobSchema>;
  try {
    input = createJobSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Ungültige Anfrage.", details: error.issues },
        { status: 400 },
      );
    }
    throw error;
  }

  if (input.absoluteCostLimitUsd < input.initialCostLimitUsd) {
    return NextResponse.json(
      { error: "absoluteCostLimitUsd muss mindestens initialCostLimitUsd sein." },
      { status: 400 },
    );
  }

  let job;
  try {
    job = await createCourseGenerationJob({
      requestedByUserId: guard.user.id,
      courseTitle: input.courseTitle,
      courseDescription: input.courseDescription,
      language: input.language,
      provider: input.provider,
      certificationVersion: input.certificationVersion,
      sourceUrls: input.sourceUrls,
      autoPublish: input.autoPublish,
      initialCostLimitUsd: input.initialCostLimitUsd,
      absoluteCostLimitUsd: input.absoluteCostLimitUsd,
      blueprintProvider: input.blueprintProvider,
    });
  } catch (error) {
    if (error instanceof DuplicateCourseGenerationJobError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  startCourseGenerationJob(job.id);
  return NextResponse.json({ job }, { status: 202 });
}
