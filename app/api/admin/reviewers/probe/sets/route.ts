import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { createProbeSet } from "@/lib/server/reviewers/probe-service";
import { probeErrorResponse } from "@/lib/server/reviewers/probe-http";

export const dynamic = "force-dynamic";

/** Betreiber: neuen (leeren, inaktiven) Probe-Review-Satz anlegen. */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  try {
    const body = z.object({ title: z.string().max(300), topic: z.string().max(300), language: z.enum(["de", "en"]) }).parse(await request.json());
    return NextResponse.json({ id: await createProbeSet(guard.user.id, body) }, { status: 201 });
  } catch (error) {
    return probeErrorResponse(error);
  }
}
