import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { isStudySessionHidden } from "@/lib/server/catalog/access";
import { declineDeescalatedSession } from "@/lib/server/study/session-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/study-sessions/:sessionId/deescalate-decline - „Nein danke, normal weiter“: die Session wird ohne Entlastung neu gebaut. */
export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  if (await isStudySessionHidden(session.user.id, sessionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const next = await declineDeescalatedSession(sessionId, session.user.id);
  return NextResponse.json({ declined: next !== null });
}
