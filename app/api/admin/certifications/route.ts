import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { getCertificationsWithStats } from "@/lib/server/admin/stats";

export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  try {
    const results = await getCertificationsWithStats();
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching certifications:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
