import { NextResponse } from "next/server";
import { requireCompanyApi } from "@/lib/server/company/guard";
import { listMyPracticeTasks } from "@/lib/server/company/practice-tasks";

export const dynamic = "force-dynamic";

/** Eigene Praxisaufgaben (alle Rollen): nur zu den mir zugewiesenen Lernpfaden, nur mein eigener Stand. */
export async function GET() {
  const guard = await requireCompanyApi(["company_admin", "mentor", "learner"]);
  if (!guard.ok) return guard.response;
  const tasks = await listMyPracticeTasks(guard.membership.organizationId, guard.membership.userId);
  return NextResponse.json({ tasks }, { headers: { "Cache-Control": "no-store" } });
}
