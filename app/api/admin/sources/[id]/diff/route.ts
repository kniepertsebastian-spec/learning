import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { BlueprintNotApprovableError, previewBlueprintDiff } from "@/lib/server/admin/blueprint-approval";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/sources/:id/diff - R1.5: "Added/changed/removed Domains und
 * Objectives als Diff darstellen", VOR der Freigabe - reine Vorschau, ändert
 * nichts. Nützlich unabhängig davon, ob die Quelle als "ersetzt eine andere"
 * markiert ist.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    const diff = await previewBlueprintDiff(id);
    return NextResponse.json({ diff }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BlueprintNotApprovableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
