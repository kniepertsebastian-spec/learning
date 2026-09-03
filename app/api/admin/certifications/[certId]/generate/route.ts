import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminApi, type SessionUser } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications, contentGenerationJobs } from "@/lib/server/db/schema";
import {
  estimateGenerationWork,
  findActiveContentGenerationJob,
  getLatestContentGenerationJob,
  startContentGenerationJob,
} from "@/lib/server/admin/content-generation";
import { checkContentGenerationRateLimit } from "@/lib/server/admin/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminCertResult =
  | { error: NextResponse }
  | { certification: typeof certifications.$inferSelect; user: SessionUser };

async function adminAndCertification(certId: string): Promise<AdminCertResult> {
  const guard = await requireAdminApi();
  if (!guard.ok) return { error: guard.response };

  const [certification] = await getDb()
    .select()
    .from(certifications)
    .where(eq(certifications.id, certId))
    .limit(1);
  if (!certification) {
    return { error: NextResponse.json({ error: "Certification not found" }, { status: 404 }) };
  }
  return { certification, user: guard.user };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ certId: string }> },
) {
  const { certId } = await params;
  const result = await adminAndCertification(certId);
  if ("error" in result) return result.error;

  const [job, estimate] = await Promise.all([
    getLatestContentGenerationJob(certId),
    estimateGenerationWork(certId),
  ]);
  return NextResponse.json({ job, estimate }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ certId: string }> },
) {
  const { certId } = await params;
  const result = await adminAndCertification(certId);
  if ("error" in result) return result.error;
  const { certification, user } = result;

  const rateLimit = checkContentGenerationRateLimit(user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Zu viele Generierungsstarts. Bitte in ${rateLimit.retryAfterSeconds}s erneut versuchen.`,
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  // Reconcile a job left behind by an app restart before checking for an
  // active run. The scripts are idempotent, so an interrupted job is safe to retry.
  await getLatestContentGenerationJob(certId);
  const activeJob = await findActiveContentGenerationJob(certId);
  if (activeJob) {
    return NextResponse.json({ job: activeJob }, { status: 409 });
  }

  let job: typeof contentGenerationJobs.$inferSelect;
  try {
    [job] = await getDb()
      .insert(contentGenerationJobs)
      .values({
        certificationId: certId,
        startedByUserId: user.id,
        status: "queued",
        phase: "queued",
        progress: 0,
        message: "Generierungsjob wurde eingereiht …",
      })
      .returning();
  } catch (error) {
    // R0.3: DB-Unique-Index als eigentlicher Schutz gegen zwei fast
    // gleichzeitige Startanfragen - der findActiveContentGenerationJob-Check
    // oben ist nur der schnelle, race-anfällige Vorab-Check.
    const isUniqueViolation =
      typeof error === "object" && error !== null && "code" in error && error.code === "23505";
    if (isUniqueViolation) {
      const concurrentJob = await findActiveContentGenerationJob(certId);
      return NextResponse.json({ job: concurrentJob }, { status: 409 });
    }
    throw error;
  }

  console.log(
    `Generierungsjob ${job.id} für Zertifizierung ${certId} gestartet von Nutzer ${user.id}.`,
  );
  startContentGenerationJob(job.id, certId, certification.slug);
  return NextResponse.json({ job }, { status: 202 });
}
