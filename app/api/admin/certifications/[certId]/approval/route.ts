import { NextResponse } from "next/server";
import { z } from "zod";
import { describeChanges, getApprovalStatus, listApprovals } from "@/lib/server/approvals/service";
import { requireAdminApi } from "@/lib/server/auth-guards";

export const dynamic = "force-dynamic";

/** Betreiber: Freigabestand eines Kurses (aktuell oder „geändert seit Prüfung“ mit Liste der Änderungen) und das Protokoll. */
export async function GET(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { certId } = await params;
  if (!z.string().uuid().safeParse(certId).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [status, history] = await Promise.all([getApprovalStatus(certId), listApprovals(certId)]);
  const changes = status.diff ? await describeChanges(status.diff) : null;
  return NextResponse.json({ state: status.state, approval: status.approval, baselineAt: status.baselineAt, changeCount: status.changeCount, changes, history }, { headers: { "Cache-Control": "no-store" } });
}
