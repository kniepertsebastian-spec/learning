import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications, contentGenerationJobs } from "@/lib/server/db/schema";
import {
  findActiveContentGenerationJob,
  getLatestContentGenerationJob,
  startContentGenerationJob,
} from "@/lib/server/admin/content-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authenticatedCertification(certId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 } as const;

  const [certification] = await getDb()
    .select()
    .from(certifications)
    .where(eq(certifications.id, certId))
    .limit(1);
  if (!certification) return { error: "Certification not found", status: 404 } as const;
  return { certification } as const;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ certId: string }> },
) {
  const { certId } = await params;
  const result = await authenticatedCertification(certId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const job = await getLatestContentGenerationJob(certId);
  return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ certId: string }> },
) {
  const { certId } = await params;
  const result = await authenticatedCertification(certId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Reconcile a job left behind by an app restart before checking for an
  // active run. The scripts are idempotent, so an interrupted job is safe to retry.
  await getLatestContentGenerationJob(certId);
  const activeJob = await findActiveContentGenerationJob(certId);
  if (activeJob) {
    return NextResponse.json({ job: activeJob }, { status: 409 });
  }

  const [job] = await getDb()
    .insert(contentGenerationJobs)
    .values({
      certificationId: certId,
      status: "queued",
      phase: "queued",
      progress: 0,
      message: "Generierungsjob wurde eingereiht …",
    })
    .returning();

  startContentGenerationJob(job.id, certId, result.certification.slug);
  return NextResponse.json({ job }, { status: 202 });
}
