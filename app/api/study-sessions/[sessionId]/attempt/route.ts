import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import {
  completeStudySession,
  StudySessionNotActiveError,
  StudySessionNotFoundError,
  type StudySessionAnswerInput,
} from "@/lib/server/study/session-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/study-sessions/:sessionId/attempt - R2.3: Session einreichen.
 * Wertet aus, aktualisiert den Review-Zustand jeder Frage (R2.2) und
 * markiert die Session als abgeschlossen.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const body = (await request.json()) as { answers: StudySessionAnswerInput[] };

  try {
    const result = await completeStudySession(sessionId, session.user.id, body.answers ?? []);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StudySessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof StudySessionNotActiveError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Error submitting study session:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
