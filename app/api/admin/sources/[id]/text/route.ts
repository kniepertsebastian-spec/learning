import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { getSourcePages } from "@/lib/server/admin/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/sources/:id/text - R1.3: geordneter, extrahierter Seitentext
 * für die "Originalquelle und extrahierte Struktur nebeneinander"-Ansicht in
 * der Review-Oberfläche.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const pages = await getSourcePages(id);
  return NextResponse.json({ pages }, { headers: { "Cache-Control": "no-store" } });
}
