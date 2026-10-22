import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { BATCH_KINDS, BatchNothingToDoError, estimateBatch } from "@/lib/server/course-editor/batch";
import { EditorNotFoundError } from "@/lib/server/course-editor/service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({ kind: z.enum(BATCH_KINDS), certificationId: z.string().uuid().nullable().default(null), params: z.unknown().optional() });

/** Wie viel ein Sammellauf bearbeiten würde und was er ungefähr kostet (ohne KI-Aufruf). */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const body = schema.parse(await request.json());
    return NextResponse.json({ estimate: await estimateBatch(body.kind, body.certificationId, body.params) });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    if (error instanceof EditorNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof BatchNothingToDoError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
}
