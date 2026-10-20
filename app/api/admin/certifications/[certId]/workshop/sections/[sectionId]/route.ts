import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { getSectionForEditor, saveSection } from "@/lib/server/course-editor/service";
import { sectionSnapshotSchema } from "@/lib/server/course-editor/snapshots";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ certId: string; sectionId: string }> }) {
  return workshopRoute(params, async ({ certId, ids }) => NextResponse.json(await getSectionForEditor(certId, ids.sectionId)));
}

const putSchema = z.object({ snapshot: sectionSnapshotSchema, baseFingerprint: z.string().min(1).max(64), note: z.string().trim().max(300).optional() });

/** Lektion speichern; der alte Stand wird zur Revision. 409, wenn inzwischen jemand anderes gespeichert hat. */
export async function PUT(request: Request, { params }: { params: Promise<{ certId: string; sectionId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, user, audit }) => {
    const body = putSchema.parse(await request.json());
    const result = await saveSection(certId, ids.sectionId, body.snapshot, body.baseFingerprint, { userId: user.id, origin: "manual", note: body.note || null });
    if (result.changed) await audit("course.section_edited", "section", ids.sectionId);
    return NextResponse.json(result);
  });
}
