import { NextResponse } from "next/server";
import { STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { listCompanyStatus } from "@/lib/server/company/status";

export const dynamic = "force-dynamic";

/**
 * Firmen-API (Phase 1): Status, Datum und Frist der Zuweisungen der EIGENEN
 * Organisation - sonst nichts. Erreichbar für Firmen-Admin und Mentor.
 */
export async function GET() {
  const guard = await requireCompanyApi(STATUS_VIEW_ROLES);
  if (!guard.ok) return guard.response;

  const entries = await listCompanyStatus(guard.membership.organizationId);
  return NextResponse.json(
    {
      organization: { name: guard.membership.organizationName },
      role: guard.membership.role,
      entries,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
