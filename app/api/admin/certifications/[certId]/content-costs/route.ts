import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { getObjectiveCostsForCertification } from "@/lib/server/admin/objective-costs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/certifications/:certId/content-costs - R6 (roadmap.md):
 * "Kosten je veröffentlichter Lesson, Mission und akzeptierter Frage",
 * aufgeschlüsselt je Objective (siehe objective-costs.ts für die
 * Zuordnungs-Entscheidung). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ certId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { certId } = await params;
  const costs = await getObjectiveCostsForCertification(certId);
  return NextResponse.json({ costs }, { headers: { "Cache-Control": "no-store" } });
}
