import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { approveBlueprintDraft, BlueprintNotApprovableError } from "@/lib/server/admin/blueprint-approval";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/sources/:id/approve - R1.3: "Blueprint freigeben", getrennt
 * vom "Entwurf speichern" (PATCH .../blueprint). Übernimmt die Domains/
 * Objectives des Drafts in die echten Tabellen, protokolliert Admin-ID und
 * Zeitpunkt (certification_sources.approvedBy/approvedAt) und sperrt die
 * Quelle danach gegen weitere Extraktionen/Korrekturen.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  try {
    const { source, applyResult, diff, staleResult } = await approveBlueprintDraft(id, guard.user.id);
    return NextResponse.json({ source, applyResult, diff, staleResult });
  } catch (error) {
    if (error instanceof BlueprintNotApprovableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Blueprint approval failed:", error);
    return NextResponse.json({ error: "Freigabe fehlgeschlagen." }, { status: 500 });
  }
}
