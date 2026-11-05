import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { decideSecondReview } from "@/lib/server/reviewers/second-review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ verdict: z.enum(["agree", "disagree"]), comment: z.string().max(2000).optional() });
const idSchema = z.string().uuid();

/** POST /api/reviewer/second-review/[id] - Urteil des zweiten Prüfers („stimmt“ oder „stimmt nicht“ mit Begründung). Nur der zugewiesene Prüfer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "reviewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!idSchema.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const result = await decideSecondReview({ id, reviewerUserId: user.id, verdict: parsed.data.verdict, comment: parsed.data.comment });
  if (result === "ok") return NextResponse.json({ ok: true });
  if (result === "comment_required") return NextResponse.json({ error: "comment_required" }, { status: 400 });
  if (result === "already_decided") return NextResponse.json({ error: "already_decided" }, { status: 409 });
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
