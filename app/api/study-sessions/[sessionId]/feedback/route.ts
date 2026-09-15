import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import {
  setSessionRecommendationFeedback,
  StudySessionNotFoundError,
} from "@/lib/server/study/session-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const feedbackSchema = z.object({ helpful: z.boolean() });

/** POST /api/study-sessions/:sessionId/feedback - R2 (roadmap.md, neue
 * Fassung): "Nutzerfeedback auf Empfehlungen erfassen", Upsert je Session
 * (siehe setSessionRecommendationFeedback). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { sessionId } = await params;
  try {
    await setSessionRecommendationFeedback(sessionId, session.user.id, parsed.data.helpful);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    if (error instanceof StudySessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
