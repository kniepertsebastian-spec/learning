import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { deleteProbeSet, getProbeSetForAdmin, saveProbeSet } from "@/lib/server/reviewers/probe-service";
import { errorType, probeErrorResponse, uuid } from "@/lib/server/reviewers/probe-http";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().max(300),
  topic: z.string().max(300),
  language: z.enum(["de", "en"]),
  active: z.boolean(),
  items: z
    .array(
      z.object({
        question: z.string().max(5000),
        options: z.array(z.object({ text: z.string().max(1000), isCorrect: z.boolean() })).max(8),
        explanation: z.string().max(5000),
        plantedError: z.object({ type: errorType, note: z.string().max(1000) }).nullable(),
      }),
    )
    .max(40),
});

/** Betreiber: Satz samt eingebauten Fehlern lesen, speichern (Fragen werden ersetzt) oder löschen. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const set = await getProbeSetForAdmin(id);
  return set ? NextResponse.json(set) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await saveProbeSet(id, schema.parse(await request.json()) as never);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return probeErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return (await deleteProbeSet(id)) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return probeErrorResponse(error);
  }
}
