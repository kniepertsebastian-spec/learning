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

  // Get all domains for this certification with their objectives
  const domainData = await db
    .select({
      domainId: domains.id,
      domainName: domains.name,
      domainOrder: domains.orderNum,
      domainWeight: domains.weightPercent,
      objectiveId: objectives.id,
    })
    .from(domains)
    .innerJoin(objectives, eq(objectives.domainId, domains.id))
    .where(eq(domains.certificationId, certId));

  if (!domainData.length) {
    return NextResponse.json({ error: "Certification not found" }, { status: 404 });
  }

  // Get progress for all touched objectives
  const allObjectiveIds = domainData.map((d) => d.objectiveId);
  const progress = await db
    .select()
    .from(objectiveProgress)
    .where(eq(objectiveProgress.userId, session.user.id));

  // Group by domain
  const domainMap = new Map<string, typeof domainData>();
  domainData.forEach((d) => {
    if (!domainMap.has(d.domainId)) {
      domainMap.set(d.domainId, []);
    }
    domainMap.get(d.domainId)!.push(d);
  });

  const domainsResult = Array.from(domainMap.entries()).map(([domainId, objectives]) => {
    const domainInfo = objectives[0];
    const domainObjectiveIds = new Set(objectives.map((o) => o.objectiveId));
    const domainProgress = progress.filter((p) => domainObjectiveIds.has(p.objectiveId));

    const total = objectives.length;
    const strong = domainProgress.filter((p) => p.status === "STRONG").length;
    const ok = domainProgress.filter((p) => p.status === "OK").length;
    const mastery = total > 0
      ? Math.round((strong * 100 + ok * 50) / (total * 100) * 100)
      : 0;

    let label = "Needs work";
    if (mastery >= 80) label = "Strong";
    else if (mastery >= 60) label = "Good";

    return {
      domainId,
      name: domainInfo.domainName,
      orderNum: domainInfo.domainOrder,
      weightPercent: domainInfo.domainWeight,
      mastery,
      label,
      totalObjectives: total,
      strongObjectives: strong,
      okObjectives: ok,
      learningObjectives: total - strong - ok,
    };
  });

  return NextResponse.json(domainsResult.sort((a, b) => a.orderNum - b.orderNum));
}
