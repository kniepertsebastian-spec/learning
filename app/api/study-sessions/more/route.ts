import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { startMoreStudySession } from "@/lib/server/study/session-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ certificationId: z.string().uuid() });

/** POST /api/study-sessions/more - „Mehr lernen“: nach einer abgeschlossenen Session eine weitere mit höherem Limit. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  if (await isCertificationHidden(session.user.id, parsed.data.certificationId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const built = await startMoreStudySession(session.user.id, parsed.data.certificationId);
  if (!built) return NextResponse.json({ error: "Mehr lernen ist erst nach einer abgeschlossenen Session möglich." }, { status: 409 });
  return NextResponse.json({ session: built }, { status: 201 });
}
