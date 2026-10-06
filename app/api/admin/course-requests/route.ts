import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { listAllCourseRequests, listCatalog } from "@/lib/server/admin/course-requests";

export const dynamic = "force-dynamic";

/** Betreiber: Kundenanfragen aller Firmen und der Prüfstatus aller Lernpfade. */
export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const [requests, catalog] = await Promise.all([listAllCourseRequests(), listCatalog()]);
  return NextResponse.json({ requests, catalog }, { headers: { "Cache-Control": "no-store" } });
}
