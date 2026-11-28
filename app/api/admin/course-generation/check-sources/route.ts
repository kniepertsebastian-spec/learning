import { NextResponse } from "next/server";
import { isValidSourceRef } from "@/lib/course-generation/source-refs";
import { z } from "zod";
import { requireAdminApi } from "@/lib/server/auth-guards";
import { checkSources } from "@/lib/server/course-generation/check-sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ sourceUrls: z.array(z.string().refine(isValidSourceRef)).min(1).max(30), primarySourceRef: z.string().optional() });

/**
 * Betreiber: prüft die Quellen vor dem Start (abrufbar, genug Text). Antwort je Adresse: ok oder Fehlermeldung, dazu
 * Zeichenzahl und ob sie gekürzt würde, und die Auslastung des Budgets (`budget`, Quellen-Roadmap AP-3.3).
 */
export async function POST(request: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { sourceUrls, primarySourceRef } = body.data;
  const report = await checkSources(sourceUrls, undefined, undefined, primarySourceRef && sourceUrls.includes(primarySourceRef) ? primarySourceRef : null);
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
