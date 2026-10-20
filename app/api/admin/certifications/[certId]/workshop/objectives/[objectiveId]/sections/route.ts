import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { createSection } from "@/lib/server/course-editor/service";
import { sectionSnapshotSchema } from "@/lib/server/course-editor/snapshots";

export const dynamic = "force-dynamic";

/** Neue Lektion am Ende des Lernziels, gleich mit Inhalt. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string; objectiveId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, user, audit }) => {
    const body = z.object({ snapshot: sectionSnapshotSchema }).parse(await request.json());
    const result = await createSection(certId, ids.objectiveId, body.snapshot, { userId: user.id, origin: "manual" });
    await audit("course.section_created", "section", result.sectionId);
    return NextResponse.json(result, { status: 201 });
  });
}
