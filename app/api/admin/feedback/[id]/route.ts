import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { FeedbackNotFoundError, resolveFeedback } from "@/lib/server/feedback/service";

export const dynamic = "force-dynamic";

const schema = z.object({ status: z.enum(["resolved", "dismissed"]) });

/** POST /api/admin/feedback/:id - Rückmeldung abschließen (erledigt oder verworfen). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    await resolveFeedback(id, guard.user.id, parsed.data.status);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof FeedbackNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
