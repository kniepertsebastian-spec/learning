import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { RemediationService } from "@/lib/server/remediation/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ objectiveId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { objectiveId } = await params;
  const forceRegenerate = request.nextUrl.searchParams.get("regenerate") === "true";

  try {
    const result = await RemediationService.getOrCreateRemediationSession(
      session.user.id,
      objectiveId,
      { forceRegenerate },
    );

    return NextResponse.json({
      sessionId: result.sessionId,
      objectiveId,
      lesson: result.lesson,
      questions: result.questions,
    });
  } catch (error) {
    console.error("Error generating remediation:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
