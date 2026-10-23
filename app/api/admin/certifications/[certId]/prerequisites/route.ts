import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { listDraftPrerequisites, prerequisiteCounts } from "@/lib/server/prerequisites/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/certifications/:certId/prerequisites - vorgeschlagene Voraussetzungen zur Freigabe in der Werkstatt. */
export async function GET(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  const [drafts, counts] = await Promise.all([listDraftPrerequisites(certId), prerequisiteCounts(certId)]);
  return NextResponse.json({ drafts, counts }, { headers: { "Cache-Control": "no-store" } });
}
