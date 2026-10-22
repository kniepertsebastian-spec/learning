import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { batchTargetSchema, cancelBatch } from "@/lib/server/course-editor/batch";

export const dynamic = "force-dynamic";

/** Bricht einen laufenden Sammellauf ab; bereits Übernommenes bleibt. */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const body = batchTargetSchema.parse(await request.json());
    return NextResponse.json({ cancelled: await cancelBatch(body.kind, body.certificationId) });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    throw error;
  }
}
