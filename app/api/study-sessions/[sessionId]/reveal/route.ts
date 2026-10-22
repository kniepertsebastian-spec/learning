import { isStudySessionHidden } from "@/lib/server/catalog/access";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import {
  revealStudySessionAnswer,
  StudySessionNotActiveError,
  StudySessionNotFoundError,
} from "@/lib/server/study/session-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const revealSchema = z.object({ itemId: z.string().min(1), selectedOptionId: z.string().min(1) });

/**
 * POST /api/study-sessions/:sessionId/reveal - Sofort-Feedback je Frage (roadmap_didaktik
 * Phase 2). Speichert nichts; die Wertung erfolgt weiterhin über /attempt.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = revealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { sessionId } = await params;
  if (await isStudySessionHidden(session.user.id, sessionId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const result = await revealStudySessionAnswer(
      sessionId,
      session.user.id,
      parsed.data.itemId,
      parsed.data.selectedOptionId,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StudySessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof StudySessionNotActiveError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Error revealing study session answer:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
