import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { isStudySessionHidden } from "@/lib/server/catalog/access";
import {
  pauseStudySession,
  StudySessionNotActiveError,
  StudySessionNotFoundError,
  type StudySessionAnswerInput,
} from "@/lib/server/study/session-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/study-sessions/:sessionId/pause - „Pause für heute“: Antworten und Position speichern, die Session später fortsetzen. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  if (await isStudySessionHidden(session.user.id, sessionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { answers?: StudySessionAnswerInput[]; currentIndex?: number; interruptions?: unknown };

  try {
    return NextResponse.json(await pauseStudySession(sessionId, session.user.id, { answers: Array.isArray(body.answers) ? body.answers : [], currentIndex: body.currentIndex ?? 0, interruptions: body.interruptions }));
  } catch (error) {
    if (error instanceof StudySessionNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof StudySessionNotActiveError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Error pausing study session:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
