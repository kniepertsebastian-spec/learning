import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/server/auth";
import { reportContent } from "@/lib/server/content-reports/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reportSchema = z.object({
  targetType: z.enum(["question", "lesson"]),
  targetId: z.string().uuid(),
  reason: z.enum(["incorrect", "unclear", "outdated"]),
});

/** POST /api/content-reports - R6 (roadmap.md): "Inhalte als falsch,
 * unklar oder veraltet melden". Jeder eingeloggte Lerner darf melden, keine
 * Admin-Rolle nötig - siehe lib/server/content-reports/service.ts für die
 * Review-Queue-Seite. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  await reportContent({ reporterUserId: session.user.id, ...parsed.data });
  return NextResponse.json({ status: "ok" }, { status: 201 });
}
