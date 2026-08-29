import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import {
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

  // Get all objectives for this certification
  const allObjectives = await db
    .select({
      objectiveId: objectives.id,
      code: objectives.code,
      title: objectives.title,
      domainId: domains.id,
      domainName: domains.name,
      domainOrder: domains.orderNum,
    })
    .from(objectives)
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certId));

  if (!allObjectives.length) {
    return NextResponse.json({ error: "Certification not found" }, { status: 404 });
  }

  // Get progress for all objectives
  const progress = await db
    .select()
    .from(objectiveProgress)
    .where(eq(objectiveProgress.userId, session.user.id));

  // Create progress map for quick lookup
  const progressMap = new Map(progress.map((p) => [p.objectiveId, p]));

  const result = allObjectives.map((obj) => {
    const prog = progressMap.get(obj.objectiveId);

    let label = "Learning";
    if (prog) {
      if (prog.status === "STRONG") label = "Strong";
      else if (prog.status === "OK") label = "Good";
      else if (prog.status === "LEARNING") label = "Learning";
    }

    return {
      objectiveId: obj.objectiveId,
      code: obj.code,
      title: obj.title,
      domainId: obj.domainId,
      domainName: obj.domainName,
      domainOrder: obj.domainOrder,
      masteryScore: prog?.masteryScore ? Number(prog.masteryScore) : 0,
      status: prog?.status || "LEARNING",
      label,
      lastAttemptAt: prog?.lastAttemptAt,
    };
  });

  return NextResponse.json(result);
}
