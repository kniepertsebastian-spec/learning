import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { listRevisions } from "@/lib/server/course-editor/service";

export const dynamic = "force-dynamic";

/** Versionsgeschichte einer Lektion (?type=section) oder Frage (?type=question), neueste zuerst. */
export async function GET(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId }) => {
    const url = new URL(request.url);
    const q = z.object({ type: z.enum(["section", "question"]), id: z.string().uuid() }).parse({ type: url.searchParams.get("type"), id: url.searchParams.get("id") });
    return NextResponse.json({ revisions: await listRevisions(certId, q.type, q.id) });
  }, { reviewers: true });
}
