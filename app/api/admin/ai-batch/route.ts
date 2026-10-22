import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { batchTargetSchema, BatchAlreadyRunningError, BatchNothingToDoError, getBatchStatus, startBatch } from "@/lib/server/course-editor/batch";
import { EditorNotFoundError, EditValidationError } from "@/lib/server/course-editor/service";
import { AiAccessUnavailableError } from "@/lib/server/internal-courses/ai-client";

export const dynamic = "force-dynamic";

const startSchema = batchTargetSchema.extend({ params: z.unknown().optional() });

/** Stand des letzten Sammellaufs einer Art (für einen Kurs oder, ohne `certificationId`, für alle Kurse). */
export async function GET(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const url = new URL(request.url);
  const parsed = batchTargetSchema.safeParse({ kind: url.searchParams.get("kind"), certificationId: url.searchParams.get("certificationId") });
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const run = await getBatchStatus(parsed.data.kind, parsed.data.certificationId);
  return NextResponse.json({ run }, { headers: { "Cache-Control": "no-store" } });
}

/** Startet einen Sammellauf im Hintergrund (nur Admins, nur allgemeine Kurse). */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const body = startSchema.parse(await request.json());
    const { runId } = await startBatch({ kind: body.kind, certificationId: body.certificationId, params: body.params, userId: guard.user.id });
    return NextResponse.json({ runId }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    if (error instanceof EditorNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof BatchAlreadyRunningError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof BatchNothingToDoError || error instanceof AiAccessUnavailableError || error instanceof EditValidationError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
}
