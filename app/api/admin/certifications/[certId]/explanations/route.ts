import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { explanationCounts, listDraftExplanations } from "@/lib/server/explanations/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/certifications/:certId/explanations - Entwürfe der Alternativerklärungen zur Freigabe in der Werkstatt. */
export async function GET(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  const [drafts, counts] = await Promise.all([listDraftExplanations(certId), explanationCounts(certId)]);
  return NextResponse.json({ drafts, counts }, { headers: { "Cache-Control": "no-store" } });
}
