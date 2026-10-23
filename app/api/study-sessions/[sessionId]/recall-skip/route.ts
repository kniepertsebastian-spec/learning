import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { isStudySessionHidden } from "@/lib/server/catalog/access";
import { skipRecallCheck } from "@/lib/server/recall/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/study-sessions/:sessionId/recall-skip - Rückblick am Session-Anfang überspringen (wird als übersprungen festgehalten). */
export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  if (await isStudySessionHidden(session.user.id, sessionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const removed = await skipRecallCheck(sessionId, session.user.id);
  return NextResponse.json({ removed });
}
