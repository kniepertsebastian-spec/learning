import { NextResponse } from "next/server";
import { requireReviewerUserApi } from "@/lib/server/reviewers/guard";
import { probeErrorResponse, uuid } from "@/lib/server/reviewers/probe-http";
import { submitAttempt } from "@/lib/server/reviewers/probe-service";

export const dynamic = "force-dynamic";

/** Prüfer: Versuch abgeben. Antwort nur „bestanden“ oder „nicht bestanden“ (Einzelheiten sind intern). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireReviewerUserApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { passed, nextAttemptAt } = await submitAttempt(guard.user.id, id);
    return NextResponse.json({ passed, nextAttemptAt: nextAttemptAt ? nextAttemptAt.toISOString() : null });
  } catch (error) {
    return probeErrorResponse(error);
  }
}
