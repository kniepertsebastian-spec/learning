import { NextResponse } from "next/server";
import { ASSIGN_ROLES } from "@/lib/server/company/access";
import { deleteFrameworkGoal } from "@/lib/server/company/framework-goals";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Entfernt einen Eintrag des Rahmenplans der eigenen Firma. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(ASSIGN_ROLES);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await deleteFrameworkGoal(guard.membership.organizationId, id, guard.membership.userId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
