import { NextResponse } from "next/server";
import { isValidSourceRef } from "@/lib/course-generation/source-refs";
import { z, ZodError } from "zod";
import { checkCourseGenerationRateLimit } from "@/lib/server/admin/rate-limit";
import { requireAdminApi } from "@/lib/server/auth-guards";
import {
  createCourseGenerationJob,
  DuplicateCourseGenerationJobError,
  isTerminalCourseGenerationStatus,
  lastActivityByJob,
  listCourseGenerationJobs,
  STALE_AFTER_MS,
} from "@/lib/server/course-generation/job-service";
import {
  isCourseGenerationJobActive,
  recoverStaleCourseGenerationJobsNow,
  startCourseGenerationJob,
} from "@/lib/server/course-generation/runner";
import type { CourseGenerationJobStatus } from "@/lib/server/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Höchstzahl Quellen je Auftrag (Zertifikate haben oft viele offizielle Seiten: Prüfungsleitfaden, PDF, Dienste-Liste …). */
const MAX_SOURCE_URLS = 30;

const createJobSchema = z.object({
  courseTitle: z.string().min(1).max(200),
  courseDescription: z.string().min(1).max(2000),
  language: z.enum(["de", "en"]),
  courseType: z.enum(["certification", "custom"]).default("certification"),
  /** Pflicht beim Zertifikatskurs; beim individuellen Training optional (Standard: „Individuell“). */
  provider: z.string().trim().max(100).default(""),
  certificationVersion: z.string().min(1).max(50).optional(),
  sourceUrls: z.array(z.string().refine(isValidSourceRef, "Ungültige Quelle (Adresse oder hochgeladene Datei erwartet).")).min(1).max(MAX_SOURCE_URLS),
  autoPublish: z.boolean().default(false),
  initialCostLimitUsd: z.number().min(0.1).max(1000).default(2),
  absoluteCostLimitUsd: z.number().min(0.1).max(1000).default(5),
  categoryId: z.string().uuid().optional(),
  shortCode: z.string().trim().min(1).max(6).optional(),
  blueprintProvider: z.enum(["anthropic-sonnet", "claude-routine-sonnet"]).default("anthropic-sonnet"),
}).refine((v) => v.courseType === "custom" || v.provider.length > 0, { message: "Anbieter ist beim Zertifikatskurs Pflicht.", path: ["provider"] });

/**
 * course_generation.md Abschnitt 7: Admin-API.
 * GET: letzte Aufträge (für ein einfaches Verlaufs-Panel in der Admin-UI).
 */
export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  // Zusätzlich zum Watchdog: verwaiste Aufträge fortsetzen, sobald jemand die Liste ansieht (höchstens einmal je Minute).
  await recoverStaleCourseGenerationJobsNow();
  const listed = await listCourseGenerationJobs(10);
  const activity = await lastActivityByJob(listed.filter((j) => !isTerminalCourseGenerationStatus(j.status as CourseGenerationJobStatus)).map((j) => j.id));
  const now = Date.now();
  // Letztes Lebenszeichen (Auftrag oder eines seiner Lernziele) und ob der Auftrag hängt: läuft laut Status, aber seit
  // STALE_AFTER_MS ohne Lebenszeichen. `active`: in diesem Serverprozess arbeitet tatsächlich ein Worker daran.
  const jobs = listed.map((job) => {
    const objectiveActivity = activity.get(job.id);
    const lastActivityAt = objectiveActivity && objectiveActivity > job.updatedAt ? objectiveActivity : job.updatedAt;
    const running = !isTerminalCourseGenerationStatus(job.status as CourseGenerationJobStatus);
    return {
      ...job,
      lastActivityAt,
      active: isCourseGenerationJobActive(job.id),
      stale: running && now - lastActivityAt.getTime() > STALE_AFTER_MS,
    };
  });
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

  const rateLimit = checkCourseGenerationRateLimit(guard.user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Kursgenerierungen. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

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
        { error: `Ungültige Anfrage: ${describeIssues(error)}`, details: error.issues },
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
      provider: input.provider || (input.language === "de" ? "Individuell" : "Custom"),
      certificationVersion: input.certificationVersion,
      courseType: input.courseType,
      sourceUrls: input.sourceUrls,
      autoPublish: input.autoPublish,
      initialCostLimitUsd: input.initialCostLimitUsd,
      absoluteCostLimitUsd: input.absoluteCostLimitUsd,
      blueprintProvider: input.blueprintProvider,
      categoryId: input.categoryId,
      shortCode: input.shortCode,
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

/** Verständlich, welches Feld nicht passt (bei Quellen mit der Zeilennummer der fehlerhaften Adresse). */
function describeIssues(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const [field, index] = issue.path;
      if (field === "sourceUrls" && typeof index === "number") return `Quelle in Zeile ${index + 1} ist keine gültige Adresse`;
      if (field === "sourceUrls" && issue.code === "too_big") return `höchstens ${MAX_SOURCE_URLS} Quellen`;
      return `${String(field ?? "Eingabe")}: ${issue.message}`;
    })
    .join("; ");
}
