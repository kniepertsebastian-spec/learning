import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { objectives, domains, certifications } from "@/lib/server/db/schema";
import { generateRemediationForObjective } from "@/lib/server/ai/service";
import { RemediationService } from "@/lib/server/remediation/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ objectiveId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { objectiveId } = await params;
  const db = getDb();

  try {
    // Fetch objective details
    const obj = await db
      .select({
        id: objectives.id,
        title: objectives.title,
        description: objectives.description,
        certificationName: certifications.name,
      })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .innerJoin(certifications, eq(certifications.id, domains.certificationId))
      .where(eq(objectives.id, objectiveId))
      .limit(1);

    if (!obj.length) {
      return NextResponse.json({ error: "Objective not found" }, { status: 404 });
    }

    // Generate remediation content
    const remediation = await generateRemediationForObjective(
      obj[0].certificationName,
      obj[0].title,
      obj[0].description || "",
    );

    // Create remediation session (for tracking)
    const sessionId = await RemediationService.generateRemediationSession(
      session.user.id,
      objectiveId,
    );

    return NextResponse.json({
      sessionId,
      objectiveId,
      lesson: remediation.lesson,
      questions: remediation.questions,
    });
  } catch (error) {
    console.error("Error generating remediation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
