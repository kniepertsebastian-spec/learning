import { NextResponse } from "next/server";
import { DepartmentNotFoundError, deleteDepartment } from "@/lib/server/company/departments";
import { requireCompanyApi } from "@/lib/server/company/guard";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Löscht eine Abteilung der eigenen Firma (nur Firmen-Admin). Mitglieder bleiben ohne Abteilung. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanyApi(["company_admin"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await deleteDepartment(guard.membership.organizationId, id, guard.membership.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DepartmentNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
