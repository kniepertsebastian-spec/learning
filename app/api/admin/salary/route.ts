import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { importSalaryDataset, listSalaryDatasets, SalaryImportError } from "@/lib/server/salary/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  return NextResponse.json({ datasets: await listSalaryDatasets() });
}

/** Gehaltstabelle (CSV der BA-Entgeltstatistik) importieren; Spaltenzuordnung kommt aus der Vorschau im Browser. */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const result = await importSalaryDataset(await request.json(), guard.user.id);
    await recordAuditEvent({ actorUserId: guard.user.id, action: "salary.imported", targetType: "salary_dataset", targetId: result.datasetId, metadata: { rows: result.imported } }).catch(() => {});
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof SalaryImportError) return NextResponse.json({ error: error.message }, { status: 422 });
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
