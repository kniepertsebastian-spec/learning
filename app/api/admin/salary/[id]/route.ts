import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { deleteSalaryDataset } from "@/lib/server/salary/service";

export const dynamic = "force-dynamic";

/** Einen importierten Datensatz löschen (der neueste verbleibende gilt danach). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success || !(await deleteSalaryDataset(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordAuditEvent({ actorUserId: guard.user.id, action: "salary.deleted", targetType: "salary_dataset", targetId: id }).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
