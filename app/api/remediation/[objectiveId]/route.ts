import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { RemediationService } from "@/lib/server/remediation/service";

// Jede Neugenerierung ist ein abgerechneter KI-Aufruf - ohne Grenze könnte ein
// einzelnes Konto die KI-Kosten beliebig hochtreiben.
const REGENERATE_WINDOW_MS = 60 * 60 * 1000;
const REGENERATE_LIMIT_PER_USER = 5;

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

  if (forceRegenerate) {
    const limit = checkRateLimit(
      `remediation-regenerate:${session.user.id}`,
      REGENERATE_LIMIT_PER_USER,
      REGENERATE_WINDOW_MS,
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many regenerations. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
  }

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
    // Details nur ins Server-Log - KI-Fehlertexte können Anbieter- oder
    // Kontingentdetails enthalten.
    console.error("Error generating remediation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
