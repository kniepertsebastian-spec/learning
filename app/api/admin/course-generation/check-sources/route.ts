import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { checkSources } from "@/lib/server/course-generation/check-sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ sourceUrls: z.array(z.string().url()).min(1).max(30) });

/** Betreiber: prüft die Quellen vor dem Start (abrufbar, genug Text). Antwort je Adresse: ok oder Fehlermeldung. */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  return NextResponse.json({ results: await checkSources(body.data.sourceUrls) }, { headers: { "Cache-Control": "no-store" } });
}
