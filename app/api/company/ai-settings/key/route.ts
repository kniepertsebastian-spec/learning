import { NextResponse } from "next/server";
import { removeAiKey } from "@/lib/server/company/ai-settings";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

/** Entfernt den gespeicherten eigenen Schlüssel der Firma. Nur Firmen-Admin. */
export async function DELETE() {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;
  const removed = await removeAiKey(guard.membership.organizationId, guard.membership.userId);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
