import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { listOpenQuestionReports } from "@/lib/server/content-reports/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/certifications/:certId/content-reports - R6 (roadmap.md):
 * "Review-Queue" für gemeldete Inhalte dieser Zertifizierung. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ certId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { certId } = await params;
  const reports = await listOpenQuestionReports(certId);
  return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } });
}
