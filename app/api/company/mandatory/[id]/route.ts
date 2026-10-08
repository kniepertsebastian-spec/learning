import { NextResponse } from "next/server";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { deleteMandatoryRule, RuleNotFoundError } from "@/lib/server/company/mandatory";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Löscht eine Pflichtregel der eigenen Firma (nur Firmen-Admin). Bestehende Zuweisungen bleiben. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await deleteMandatoryRule(guard.membership.organizationId, id, guard.membership.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RuleNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
