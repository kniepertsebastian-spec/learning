import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { reorderSections } from "@/lib/server/course-editor/service";

export const dynamic = "force-dynamic";

/** Reihenfolge der Lektionen eines Lernziels. */
export async function PUT(request: Request, { params }: { params: Promise<{ certId: string; objectiveId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, audit }) => {
    const body = z.object({ sectionIds: z.array(z.string().uuid()).min(1).max(50) }).parse(await request.json());
    await reorderSections(certId, ids.objectiveId, body.sectionIds);
    await audit("course.sections_reordered", "objective", ids.objectiveId);
    return new NextResponse(null, { status: 204 });
  }, { reviewers: true });
}
