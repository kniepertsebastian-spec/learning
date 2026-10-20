import { NextResponse } from "next/server";
import { z } from "zod";
import { workshopRoute } from "@/lib/server/course-editor/http";
import { createCheckpoint, listCheckpoints } from "@/lib/server/course-editor/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId }) => NextResponse.json({ checkpoints: await listCheckpoints(certId) }));
}

/** Aktuellen Stand des ganzen Kurses unter einem Namen merken. */
export async function POST(request: Request, { params }: { params: Promise<{ certId: string }> }) {
  return workshopRoute(params, async ({ certId, user, audit }) => {
    const body = z.object({ name: z.string().trim().min(1).max(120) }).parse(await request.json());
    const result = await createCheckpoint(certId, body.name, user.id);
    await audit("course.checkpoint_created", "course_checkpoint", result.id, { name: body.name });
    return NextResponse.json(result, { status: 201 });
  });
}
