import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { getCertificationsWithStats } from "@/lib/server/admin/stats";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: Add admin role check when user roles are implemented
  // For now, allow all authenticated users (should be restricted to admins)

  try {
    const results = await getCertificationsWithStats();
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching certifications:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
