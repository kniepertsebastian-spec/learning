import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  domains,
  objectives,
  objectiveProgress,
} from "@/lib/server/db/schema";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ certId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { certId } = await params;
  const db = getDb();

  // Verify certification exists
  const cert = await db
    .select()
    .from(certifications)
    .where(eq(certifications.id, certId))
    .limit(1);

  if (!cert.length) {
    return NextResponse.json({ error: "Certification not found" }, { status: 404 });
  }

  // Get all objectives for this certification
  const allObjectives = await db
    .select({ objectiveId: objectives.id })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certId));

  // Get progress for all objectives
  const progress = await db
    .select()
    .from(objectiveProgress)
    .where(
      and(
        eq(objectiveProgress.userId, session.user.id),
        // Match any of the objectives for this certification
      ),
    );

  // Filter to only objectives in this certification
  const objectiveIds = new Set(allObjectives.map((o) => o.objectiveId));
  const certProgress = progress.filter((p) => objectiveIds.has(p.objectiveId));

  // Calculate overall stats
  const totalObjectives = allObjectives.length;
  const completedObjectives = certProgress.filter((p) => p.status === "STRONG").length;
  const goodObjectives = certProgress.filter((p) => p.status === "OK").length;
  const overallProgress = totalObjectives > 0
    ? Math.round(((completedObjectives * 100 + goodObjectives * 50) / (totalObjectives * 100)) * 100)
    : 0;

  return NextResponse.json({
    certificationId: certId,
    certName: cert[0].name,
    overallProgress,
    totalObjectives,
    strongObjectives: completedObjectives,
    okObjectives: goodObjectives,
    learningObjectives: totalObjectives - completedObjectives - goodObjectives,
    lastUpdated: certProgress.length > 0
      ? new Date(Math.max(...certProgress.map((p) => p.lastAttemptAt?.getTime() || 0)))
      : null,
  });
}
