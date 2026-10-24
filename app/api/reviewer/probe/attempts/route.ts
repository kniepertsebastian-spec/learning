import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { probeErrorResponse } from "@/lib/server/reviewers/probe-http";
import { startAttempt } from "@/lib/server/reviewers/probe-service";

export const dynamic = "force-dynamic";

/** Prüfer: einen Probe-Review-Versuch beginnen (oder den offenen fortsetzen). */
export async function POST(request: Request) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  try {
    const { setId } = z.object({ setId: z.string().uuid() }).parse(await request.json());
    return NextResponse.json({ id: await startAttempt(guard.user.id, setId) }, { status: 201 });
  } catch (error) {
    return probeErrorResponse(error);
  }
}
