import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { aiAcceptSchema, aiNote, ensureAiCheckpoint, finishAiAccept } from "@/lib/server/course-editor/ai";
import { deleteSection, getSectionForEditor, saveSection } from "@/lib/server/course-editor/service";
import { sectionSnapshotSchema } from "@/lib/server/course-editor/snapshots";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ certId: string; sectionId: string }> }) {
  return workshopRoute(params, async ({ certId, ids }) => NextResponse.json(await getSectionForEditor(certId, ids.sectionId)), { reviewers: true });
}

const putSchema = z.object({ snapshot: sectionSnapshotSchema, baseFingerprint: z.string().min(1).max(64), note: z.string().trim().max(300).optional(), ai: aiAcceptSchema.optional() });

/**
 * Lektion speichern; der alte Stand wird zur Revision. 409, wenn inzwischen jemand anderes gespeichert hat. Mit `ai`
 * ist es ein übernommener KI-Vorschlag: vorher gemerkter Kursstand, Herkunft „KI“, andere Sprache wird nachgezogen.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ certId: string; sectionId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, user, audit }) => {
    const body = putSchema.parse(await request.json());
    if (body.ai && user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!body.ai) {
      const result = await saveSection(certId, ids.sectionId, body.snapshot, body.baseFingerprint, { userId: user.id, origin: "manual", note: body.note || null });
      if (result.changed) await audit("course.section_edited", "section", ids.sectionId);
      return NextResponse.json(result);
    }
    const { name } = await ensureAiCheckpoint(certId, user.id);
    const result = await saveSection(certId, ids.sectionId, body.snapshot, body.baseFingerprint, { userId: user.id, origin: "ai", note: aiNote(body.ai.action, body.note) });
    if (result.changed) await audit("course.section_edited", "section", ids.sectionId, { origin: "ai", action: body.ai.action });
    const after = await finishAiAccept(certId, { sections: [ids.sectionId] }, { userId: user.id, resolveReports: body.ai.resolveReports, checkpoint: name });
    return NextResponse.json({ ...result, ...after });
  }, { reviewers: true });
}

/** Lektion löschen; der letzte Stand bleibt als Version erhalten. Admins und der zugewiesene Prüfer. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ certId: string; sectionId: string }> }) {
  return workshopRoute(params, async ({ certId, ids, user, audit }) => {
    const result = await deleteSection(certId, ids.sectionId, { userId: user.id, origin: "manual" });
    await audit("course.section_deleted", "section", ids.sectionId, { objectiveId: result.objectiveId });
    return new NextResponse(null, { status: 204 });
  }, { reviewers: true });
}
