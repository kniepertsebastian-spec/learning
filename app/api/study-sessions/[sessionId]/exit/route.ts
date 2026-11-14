import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/auth";
import { isStudySessionHidden } from "@/lib/server/catalog/access";
import { parseAttemptBody, studySessionExitBody } from "@/lib/server/http/attempt-body";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import {
  exitStudySession,
  StudySessionNotActiveError,
  StudySessionNotFoundError,
} from "@/lib/server/study/session-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/study-sessions/:sessionId/exit - Notausstieg „Heute reicht's“: Session mit den bisherigen Antworten beenden, dann höchstens drei Erfolgsaufgaben. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFeatureEnabled("exit_with_win", session.user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { sessionId } = await params;
  if (await isStudySessionHidden(session.user.id, sessionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await parseAttemptBody(request, studySessionExitBody);
  if (!body.ok) return body.response;

  try {
    return NextResponse.json(await exitStudySession(sessionId, session.user.id, body.data.answers, body.data.openItemId ?? null, { deviceClass: body.data.deviceClass, interruptions: body.data.interruptions }));
  } catch (error) {
    if (error instanceof StudySessionNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof StudySessionNotActiveError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Error exiting study session:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
