import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { RemediationService } from "@/lib/server/remediation/service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const objectives = await RemediationService.findObjectivesNeedingRemediation(
      session.user.id,
    );
    return NextResponse.json(objectives);
  } catch (error) {
    console.error("Error finding remediation objectives:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
